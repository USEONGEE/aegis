# DoD (Definition of Done) - v0.2.9

## 기능 완료 조건

### ToolResult → Discriminated Union

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `ToolResult` wide optional bag 인터페이스 제거됨 | `rg 'export interface ToolResult' packages/daemon/src/tool-surface.ts` 결과 0건 |
| F2 | `AnyToolResult` union 타입 존재 | `rg 'type AnyToolResult' packages/daemon/src/tool-surface.ts` 1건 |
| F3a | `SendTransactionResult` 타입 정의됨 | `rg 'type SendTransactionResult' packages/daemon/src/tool-surface.ts` 1건 |
| F3b | `TransferResult` 타입 정의됨 | `rg 'type TransferResult' packages/daemon/src/tool-surface.ts` 1건 |
| F3c | `GetBalanceResult` 타입 정의됨 | `rg 'type GetBalanceResult' packages/daemon/src/tool-surface.ts` 1건 |
| F3d | `PolicyListResult` 타입 정의됨 | `rg 'type PolicyListResult' packages/daemon/src/tool-surface.ts` 1건 |
| F3e | `PolicyPendingResult` 타입 정의됨 | `rg 'type PolicyPendingResult' packages/daemon/src/tool-surface.ts` 1건 |
| F3f | `PolicyRequestResult` 타입 정의됨 | `rg 'type PolicyRequestResult' packages/daemon/src/tool-surface.ts` 1건 |
| F3g | `RegisterCronResult` 타입 정의됨 | `rg 'type RegisterCronResult' packages/daemon/src/tool-surface.ts` 1건 |
| F3h | `ListCronsResult` 타입 정의됨 | `rg 'type ListCronsResult' packages/daemon/src/tool-surface.ts` 1건 |
| F3i | `RemoveCronResult` 타입 정의됨 | `rg 'type RemoveCronResult' packages/daemon/src/tool-surface.ts` 1건 |
| F3j | `SignTransactionResult` 타입 정의됨 | `rg 'type SignTransactionResult' packages/daemon/src/tool-surface.ts` 1건 |
| F3k | `ListRejectionsResult` 타입 정의됨 | `rg 'type ListRejectionsResult' packages/daemon/src/tool-surface.ts` 1건 |
| F3l | `ListPolicyVersionsResult` 타입 정의됨 | `rg 'type ListPolicyVersionsResult' packages/daemon/src/tool-surface.ts` 1건 |
| F4a | ToolResultEntry variant: sendTransaction | `rg "name: 'sendTransaction'" packages/daemon/src/tool-call-loop.ts` 1건 |
| F4b | ToolResultEntry variant: transfer | `rg "name: 'transfer'" packages/daemon/src/tool-call-loop.ts` 1건 |
| F4c | ToolResultEntry variant: getBalance | `rg "name: 'getBalance'" packages/daemon/src/tool-call-loop.ts` 1건 |
| F4d | ToolResultEntry variant: policyList | `rg "name: 'policyList'" packages/daemon/src/tool-call-loop.ts` 1건 |
| F4e | ToolResultEntry variant: policyPending | `rg "name: 'policyPending'" packages/daemon/src/tool-call-loop.ts` 1건 |
| F4f | ToolResultEntry variant: policyRequest | `rg "name: 'policyRequest'" packages/daemon/src/tool-call-loop.ts` 1건 |
| F4g | ToolResultEntry variant: registerCron | `rg "name: 'registerCron'" packages/daemon/src/tool-call-loop.ts` 1건 |
| F4h | ToolResultEntry variant: listCrons | `rg "name: 'listCrons'" packages/daemon/src/tool-call-loop.ts` 1건 |
| F4i | ToolResultEntry variant: removeCron | `rg "name: 'removeCron'" packages/daemon/src/tool-call-loop.ts` 1건 |
| F4j | ToolResultEntry variant: signTransaction | `rg "name: 'signTransaction'" packages/daemon/src/tool-call-loop.ts` 1건 |
| F4k | ToolResultEntry variant: listRejections | `rg "name: 'listRejections'" packages/daemon/src/tool-call-loop.ts` 1건 |
| F4l | ToolResultEntry variant: listPolicyVersions | `rg "name: 'listPolicyVersions'" packages/daemon/src/tool-call-loop.ts` 1건 |
| F5 | ToolResultEntry unknown fallback variant | `rg 'name: string' packages/daemon/src/tool-call-loop.ts` 1건 |
| F6 | status-less 성공 응답 6종(getBalance, policyList, policyPending, listCrons, listRejections, listPolicyVersions)에 status 강제 추가하지 않음 | `sed -n '/interface GetBalanceSuccess/,/^}/p' packages/daemon/src/tool-surface.ts` 에서 status 필드 없음 확인. 나머지 5종도 동일 패턴으로 확인. (removeCron은 status:'removed' 유지 — 별개) |

### ControlMessage → Discriminated Union

