# 작업 티켓 - v0.2.9

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | Per-Tool Result 타입 정의 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | ToolResultEntry Discriminated Union 재정의 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | ControlMessage Discriminated Union 재정의 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | index.ts 호출부 수정 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 05 | 테스트 업데이트 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 ──→ 02    (ToolResultEntry가 per-tool result 타입을 참조)
03 ──→ 04    (index.ts가 ControlMessage 타입을 import)
01, 02, 03 ──→ 05  (테스트가 모든 새 타입을 사용)
```

> Step 01과 Step 03은 서로 독립적 (별도 파일). 병렬 진행 가능.

## 영향 파일 매트릭스

| 파일 | Step 01 | Step 02 | Step 03 | Step 04 | Step 05 |
|------|---------|---------|---------|---------|---------|
| `packages/daemon/src/tool-surface.ts` | ✏️ | | | | |
| `packages/daemon/src/tool-call-loop.ts` | | ✏️ | | | |
| `packages/daemon/src/control-handler.ts` | | | ✏️ | | |
| `packages/daemon/src/index.ts` | | | | ✏️ | |
| `packages/daemon/tests/tool-surface.test.ts` | | | | | ✏️ |
| `packages/daemon/tests/control-handler.test.ts` | | | | | ✏️ |

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| ToolResult → 도구별 discriminated union | Step 01, 02 | ✅ |
| ControlPayload → 메시지별 discriminated union | Step 03 | ✅ |
| `[key:string]:unknown` 제거 | Step 03 | ✅ |
| 외부 DTO 계약 명확화 (relay `chat.done` payload 포함) | Step 01, 02 (wire 형태 유지 확인) | ✅ |
| toSignedApproval 암묵적 필드 접근 제거 | Step 03 | ✅ |
| wire JSON 유지 | Step 01 (F6), Step 02 (N2), Step 04 (F14) | ✅ |
| Control wire는 daemon 내부 타입만 변경 | Step 03, 04 | ✅ |
| ControlResult 범위 제외 (현재 구조 유지) | Step 03 (F13) | ✅ |

### DoD 항목 → 티켓

| DoD 항목 | 설명 | 관련 티켓 | 커버 |
|----------|------|----------|------|
| F1 | ToolResult wide optional bag 제거 | Step 01 | ✅ |
| F2 | AnyToolResult union 존재 | Step 01 | ✅ |
| F3a~F3l | 12개 per-tool result 타입 정의 | Step 01 | ✅ |
| F4a~F4l | ToolResultEntry 12개 variant | Step 02 | ✅ |
| F5 | ToolResultEntry unknown fallback variant | Step 02 | ✅ |
| F6 | status-less 성공 응답 6종 유지 | Step 01 | ✅ |
| F7 | `[key: string]: unknown` 제거 | Step 03 | ✅ |
| F8a~F8g | ControlMessage 7개 variant | Step 03 | ✅ |
| F9 | SignedApprovalFields 인터페이스 | Step 03 | ✅ |
| F10a~F10d | SignedApprovalFields에 targetHash/policyVersion/expiresAt/nonce 명시 | Step 03 | ✅ |
| F11 | toSignedApproval이 SignedApprovalFields를 받음 | Step 03 | ✅ |
| F12 | 7개 variant payload 타입 존재 | Step 03 | ✅ |
| F13 | ControlResult 변경 없음 | Step 03 | ✅ |
| F14 | as ControlMessage 캐스트 + TODO 주석 | Step 04 | ✅ |
| N1 | 새 타입 에러 미발생 (tsc) | Step 01, 02, 03, 04, 05 | ✅ |
| N2 | wire JSON 형태 변경 없음 | Step 02 | ✅ |
| E1 | unknown tool fallback variant | Step 02 | ✅ |
| E2 | PolicyApprovalPayload extends SignedApprovalFields | Step 03 | ✅ |
| E3 | status-less 도구 wire 형태 유지 | Step 01 (F6) | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| 대안 A: name-discriminated ToolResultEntry union | Step 01, 02 | ✅ |
| 대안 D: type-discriminated ControlMessage union | Step 03 | ✅ |
| TD-1: per-tool result 타입을 tool-surface.ts에 선언 | Step 01 | ✅ |
| TD-2: ToolErrorResult + IntentErrorResult 분리 (No Optional) | Step 01 | ✅ |
| TD-3: toSignedApproval 입력 타입 SignedApprovalFields 전환 | Step 03 | ✅ |
| TD-4: executeToolCall 반환 타입 AnyToolResult (오버로드 없음) | Step 01 | ✅ |
| TD-5: status 없는 성공 유지 (wire 변경 없음) | Step 01 | ✅ |
| TD-6: wire 변환 경계 (as ControlMessage 캐스트 + TODO) | Step 04 | ✅ |
| R-1: unknown tool variant로 name 타입 좁힘 처리 | Step 02 | ✅ |
| R-2: 테스트 payload 필드 보완 + 팩토리 함수 | Step 05 | ✅ |
| R-3: ToolResult deprecated alias로 후방 호환 | Step 01 | ✅ |
| R-4: ToolResultEntry wire 형태 유지 | Step 02 | ✅ |
| ControlResult 범위 제외 | Step 03 (F13) | ✅ |
| SignedApprovalFields 공통 추출 | Step 03 | ✅ |

### 누락 검증

- PRD 목표: 8개 모두 커버됨. 누락 없음.
- DoD 항목: F1~F14, N1~N2, E1~E3 모두 커버됨. 누락 없음.
- 설계 결정: TD-1~TD-6, R-1~R-4, 대안 A/D, 범위 제외 모두 커버됨. 누락 없음.

## Step 상세
- [Step 01: Per-Tool Result 타입 정의](step-01-per-tool-result-types.md)
- [Step 02: ToolResultEntry Discriminated Union 재정의](step-02-tool-result-entry-union.md)
- [Step 03: ControlMessage Discriminated Union 재정의](step-03-control-message-union.md)
- [Step 04: index.ts 호출부 수정](step-04-index-callsite.md)
- [Step 05: 테스트 업데이트](step-05-test-update.md)
