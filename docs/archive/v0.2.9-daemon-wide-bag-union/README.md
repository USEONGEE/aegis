# Daemon Wide-Bag Union 분리 - v0.2.9

## 문제 정의

### 현상
Daemon 패키지의 `ToolResult`와 `ControlPayload` 타입이 wide optional bag 패턴을 사용하고 있다.

- `ToolResult` (tool-surface.ts:34): 12개 도구의 응답을 하나의 인터페이스에 모든 필드를 optional로 넣어 공유. `status`, `hash`, `fee`, `balances`, `policies`, `cronId`, `rejections` 등 전혀 다른 도메인의 필드가 뒤섞여 있음.
- `ControlPayload` (control-handler.ts:17): 정책 승인, 지갑 생성/삭제, 페어링, 메시지 취소를 하나의 wide payload에 넣고, `[key: string]: unknown`으로 인덱스 시그니처까지 있어 메시지별 계약이 사라짐.

### 원인
초기 구현에서 편의를 위해 통합 타입을 사용했고, 도구/메시지 종류가 늘어나면서 optional 필드가 계속 추가됨. 타입 수준의 도구별/메시지별 구분이 없는 상태.

### 영향
1. **타입 안전성 부재**: `sendTransaction` 결과에 `cronId`가 존재할 수 없지만 타입상 허용됨. `toSignedApproval()`이 `targetHash`, `policyVersion`, `nonce` 등 인터페이스에 명시되지 않은 필드를 읽음.
2. **외부 계약 불명확**: `ToolResult`가 chat-handler.ts:115를 통해 relay `chat.done` payload로 외부에 나감. 앱 입장에서 어떤 필드가 올지 예측 불가.
3. **변경 전파 과다**: 한 도구의 응답 필드를 바꾸면 ToolResult 전체에 영향. 한 제어 메시지의 필드를 바꾸면 ControlPayload 전체에 영향.
4. **그래프 직교성 위반**: Layer 0 leaf 타입이 비직교 — Codex 검증에서 P1(ToolResult) + P2(ControlPayload) 우선순위로 지적됨.

### 목표
- **ToolResult**: `ToolResultEntry.name`을 discriminant로 사용하여 도구별 union으로 분리. `ToolResultEntry` 자체가 `{ name: 'sendTransaction', result: SendTransactionResult } | { name: 'getBalance', result: GetBalanceResult } | ...` 형태의 discriminated union이 됨. 기존 `ToolResult` optional bag 제거.
- **ControlMessage**: `ControlMessage.type`을 discriminant로 사용하여 `ControlMessage` 전체를 `{ type: 'policy_approval', payload: PolicyApprovalPayload } | { type: 'wallet_create', payload: WalletCreatePayload } | ...` 형태의 discriminated union으로 재정의. 각 payload를 variant별로 분리. 기존 `ControlPayload` wide bag + `[key: string]: unknown` 인덱스 시그니처 제거.
- 외부로 나가는 DTO의 계약을 명확하게 정의 (relay `chat.done` payload 포함)
- Control 쪽은 **daemon 내부 타입만** discriminated union으로 변경. wire JSON (relay/app 간 프로토콜)은 이번 Phase 범위가 아님.

### 비목표 (Out of Scope)
- WDKContext 분해 (v0.2.10에서 처리)
- TOOL_DEFINITIONS 모듈 분리 (v0.2.11에서 처리)
- Cron/Queue 타입 중복 제거 (v0.2.11에서 처리)
- 도구 자체의 기능 변경
- Relay wire JSON 프로토콜 변경 (daemon 내부 타입만 변경)
- relay/app과 공유하는 DTO 선언 변경

## 제약사항
- Breaking change 적극 허용 (CLAUDE.md 원칙)
- v0.2.7, v0.2.8과 충돌하지 않도록 주의 (별도 패키지/별도 관심사)
- daemon 패키지 내부 리팩토링이므로 guarded-wdk 변경 불필요
