# Dead Code 정리 (Pairing 전면 제거) - v0.3.4

## 문제 정의

### 현상
daemon/protocol/app 3개 패키지에 걸쳐 pairing 관련 dead code와 daemon 내부 원칙 위반 코드가 존재한다.

**Pairing dead path (daemon + protocol + app):**
1. `PairingSession` + `pairing_confirm` case — daemon `index.ts:65`의 `const pairingSession = null`이 재할당 불가하므로 항상 실패
2. `PairingConfirmPayload` + `ControlMessage` union variant — protocol 타입이 daemon에서 처리 불가
3. `PairingService.ts` + SettingsScreen pairing UI — app에서 pairing 시도해도 daemon이 항상 거부

**Daemon 원칙 위반/dead code:**
4. `handleChatMessage`의 optional `queueManager` — 항상 전달 (No Optional 위반)
5. `handleChatMessage`의 else 분기 — 실행되지 않는 fallback (No Fallback 위반)
6. `ToolResult` deprecated alias — 미사용
7. `listPending()` + `PendingMessageRequest` — 프로덕션 코드에서 미호출
8. `getQueue()` public → private — 내부에서만 사용

**Incidental cleanup:**
9. 중복 JSDoc (`relay-client.ts:159-162`)

### 원인
- Pairing: daemon이 pairing session 개시 코드를 구현하지 않음 (const null). v0.3.0에서 enrollment code 방식 도입으로 pairing 경로가 사실상 폐기됨
- 나머지: 점진적 개발 과정에서 누적된 미사용/원칙 위반 코드

### 영향
- App 사용자가 Settings → "Scan Daemon QR Code"로 pairing 시도 시 항상 실패 (daemon 거부)
- No Fallback / No Optional 설계 원칙 위반
- 코드를 읽는 사람에게 불필요한 혼란 유발

### 목표
- Pairing 관련 코드를 daemon/protocol/app 3개 패키지에서 전면 제거
- Daemon 내부 원칙 위반/dead code 정리
- 설계 원칙(No Fallback, No Optional) 준수 복원

### 비목표 (Out of Scope)
- E2E 암호화 인프라 제거 (RelayClient의 setSessionKey/encrypt/decrypt — 향후 다른 메커니즘으로 재사용 가능)
- dead code 탐지 CI 체크 추가

## pairing 전면 제거 결정 근거

**사용자 확정 결정**: "전부 다 하자" — daemon/protocol/app의 pairing 코드 전면 제거

**daemon 측**: `const pairingSession = null` — session 개시 불가, 항상 실패
**app 측**: SettingsScreen에 pairing UI가 있으나 daemon이 거부하므로 사실상 dead UI
**protocol 측**: `PairingConfirmPayload`는 daemon이 처리 불가한 dead variant

## 패키지별 영향 분석

| 패키지 | IN/OUT | 영향 내용 |
|--------|--------|-----------|
| **daemon/src** | IN | PairingSession + pairing_confirm 제거, chat-handler 원칙 복원, misc dead code |
| **daemon/tests** | IN | pairing_confirm 테스트 3건 + listPending 테스트 제거 |
| **protocol/src** | IN | `PairingConfirmPayload` + `ControlMessage` variant + barrel export 정리 |
| **app/src** | IN | PairingService.ts 삭제, SettingsScreen pairing UI 제거, pairing 관련 주석 정리 |
| **app/tests** | IN | PairingService.test.js 삭제 |

## 제약사항
- `_processChatDirect` export는 유지 (queue processor 콜백으로 사용 중)
- E2E 암호화 인프라(RelayClient.setSessionKey 등)는 유지 — pairing 관련 주석만 정리

## 참조
- 작업위임서: `docs/handover/daemon-dead-code-cleanup.md`
- Daemon 도메인 분석: `docs/report/daemon-domain-aggregate-analysis.md`