| # | 조건 | 검증 방법 |
|---|------|----------|
| F7 | `ControlPayload`의 `[key: string]: unknown` 인덱스 시그니처 제거됨 | `rg '\[key: string\]' packages/daemon/src/control-handler.ts` 결과 0건 |
| F8a | ControlMessage variant: policy_approval | `rg "type: 'policy_approval'" packages/daemon/src/control-handler.ts` 1건 |
| F8b | ControlMessage variant: policy_reject | `rg "type: 'policy_reject'" packages/daemon/src/control-handler.ts` 1건 |
| F8c | ControlMessage variant: device_revoke | `rg "type: 'device_revoke'" packages/daemon/src/control-handler.ts` 1건 |
| F8d | ControlMessage variant: wallet_create | `rg "type: 'wallet_create'" packages/daemon/src/control-handler.ts` 1건 |
| F8e | ControlMessage variant: wallet_delete | `rg "type: 'wallet_delete'" packages/daemon/src/control-handler.ts` 1건 |
| F8f | ControlMessage variant: pairing_confirm | `rg "type: 'pairing_confirm'" packages/daemon/src/control-handler.ts` 1건 |
| F8g | ControlMessage variant: cancel_message | `rg "type: 'cancel_message'" packages/daemon/src/control-handler.ts` 1건 |
| F9 | `SignedApprovalFields` 공통 인터페이스 존재 | `rg 'interface SignedApprovalFields' packages/daemon/src/control-handler.ts` 1건 |
| F10a | `targetHash` 필드가 `SignedApprovalFields`에 명시됨 | `rg 'targetHash' packages/daemon/src/control-handler.ts` 1건 이상 |
| F10b | `policyVersion` 필드가 `SignedApprovalFields`에 명시됨 | `rg 'policyVersion' packages/daemon/src/control-handler.ts` 1건 이상 |
| F10c | `expiresAt` 필드가 `SignedApprovalFields`에 명시됨 | `rg 'expiresAt' packages/daemon/src/control-handler.ts` 1건 이상 |
| F10d | `nonce` 필드가 `SignedApprovalFields`에 명시됨 | `rg 'nonce' packages/daemon/src/control-handler.ts` 1건 이상 |
| F11 | `toSignedApproval`이 `SignedApprovalFields`를 받음 | `rg 'toSignedApproval.*SignedApprovalFields' packages/daemon/src/control-handler.ts` 1건 |
| F12 | 7개 variant payload 타입 존재 | `rg 'PolicyApprovalPayload' packages/daemon/src/control-handler.ts` 1건 + `rg 'PairingConfirmPayload' packages/daemon/src/control-handler.ts` 1건 + `rg 'CancelMessagePayload' packages/daemon/src/control-handler.ts` 1건 |

### Wire 호환 + 범위 유지

| # | 조건 | 검증 방법 |
|---|------|----------|
| F13 | `ControlResult` 인터페이스 변경 없음 | `git diff HEAD -- packages/daemon/src/control-handler.ts` 에서 `ControlResult` 정의 블록의 diff 없음 |
| F14 | Control wire parse는 `as ControlMessage` 캐스트 + TODO 주석 | `rg 'as ControlMessage' packages/daemon/src/` 1건 + `rg 'TODO' packages/daemon/src/index.ts` 1건 이상 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 이번 Phase 변경으로 새 타입 에러 미발생 | `npx tsc -p packages/daemon/tsconfig.json --noEmit --pretty false 2>&1 > /tmp/tsc-after.txt && diff /tmp/tsc-baseline.txt /tmp/tsc-after.txt` 차이 없음. baseline은 Step 5 시작 전 현재 에러를 `/tmp/tsc-baseline.txt`에 스냅샷 |
| N2 | wire JSON 형태 변경 없음 (ToolResultEntry 필드셋 유지) | `rg 'toolCallId' packages/daemon/src/tool-call-loop.ts` 1건 이상 + `rg 'name:' packages/daemon/src/tool-call-loop.ts` 12건 이상 + `rg 'args:' packages/daemon/src/tool-call-loop.ts` 1건 이상 + `rg 'result:' packages/daemon/src/tool-call-loop.ts` 1건 이상 — ToolResultEntry의 4개 필드(toolCallId, name, args, result) 유지 확인 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | unknown tool name이 executeToolCall에 전달됨 | ToolErrorResult 반환, fallback variant 매칭 | `rg 'name: string' packages/daemon/src/tool-call-loop.ts` 1건 (fallback variant) |
| E2 | policy_approval payload에 추가 policies 필드 존재 | PolicyApprovalPayload extends SignedApprovalFields | `rg 'PolicyApprovalPayload extends' packages/daemon/src/control-handler.ts` 1건 |
| E3 | getBalance 등 성공 시 status 필드 없는 도구 | status 강제 추가 없이 기존 wire 형태 유지 | F6 검증 |

## 커버리지 매핑

### PRD 목표 → DoD

| PRD 목표 | DoD 항목 |
|----------|---------|
| ToolResult → 도구별 discriminated union | F1, F2, F3a~F3l, F4a~F4l, F5 |
| ControlPayload → 메시지별 discriminated union | F7, F8a~F8g, F9, F12 |
| [key:string]:unknown 제거 | F7 |
| 외부 DTO 계약 명확화 | F13, N2 |
| toSignedApproval 암묵적 필드 접근 제거 | F10a~F10d, F11 |
| wire JSON 유지 | F6, N2, E3 |

### 설계 결정 → DoD

| 설계 결정 | DoD 항목 |
|----------|---------|
| ToolResultEntry.name discriminant (대안 A) | F4a~F4l |
| ControlMessage.type discriminant (대안 D) | F8a~F8g |
| SignedApprovalFields 공통 추출 | F9, F10a~F10d |
| ControlResult 범위 제외 | F13 |
| as ControlMessage 캐스트 + TODO | F14 |
| unknown tool fallback variant | F5, E1 |
| TD-5: status 없는 성공 유지 | F6, E3 |
