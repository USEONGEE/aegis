# 프로토콜 타입 중복 제거 + 취소 API 분리 - v0.3.2

## 문제 정의

### 현상

#### A. daemon/app 간 wire 타입 중복 정의

daemon과 app이 동일한 wire 프로토콜의 타입을 **각각 독자적으로 정의**하고 있다.

1. **SignedApproval wire 타입**: daemon의 `SignedApprovalFields` (control-handler.ts:12)와 app의 `SignedApprovalPayload` (types.ts:70)가 같은 데이터를 다른 필드명으로 정의. daemon은 `signature`/`approverPubKey`, guarded-wdk는 `sig`/`approver`를 사용하여 변환 함수(`toSignedApproval`)가 필요.

2. **ChatMessage 네이밍 충돌**: daemon 내부에 같은 이름 `ChatMessage`가 2개 존재 — relay 메시지용 (chat-handler.ts:11: `{ userId, sessionId, text }`)과 OpenClaw SDK용 (openclaw-client.ts:9: `{ role, content, tool_calls? }`). app도 별도 `ChatMessage` union을 정의 (useChatStore.ts:44).

3. **ControlMessage/ControlResult**: daemon에만 정의. app은 relay 메시지를 `as any`로 해석.

4. **RelayClient**: daemon (relay-client.ts:43, 338줄)과 app (RelayClient.ts:48, 436줄)이 거의 동일한 기능(reconnect, heartbeat, NaCl E2E 암호화)을 독립 구현. tweetnacl 기반 encrypt/decrypt 로직이 양쪽에 복제.

5. **해시 함수**: daemon은 `node:crypto`의 `createHash('sha256')`, app은 `jsSha256()` 직접 구현. canonical 패키지에 `intentHash`/`policyHash`가 있지만 양쪽 다 사용하지 않음.

#### B. 메시지 취소 API 미분리

현재 `cancel_message` 제어 메시지 하나로 2가지 시나리오를 처리하지만, 구분이 명시적이지 않고 active 취소가 불완전하다.

1. **큐 대기 메시지 제거** (cancel_queued): `SessionMessageQueue.cancel()`이 큐에서 splice — 정상 동작.
2. **진행중 메시지 중단** (cancel_active): `abortController.abort()` 호출 — 하지만 `AbortSignal`이 `processChat()` 루프 시작 부분에서만 체크됨 (tool-call-loop.ts:80). **OpenClaw HTTP 요청 자체는 중단되지 않음**. `executeToolCall()` 실행 중에도 signal이 전파되지 않음.

### 원인

- daemon과 app이 별도 패키지로 독립 개발되면서 wire 타입을 각각 정의
- canonical 패키지가 해시 함수만 포함하고 wire 프로토콜 타입을 담지 않음
- cancel_message가 초기 구현에서 단일 메시지 타입으로 시작했고, AbortSignal 전파 경로가 루프 레벨에서 멈춤

### 영향

1. **유지보수 비용**: wire 프로토콜 필드를 변경하면 daemon/app 양쪽에서 독립적으로 수정 + 테스트 필요. 필드명 불일치로 변환 로직이 버그 위험.
2. **네이밍 충돌**: daemon 내부 `ChatMessage` 2중 정의로 import 시 혼란.
3. **코드 복제**: RelayClient E2E 암호화 로직 ~50줄이 양쪽에 복제.
4. **취소 불완전**: 사용자가 "취소" 누르면 큐 제거는 즉시지만, 진행중인 AI 요청은 응답이 올 때까지 리소스 점유. OpenClaw API 비용도 계속 발생.

### 목표

1. **`@wdk-app/protocol` 패키지 신규 생성**: daemon/app이 공유하는 wire 프로토콜 타입을 한 곳에서 정의
   - ControlMessage union, SignedApprovalFields, ControlResult
   - relay wire ChatMessage (relay 채널용)
   - relay envelope (channel, type, payload 구조)
2. **daemon의 relay ChatMessage 네이밍 정리**: relay용은 `RelayChatInput`으로 변경하여 OpenClaw SDK용 `ChatMessage`와 구분. OpenClaw용은 daemon 내부 전용이므로 protocol 패키지에 포함하지 않고 현재 이름 유지
3. **취소 API 명시적 분리**:
   - `cancel_queued`: 큐 대기 메시지 제거 (기존 동작 유지)
   - `cancel_active`: 진행중 메시지 중단 — AbortSignal을 OpenClaw SDK까지 전파하여 HTTP 요청 실제 중단
### 비목표 (Out of Scope)

- E2E 암호화 공통 모듈 추출 (RelayClient의 encrypt/decrypt 중복은 관찰만 — 후속 Phase에서 처리)
- RelayClient 구현 통합 (daemon은 Node.js ws, app은 RN WebSocket — 플랫폼 차이로 통합 불가)
- relay 서버 코드 변경 (v0.3.0 범위)
- 해시 함수 중복 제거 (daemon의 node:crypto vs app의 jsSha256 — 플랫폼 의존성으로 이번 Phase 범위 밖)
- canonical 패키지 확장
- guarded-wdk 내부 타입 변경
- v0.3.0의 relay 프로토콜 변경 반영 (v0.3.0 완료 후 별도 작업)

## 제약사항

- v0.3.0, v0.3.1과 독립 진행 가능 (현재 wire 프로토콜 기준으로 작업)
- `@wdk-app/protocol` 패키지는 Node.js와 React Native 양쪽에서 import 가능해야 함 (순수 TS, 플랫폼 의존성 없음). **wire 타입/envelope만 포함, crypto 제외.**
- Breaking change 허용 (이 repo의 Phase 버전은 npm semver와 별개. CLAUDE.md 원칙: "Breaking change 적극 허용")
- OpenAI SDK가 AbortSignal을 지원하는지 확인 필요 (지원하면 전파, 미지원이면 대안 설계)
