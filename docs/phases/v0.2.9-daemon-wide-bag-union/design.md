# v0.2.9 Design -- ToolResult / ControlMessage Discriminated Union

## 1. 요약

daemon 패키지의 두 wide optional bag 타입(`ToolResult`, `ControlPayload`)을 각각 discriminated union으로 전환한다. wire JSON(relay 프로토콜)은 변경하지 않고 TypeScript 타입 시스템과 분기 로직만 재구성한다.

**변경 범위**: daemon 패키지 내부 4개 소스 파일 + 2개 테스트 파일.
**변경 규모**: Medium (타입 재정의 + switch 분기 반환 타입 교체, 로직 변경 없음).

---

## 2. 현재 상태 분석

### 2.1 ToolResult (tool-surface.ts:34-54)

```typescript
export interface ToolResult {
  status?: string
  hash?: string | null
  fee?: string | null
  intentHash?: string
  error?: string
  reason?: string
  requestId?: string
  signedTx?: string
  policyHash?: string
  token?: string
  amount?: string
  cronId?: string
  balances?: unknown[]
  policies?: unknown[]
  pending?: unknown[]
  crons?: unknown[]
  context?: unknown
  rejections?: unknown[]
  policyVersions?: unknown[]
}
```

**문제점**:
- 19개 optional 필드가 하나의 인터페이스에 혼합. `sendTransaction` 결과에 `cronId`가 타입상 허용됨.
- `status` 필드의 값(`'executed'`, `'rejected'`, `'error'`, `'duplicate'`, `'pending'`, `'registered'`, `'removed'`, `'signed'`)이 문자열 리터럴이 아닌 `string`으로 선언되어 exhaustiveness check 불가.
- tool-call-loop.ts에서 `ToolResultEntry.name`이 `string`이므로 `ToolResultEntry`를 받는 쪽에서 어떤 result 필드가 존재하는지 알 수 없음.
- chat-handler.ts:120에서 `result.toolResults`가 relay `chat.done` payload로 나가는데, 수신 측이 필드 존재 여부를 예측할 수 없음.

### 2.2 ControlPayload (control-handler.ts:17-31)

```typescript
export interface ControlPayload {
  requestId?: string
  signature?: string
  approverPubKey?: string
  chainId?: number
  accountIndex?: number
  content?: string
  signerId?: string
  identityPubKey?: string
  encryptionPubKey?: string
  pairingToken?: string
  sas?: string
  policies?: Record<string, unknown>[]
  [key: string]: unknown       // <-- 계약 소멸
}
```

**문제점**:
- `[key: string]: unknown` 인덱스 시그니처로 인해 모든 필드 접근이 타입 검사를 우회.
- `toSignedApproval` 함수(control-handler.ts:63-78)가 `payload.targetHash`, `payload.policyVersion`, `payload.expiresAt`, `payload.nonce`를 읽지만 인터페이스에 선언되지 않음. 인덱스 시그니처 덕에 컴파일은 되지만 계약이 불명확.
- 7개 메시지 타입(`policy_approval`, `policy_reject`, `device_revoke`, `wallet_create`, `wallet_delete`, `pairing_confirm`, `cancel_message`)이 하나의 payload 인터페이스를 공유하면서, 각 메시지에서 실제로 필요한 필드를 타입 수준에서 알 수 없음.

### 2.3 ControlResult (control-handler.ts:33-42)

```typescript
export interface ControlResult {
  ok: boolean
  type?: string
  requestId?: string
  signerId?: string
  messageId?: string
  error?: string
  reason?: string
  wasProcessing?: boolean
}
```

`ControlResult`도 동일한 wide bag 패턴이나, PRD에서 명시한 범위는 `ControlMessage/ControlPayload`이다. **`ControlResult`는 이번 Phase 범위에서 제외한다** — ControlResult는 relay로 전송되는 외부 DTO이므로 별도 계약 검토가 필요하다. 현재 구조를 유지한다.

---

## 3. 도구별/메시지별 실제 응답 필드 분석

### 3.1 12개 도구 응답 필드 (코드에서 추출)

| # | 도구명 | 성공 시 필드 | 에러 시 필드 | 거부 시 필드 |
|---|--------|------------|------------|------------|
| 1 | `sendTransaction` | `status:'executed'`, `hash`, `fee`, `intentHash` | `status:'error'`, `error`, `intentHash` | `status:'rejected'`, `reason`, `intentHash`, `context` |
| 1b | (duplicate) | `status:'duplicate'`, `intentHash` | - | - |
| 2 | `transfer` | `status:'executed'`, `hash`, `fee`, `token`, `amount` | `status:'error'`, `error` | `status:'rejected'`, `reason`, `context` |
| 3 | `getBalance` | `balances` | `status:'error'`, `error` | - |
| 4 | `policyList` | `policies` | `status:'error'`, `error` | - |
| 5 | `policyPending` | `pending` | `status:'error'`, `error` | - |
| 6 | `policyRequest` | `status:'pending'`, `policyHash` | `status:'error'`, `error` | - |
| 7 | `registerCron` | `cronId`, `status:'registered'` | `status:'error'`, `error` | - |
| 8 | `listCrons` | `crons` | `status:'error'`, `error` | - |
| 9 | `removeCron` | `status:'removed'` | `status:'error'`, `error` | - |
| 10 | `signTransaction` | `status:'signed'`, `signedTx`, `intentHash`, `requestId` | `status:'error'`, `error`, `intentHash` | `status:'rejected'`, `reason`, `intentHash`, `context` |
| 10b | (duplicate) | `status:'duplicate'`, `intentHash` | - | - |
| 11 | `listRejections` | `rejections` | `status:'error'`, `error` | - |
| 12 | `listPolicyVersions` | `policyVersions` | `status:'error'`, `error` | - |

### 3.2 7개 제어 메시지 실제 payload 필드 (코드에서 추출)

| # | type | 사용하는 payload 필드 |
|---|------|---------------------|
| 1 | `policy_approval` | `requestId`, `signature`, `approverPubKey`, `chainId`, `accountIndex`, `signerId`, `content`, `policies`, `targetHash`*, `policyVersion`*, `expiresAt`*, `nonce`* |
| 2 | `policy_reject` | `requestId`, `signature`, `approverPubKey`, `chainId`, `accountIndex`, `signerId`, `targetHash`*, `policyVersion`*, `expiresAt`*, `nonce`* |
| 3 | `device_revoke` | `requestId`, `signature`, `approverPubKey`, `chainId`, `accountIndex`, `signerId`, `targetHash`*, `policyVersion`*, `expiresAt`*, `nonce`* |
| 4 | `wallet_create` | `requestId`, `signature`, `approverPubKey`, `chainId`, `accountIndex`, `signerId`, `targetHash`*, `policyVersion`*, `expiresAt`*, `nonce`* |
| 5 | `wallet_delete` | `requestId`, `signature`, `approverPubKey`, `chainId`, `accountIndex`, `signerId`, `targetHash`*, `policyVersion`*, `expiresAt`*, `nonce`* |
| 6 | `pairing_confirm` | `signerId`, `identityPubKey`, `encryptionPubKey`, `pairingToken`, `sas` |
| 7 | `cancel_message` | `messageId` |

`*` = 현재 `ControlPayload` 인터페이스에 미선언. `[key: string]: unknown`을 통해 암묵적 접근.

**관찰**: 1-5번은 `toSignedApproval`을 공유하며, 공통 필드 집합(`SignedApprovalFields`)이 존재한다. 6번(`pairing_confirm`)과 7번(`cancel_message`)은 완전히 다른 필드 집합을 사용한다.

---

## 4. 대안 분석

### 4.1 ToolResult 구조 대안

#### 대안 A: name-discriminated ToolResultEntry union (PRD 기본안)

```typescript
// 도구별 result 타입
interface SendTransactionResult {
  status: 'executed'
  hash: string | null
  fee: string | null
  intentHash: string
}
interface SendTransactionDuplicate {
  status: 'duplicate'
  intentHash: string
}
interface SendTransactionRejected {
  status: 'rejected'
  reason: string
  intentHash: string
  context: unknown
}
// ... 12개 도구 x N개 상태 = 개별 인터페이스

// 도구별 union
type SendTransactionToolResult =
  | SendTransactionResult
  | SendTransactionDuplicate
  | SendTransactionRejected
  | ToolErrorResult

// ToolResultEntry를 name으로 discriminate
type ToolResultEntry =
  | { toolCallId: string; name: 'sendTransaction'; args: SendTransactionArgs; result: SendTransactionToolResult }
  | { toolCallId: string; name: 'transfer'; args: TransferArgs; result: TransferToolResult }
  | ...
```

**장점**: `name`으로 분기하면 `result`의 타입이 좁혀짐. 완전한 타입 안전성.
**단점**: 타입 수가 많음 (12개 도구 x 평균 3개 상태 = ~36개 인터페이스 + 12개 union + 1개 entry union). 하지만 각 인터페이스가 2-5줄로 간결.

#### 대안 B: status-discriminated per-tool result + name은 string 유지

```typescript
// executeToolCall의 반환 타입만 도구별로 분리
function executeToolCall(name: 'sendTransaction', args: SendTransactionArgs, ctx: WDKContext): Promise<SendTransactionToolResult>
function executeToolCall(name: 'transfer', args: TransferArgs, ctx: WDKContext): Promise<TransferToolResult>
// ... 오버로드

// ToolResultEntry는 name: string을 유지하되 result가 per-tool union
interface ToolResultEntry {
  toolCallId: string
  name: string
  args: Record<string, unknown>
  result: AnyToolResult  // union of all tool results
}
```

**장점**: `executeToolCall` 호출 시점에서 타입이 좁혀짐. 인터페이스 수가 적음.
**단점**: `ToolResultEntry`를 소비하는 쪽(chat-handler, relay)에서는 name으로 좁히려면 type guard 필요. `ToolResultEntry` 자체는 discriminated union이 되지 않음.

#### 대안 C: 단일 result union + status를 discriminant로

```typescript
type ToolResult =
  | { status: 'executed'; hash: string | null; fee: string | null; intentHash: string }
  | { status: 'executed'; hash: string | null; fee: string | null; token: string; amount: string }
  | { status: 'rejected'; reason: string; intentHash?: string; context: unknown }
  | { status: 'error'; error: string; intentHash?: string }
  | { status: 'duplicate'; intentHash: string }
  | { status: 'pending'; policyHash: string }
  | { status: 'registered'; cronId: string }
  | { status: 'removed' }
  | { status: 'signed'; signedTx: string | null; intentHash: string; requestId: string }
  | { balances: unknown[] }  // getBalance -- no status
  | { policies: unknown[] }  // policyList -- no status
  | { pending: unknown[] }   // policyPending -- no status
  | { crons: unknown[] }     // listCrons -- no status
  | { rejections: unknown[] }  // listRejections -- no status
  | { policyVersions: unknown[] }  // listPolicyVersions -- no status
```

**장점**: 인터페이스 수가 적음. 기존 코드 변경 최소화.
**단점**: `status: 'executed'`가 `sendTransaction`과 `transfer` 양쪽에서 사용되어 discriminant로 불충분. `getBalance` 등 일부 도구는 성공 시 `status` 필드가 없어서 단일 discriminant 키 없음. **실질적으로 discriminated union이 성립하지 않음.**

#### 결정: 대안 A (name-discriminated ToolResultEntry union)

**근거**:
1. PRD 목표와 정확히 일치. `ToolResultEntry.name`이 discriminant.
2. `status: 'executed'`의 중복 문제가 없음 -- `name`으로 먼저 좁히고 그 안에서 `status`로 세분화.
3. 일부 도구(`getBalance`, `policyList` 등)의 성공 응답에 `status`가 없는 비일관성을 `name` discriminant가 흡수.
4. CLAUDE.md "No Optional" 원칙에 가장 부합. 각 variant에 필수 필드만 존재.
5. 타입 수가 많지만 각각이 명확하고 간결하여 유지보수에 유리.

### 4.2 ControlMessage 구조 대안

#### 대안 D: type-discriminated ControlMessage union (PRD 기본안)

```typescript
// 공통 필드 (1-5번이 toSignedApproval을 공유)
interface SignedApprovalFields {
  requestId: string
  signature: string
  approverPubKey: string
  chainId: number
  accountIndex: number
  signerId: string
  targetHash: string
  policyVersion: number
  expiresAt: number
  nonce: number
  content: string
}

// 메시지별 variant
interface PolicyApprovalMessage {
  type: 'policy_approval'
  payload: SignedApprovalFields & { policies: Record<string, unknown>[] }
}
interface PolicyRejectMessage {
  type: 'policy_reject'
  payload: SignedApprovalFields
}
interface DeviceRevokeMessage {
  type: 'device_revoke'
  payload: SignedApprovalFields
}
interface WalletCreateMessage {
  type: 'wallet_create'
  payload: SignedApprovalFields
}
interface WalletDeleteMessage {
  type: 'wallet_delete'
  payload: SignedApprovalFields
}
interface PairingConfirmMessage {
  type: 'pairing_confirm'
  payload: {
    signerId: string
    identityPubKey: string
    encryptionPubKey: string
    pairingToken: string
    sas: string
  }
}
interface CancelMessageMessage {
  type: 'cancel_message'
  payload: { messageId: string }
}

type ControlMessage =
  | PolicyApprovalMessage
  | PolicyRejectMessage
  | DeviceRevokeMessage
  | WalletCreateMessage
  | WalletDeleteMessage
  | PairingConfirmMessage
  | CancelMessageMessage
```

**장점**: `switch (msg.type)`에서 `msg.payload`의 타입이 자동으로 좁혀짐. `toSignedApproval`에 전달할 때 `SignedApprovalFields` 타입이 보장됨. 인덱스 시그니처 제거.
**단점**: `handleControlMessage` 함수 시그니처 변경 필요. 테스트에서 타입 캐스팅 수정 필요.

#### 대안 E: payload만 union, ControlMessage 구조 유지

```typescript
interface ControlMessage {
  type: ControlMessageType
  payload: ControlPayloadMap[ControlMessageType]
}
```

제네릭을 사용한 매핑 타입.

**장점**: 기존 `ControlMessage` 구조(type + payload) 유지.
**단점**: TypeScript에서 제네릭 + switch 조합의 타입 좁힘이 불완전. `msg.type`으로 switch해도 `msg.payload`가 자동으로 좁혀지지 않음 (TypeScript 한계). 별도의 type guard나 as 캐스트 필요.

#### 대안 F: 평탄화 (type + 나머지 필드)

```typescript
type ControlMessage =
  | { type: 'policy_approval'; requestId: string; signature: string; ... }
  | { type: 'pairing_confirm'; signerId: string; ... }
```

payload 중첩 제거, type과 필드가 동일 레벨.

**장점**: 가장 단순한 구조. 중첩 없음.
**단점**: wire JSON 구조(`{ type, payload: {...} }`)와 불일치. 변환 레이어 필요. PRD에서 "wire JSON은 유지"라고 명시.

#### 결정: 대안 D (type-discriminated ControlMessage union)

**근거**:
1. TypeScript의 discriminated union narrowing이 `switch (msg.type)` 패턴에서 완벽하게 작동.
2. wire JSON 구조(type + payload 중첩)를 그대로 유지.
3. `[key: string]: unknown` 인덱스 시그니처 완전 제거.
4. `toSignedApproval`의 입력 타입이 `SignedApprovalFields`로 명확해짐. 기존에 암묵적으로 접근하던 `targetHash`, `policyVersion`, `expiresAt`, `nonce`가 타입에 명시.
5. 대안 E의 제네릭 매핑은 TypeScript narrowing 한계로 실용적이지 않음.

### 4.3 ControlResult — 범위 제외

N/A: `ControlResult`는 relay로 전송되는 외부 DTO이므로 이번 Phase 범위에서 제외. 현재 구조를 유지한다. 분석은 2.3절에서 기록했으나, 설계/변경 파일 목록/구현에는 포함하지 않는다.

---

## 5. 기술 결정

### TD-1: ToolResult 타입 파일 위치

**결정**: `tool-surface.ts` 내부에 모든 per-tool result 인터페이스를 선언한다.

**근거**: 현재 `ToolResult`가 `tool-surface.ts`에 있고, `executeToolCall` 함수와 같은 파일. 도구별 result 타입은 이 함수의 반환 타입이므로 같은 파일이 자연스럽다. 파일 크기가 증가하지만(~100줄 추가), 별도 파일로 분리하면 순환 참조 위험이 있고 PRD 비목표에 "TOOL_DEFINITIONS 모듈 분리는 v0.2.11"이라고 명시되어 있으므로 이번에 파일 분리는 하지 않는다.

### TD-2: 에러 result 공유 패턴

**결정**: `ToolErrorResult` 인터페이스를 하나만 정의하고, 각 도구 union에 포함한다.

```typescript
interface ToolErrorResult {
  status: 'error'
  error: string
  intentHash?: string  // sendTransaction, signTransaction만 포함
}
```

**고려 사항**: `sendTransaction`과 `signTransaction`의 에러 result에는 `intentHash`가 포함되지만, 나머지 도구에는 없다. 두 가지 선택지:

- (a) 단일 `ToolErrorResult`에 `intentHash`를 optional로: 간결하지만 "No Optional" 원칙 위반.
- (b) `ToolErrorResult`와 `ToolErrorWithIntentHashResult` 두 개: 원칙 준수하지만 2줄짜리 인터페이스 중복.

**결정**: (b)를 채택. 이름은 `ToolErrorResult` (intentHash 없음)과 `IntentErrorResult` (intentHash 있음)로 구분.

```typescript
interface ToolErrorResult {
  status: 'error'
  error: string
}

interface IntentErrorResult {
  status: 'error'
  error: string
  intentHash: string
}
```

### TD-3: toSignedApproval 입력 타입 전환

**결정**: `toSignedApproval`의 파라미터를 `ControlPayload`에서 `SignedApprovalFields`로 변경한다. `type` 파라미터는 제거하고 호출 측에서 결정.

현재:
```typescript
function toSignedApproval(payload: ControlPayload, type: string): SignedApproval
```

변경 후:
```typescript
function toSignedApproval(fields: SignedApprovalFields, type: SignedApproval['type']): SignedApproval
```

**근거**: `SignedApprovalFields`는 `toSignedApproval`이 실제로 읽는 모든 필드를 명시적으로 선언. `ControlPayload`의 인덱스 시그니처에 의존하던 암묵적 필드 접근이 제거됨. `type` 파라미터도 `string`에서 `SignedApproval['type']`으로 좁힘.

### TD-4: executeToolCall 함수 시그니처

**결정**: `executeToolCall`의 반환 타입을 도구별 union으로 변경하되, 함수 오버로드는 사용하지 않는다.

```typescript
export async function executeToolCall(
  name: string,
  args: ToolArgs,
  wdkContext: WDKContext
): Promise<AnyToolResult>
```

여기서 `AnyToolResult`는 모든 도구 result의 union이다.

**근거**:
- 이 함수는 OpenAI tool_call의 `name` 필드(런타임 `string`)로 호출되므로, 오버로드를 사용해도 호출 시점에서 타입 좁힘이 불가능.
- `ToolResultEntry`가 name-discriminated union이므로, 소비 측에서는 `entry.name`으로 좁히면 된다.
- 반환 타입이 `AnyToolResult`(union)이 되는 것만으로도 현재의 wide bag보다 큰 개선.

### TD-5: getBalance 등 status 미포함 도구의 성공 result 표준화

**결정**: 성공 시 `status` 필드가 없는 도구들(`getBalance`, `policyList`, `policyPending`, `listCrons`, `listRejections`, `listPolicyVersions`)의 현재 동작을 유지한다. `status` 필드를 강제 추가하지 않는다.

**근거**: wire JSON 변경을 하지 않는 것이 PRD 제약. 이 도구들의 성공 응답에 `status`를 추가하면 wire JSON이 변경된다. 대신 `name` discriminant로 도구를 식별한 후, 각 도구 result 내에서 `'error' in result`로 성공/실패를 구분하는 패턴을 사용한다.

### TD-6: wire 변환 경계

**결정**: wire JSON과 내부 타입의 변환 경계를 명확히 한다.

```
[Relay wire JSON] --parse--> [ControlMessage union] --switch--> [handler logic]
[Tool execution] --return--> [per-tool result] --JSON.stringify--> [OpenAI tool result]
[ToolResultEntry[]] --relay send--> [chat.done payload]
```

변환 지점:
1. **Control 수신**: `index.ts:87`에서 `relayClient.onMessage`의 `payload`(any)를 `ControlMessage`로 해석. 이번 Phase에서는 **`as ControlMessage` 캐스트 + TODO 주석**으로 처리. 런타임 validator는 별도 후속 작업.
2. **Tool result 송신**: `tool-call-loop.ts:137`에서 `JSON.stringify(result)`. per-tool result가 JSON으로 직렬화. wire 형태 변경 없음.
3. **chat.done 송신**: `chat-handler.ts:120`에서 `result.toolResults`가 relay로 전송. `ToolResultEntry[]`의 직렬화. wire 형태 변경 없음.

---

## 6. 세부 타입 정의

### 6.1 Per-Tool Result 타입

```typescript
// -- 공통 에러 --
interface ToolErrorResult {
  status: 'error'
  error: string
}

interface IntentErrorResult {
  status: 'error'
  error: string
  intentHash: string
}

// -- 공통 거부 --
interface IntentRejectedResult {
  status: 'rejected'
  reason: string
  intentHash: string
  context: unknown
}

interface TransferRejectedResult {
  status: 'rejected'
  reason: string
  context: unknown
}

// -- 1. sendTransaction --
interface SendTransactionExecuted {
  status: 'executed'
  hash: string | null
  fee: string | null
  intentHash: string
}

interface SendTransactionDuplicate {
  status: 'duplicate'
  intentHash: string
}

type SendTransactionResult =
  | SendTransactionExecuted
  | SendTransactionDuplicate
  | IntentRejectedResult
  | IntentErrorResult

// -- 2. transfer --
interface TransferExecuted {
  status: 'executed'
  hash: string | null
  fee: string | null
  token: string
  amount: string
}

type TransferResult =
  | TransferExecuted
  | TransferRejectedResult
  | ToolErrorResult

// -- 3. getBalance --
interface GetBalanceSuccess {
  balances: unknown[]
}

type GetBalanceResult = GetBalanceSuccess | ToolErrorResult

// -- 4. policyList --
interface PolicyListSuccess {
  policies: unknown[]
}

type PolicyListResult = PolicyListSuccess | ToolErrorResult

// -- 5. policyPending --
interface PolicyPendingSuccess {
  pending: unknown[]
}

type PolicyPendingResult = PolicyPendingSuccess | ToolErrorResult

// -- 6. policyRequest --
interface PolicyRequestPending {
  status: 'pending'
  policyHash: string
}

type PolicyRequestResult = PolicyRequestPending | ToolErrorResult

// -- 7. registerCron --
interface RegisterCronRegistered {
  cronId: string
  status: 'registered'
}

type RegisterCronResult = RegisterCronRegistered | ToolErrorResult

// -- 8. listCrons --
interface ListCronsSuccess {
  crons: unknown[]
}

type ListCronsResult = ListCronsSuccess | ToolErrorResult

// -- 9. removeCron --
interface RemoveCronRemoved {
  status: 'removed'
}

type RemoveCronResult = RemoveCronRemoved | ToolErrorResult

// -- 10. signTransaction --
interface SignTransactionSigned {
  status: 'signed'
  signedTx: string | null
  intentHash: string
  requestId: string
}

interface SignTransactionDuplicate {
  status: 'duplicate'
  intentHash: string
}

type SignTransactionResult =
  | SignTransactionSigned
  | SignTransactionDuplicate
  | IntentRejectedResult
  | IntentErrorResult

// -- 11. listRejections --
interface ListRejectionsSuccess {
  rejections: unknown[]
}

type ListRejectionsResult = ListRejectionsSuccess | ToolErrorResult

// -- 12. listPolicyVersions --
interface ListPolicyVersionsSuccess {
  policyVersions: unknown[]
}

type ListPolicyVersionsResult = ListPolicyVersionsSuccess | ToolErrorResult

// -- Unknown tool --
// ToolErrorResult 재사용

// -- 전체 union --
type AnyToolResult =
  | SendTransactionResult
  | TransferResult
  | GetBalanceResult
  | PolicyListResult
  | PolicyPendingResult
  | PolicyRequestResult
  | RegisterCronResult
  | ListCronsResult
  | RemoveCronResult
  | SignTransactionResult
  | ListRejectionsResult
  | ListPolicyVersionsResult
```

### 6.2 ToolResultEntry Discriminated Union

```typescript
type ToolResultEntry =
  | { toolCallId: string; name: 'sendTransaction'; args: SendTransactionArgs; result: SendTransactionResult }
  | { toolCallId: string; name: 'transfer'; args: TransferArgs; result: TransferResult }
  | { toolCallId: string; name: 'getBalance'; args: ChainArgs; result: GetBalanceResult }
  | { toolCallId: string; name: 'policyList'; args: ChainArgs; result: PolicyListResult }
  | { toolCallId: string; name: 'policyPending'; args: ChainArgs; result: PolicyPendingResult }
  | { toolCallId: string; name: 'policyRequest'; args: PolicyRequestArgs; result: PolicyRequestResult }
  | { toolCallId: string; name: 'registerCron'; args: RegisterCronArgs; result: RegisterCronResult }
  | { toolCallId: string; name: 'listCrons'; args: Record<string, unknown>; result: ListCronsResult }
  | { toolCallId: string; name: 'removeCron'; args: CronIdArgs; result: RemoveCronResult }
  | { toolCallId: string; name: 'signTransaction'; args: SendTransactionArgs; result: SignTransactionResult }
  | { toolCallId: string; name: 'listRejections'; args: RejectionListArgs; result: ListRejectionsResult }
  | { toolCallId: string; name: 'listPolicyVersions'; args: PolicyVersionListArgs; result: ListPolicyVersionsResult }
  | { toolCallId: string; name: string; args: Record<string, unknown>; result: ToolErrorResult }  // unknown tool fallback
```

> **unknown tool variant**: 현재 코드에 이미 unknown tool 반환 경로가 있으므로 (tool-surface.ts:600), union에 `name: string` fallback variant를 포함한다. `name`이 런타임 string이므로 TypeScript가 정의된 12개와 매치하지 못하면 이 variant로 narrowing된다.

### 6.3 ControlMessage Discriminated Union

```typescript
// SignedApproval용 공통 payload 필드
interface SignedApprovalFields {
  requestId: string
  signature: string
  approverPubKey: string
  chainId: number
  accountIndex: number
  signerId: string
  targetHash: string
  policyVersion: number
  expiresAt: number
  nonce: number
  content: string
}

// policy_approval은 추가 필드 보유
interface PolicyApprovalPayload extends SignedApprovalFields {
  policies: Record<string, unknown>[]
}

interface PairingConfirmPayload {
  signerId: string
  identityPubKey: string
  encryptionPubKey: string
  pairingToken: string
  sas: string
}

interface CancelMessagePayload {
  messageId: string
}

type ControlMessage =
  | { type: 'policy_approval'; payload: PolicyApprovalPayload }
  | { type: 'policy_reject';   payload: SignedApprovalFields }
  | { type: 'device_revoke';   payload: SignedApprovalFields }
  | { type: 'wallet_create';   payload: SignedApprovalFields }
  | { type: 'wallet_delete';   payload: SignedApprovalFields }
  | { type: 'pairing_confirm'; payload: PairingConfirmPayload }
  | { type: 'cancel_message';  payload: CancelMessagePayload }
```

### 6.4 ControlResult — 범위 제외

N/A: `ControlResult`는 이번 Phase 범위에서 제외. 4.3절 참조.

---

## 7. 변환 경계와 parse 함수

### 7.1 Control wire -> ControlMessage parse

`index.ts:87`에서 relay의 `payload`(any)를 `ControlMessage` union으로 변환하는 parse 함수가 필요하다.

```typescript
function parseControlMessage(raw: unknown): ControlMessage {
  // 런타임 검증: type과 payload 존재 확인
  // type에 따라 payload의 필수 필드 확인
  // 실패 시 throw (No Fallback 원칙)
}
```

**위치**: `control-handler.ts` 상단에 배치. `handleControlMessage`의 첫 단계로 호출.

**결정**: 이번 Phase에서는 parse 함수의 **타입 선언만** 한다. 런타임 validator 구현은 별도 ticket으로 분리한다. 이유: PRD 범위가 "TypeScript 타입/분기만 재구성"이고, 런타임 validation은 추가 로직이다. 현재는 `as ControlMessage` 캐스트로 대체하되, TODO 주석을 남긴다.

### 7.2 Tool result -> wire JSON

변환 불필요. `JSON.stringify(result)`가 per-tool result 인터페이스의 필드를 그대로 직렬화한다. 기존 wire 형태와 동일.

---

## 8. 단계별 리팩토링 계획

### Step 1: Per-Tool Result 타입 정의 (tool-surface.ts)

- 기존 `ToolResult` 인터페이스 위에 6.1절의 모든 per-tool result 인터페이스 추가.
- `AnyToolResult` union 타입 정의.
- 기존 `ToolResult`를 `/** @deprecated use AnyToolResult */`로 마킹하고, alias로 유지: `type ToolResult = AnyToolResult`.
- `executeToolCall`의 반환 타입을 `Promise<AnyToolResult>`로 변경.
- 각 switch case의 return 문이 해당 per-tool result 타입과 일치하는지 검증 (tsc).

**영향 파일**: `tool-surface.ts`
**노력**: 소 (타입 추가, 로직 변경 없음)

### Step 2: ToolResultEntry 재정의 (tool-call-loop.ts)

- `ToolResultEntry`를 6.2절의 name-discriminated union으로 재정의.
- `allToolResults` 배열의 push 로직에서 `name`이 리터럴이 되도록 보장. 현재 `fnName`이 `string`이므로, push 시 `as const` assertion 또는 type guard 필요.
- `ProcessChatResult.toolResults`의 타입을 `ToolResultEntry[]`로 유지 (이미 올바름).

**영향 파일**: `tool-call-loop.ts`
**노력**: 소-중 (push 로직에서 타입 좁힘 필요)

**주의**: `tool-call-loop.ts:117`에서 `fnName`은 `toolCall.function.name`(string)이다. 이를 union literal로 좁히려면:
- (a) `as ToolName` 캐스트: 간단하지만 안전하지 않음.
- (b) `isKnownTool` type guard: 런타임 확인 + 타입 좁힘.
- (c) `ToolResultEntry`에 unknown tool variant 추가: `{ name: string; result: ToolErrorResult }`.

**결정**: (c)를 채택. unknown tool도 entry에 포함되어야 하므로 자연스러움. 12개 known tool variant + 1개 unknown variant.

### Step 3: ControlMessage union 재정의 (control-handler.ts)

- 기존 `ControlPayload` 인터페이스를 6.3절의 `SignedApprovalFields`, `PolicyApprovalPayload`, `PairingConfirmPayload`, `CancelMessagePayload`로 교체.
- `ControlMessage`를 discriminated union으로 재정의.
- `toSignedApproval`의 파라미터를 `SignedApprovalFields`로 변경.
- `handleControlMessage`의 switch 분기에서 TypeScript narrowing이 작동하는지 검증.
- ~~`ControlResult`~~: 범위 제외 (4.3절 참조). 현재 구조 유지.

**영향 파일**: `control-handler.ts`
**노력**: 중 (타입 재정의 + toSignedApproval 시그니처 변경 + switch 분기 내 payload 접근 패턴 변경)

### Step 4: index.ts 호출부 수정

- `index.ts:87`에서 `handleControlMessage(payload, ...)` 호출의 `payload` 타입을 `ControlMessage`로 명시. 현재는 `any`에서 `ControlMessage`로의 암묵적 변환.
- wire JSON -> `ControlMessage` 변환을 위한 TODO 주석 추가.

**영향 파일**: `index.ts`
**노력**: 소

### Step 5: 테스트 업데이트

- `tool-surface.test.ts`: `ToolResult` import를 `AnyToolResult`로 변경. 각 테스트의 result assertion이 per-tool result 필드와 일치하는지 검증. 대부분의 assertion이 이미 올바른 필드를 확인하므로 변경 소량.
- `control-handler.test.ts`: `ControlMessage` 리터럴의 타입이 union variant와 일치하도록 수정. 특히 `payload`의 필드가 해당 variant의 필수 필드를 모두 포함해야 함.

**영향 파일**: `tests/tool-surface.test.ts`, `tests/control-handler.test.ts`
**노력**: 중 (테스트 리터럴의 payload 필드를 variant별로 완전하게 채워야 함)

---

## 9. 위험 평가와 완화

### R-1: tool-call-loop.ts에서 name 타입 좁힘

**위험**: `fnName`이 런타임 `string`이므로 union literal로 좁히기 어려움.
**완화**: unknown tool variant를 union에 포함하고, known tool은 `as const` assertion으로 처리. `executeToolCall` 내부에서 switch-case가 이미 12개 도구를 처리하므로, 반환 타입은 자동으로 올바른 variant가 됨.

### R-2: 기존 테스트의 불완전한 payload

**위험**: 테스트에서 생성하는 `ControlMessage` 리터럴이 variant의 필수 필드를 모두 포함하지 않을 수 있음.
**완화**: 기존 테스트가 실제 필요한 필드만 포함하는 것이 의도적일 수 있음 (예: broker mock이 특정 필드만 사용). 필수가 아닌 필드는 테스트 헬퍼에서 기본값으로 채우는 팩토리 함수를 도입.

### R-3: 구 타입 의존 코드

**위험**: `ToolResult`를 직접 사용하는 외부 코드가 깨질 수 있음.
**완화**: grep 결과 `ToolResult`는 daemon 패키지 내부에서만 사용됨 (tool-surface.ts, tool-call-loop.ts, tool-surface.test.ts). `AnyToolResult` alias로 후방 호환성 유지.

### R-4: relay `chat.done` payload 변경

**위험**: `ToolResultEntry` 구조 변경이 relay를 통해 app에 영향을 줄 수 있음.
**완화**: `ToolResultEntry`의 wire 형태(JSON.stringify)는 변경되지 않음. `toolCallId`, `name`, `args`, `result` 필드는 동일. `result`의 실제 필드도 도구별로 동일.

---

## 10. 테스팅 전략

1. **tsc 컴파일**: 모든 변경 후 `tsc --noEmit`으로 타입 에러 확인. discriminated union narrowing이 올바르게 작동하는지 검증.
2. **기존 테스트 통과**: `tool-surface.test.ts`의 20개 테스트, `control-handler.test.ts`의 테스트 모두 통과 확인.
3. **exhaustiveness 확인**: switch-case에서 `default`에 `never` assertion을 추가하여 새로운 도구/메시지가 추가될 때 컴파일 에러가 발생하는지 확인.

---

## 11. 성공 지표

1. `ToolResult` wide optional bag 인터페이스 제거됨. `AnyToolResult` union으로 대체.
2. `ControlPayload`의 `[key: string]: unknown` 인덱스 시그니처 제거됨.
3. `toSignedApproval`이 `SignedApprovalFields`를 받으며, 암묵적 필드 접근 없음.
4. `switch (msg.type)` 분기에서 `msg.payload`가 올바른 variant로 좁혀짐 (IDE hover로 검증 가능).
5. `switch (entry.name)` 분기에서 `entry.result`가 올바른 per-tool result로 좁혀짐.
6. wire JSON(relay chat.done, control result) 형태 변경 없음.
7. 기존 테스트 전량 통과.
8. tsc --noEmit 통과.

---

## 12. 변경 파일 목록

| 파일 | 변경 내용 | 규모 |
|------|----------|------|
| `packages/daemon/src/tool-surface.ts` | Per-tool result 타입 정의, `AnyToolResult` union, `executeToolCall` 반환 타입 변경, 기존 `ToolResult` deprecated alias | 대 (타입 ~100줄 추가) |
| `packages/daemon/src/tool-call-loop.ts` | `ToolResultEntry` discriminated union 재정의, push 로직 타입 수정 | 중 |
| `packages/daemon/src/control-handler.ts` | `ControlMessage`/`ControlPayload` discriminated union 재정의, `SignedApprovalFields` 추출, `toSignedApproval` 시그니처 변경. `ControlResult`는 현재 구조 유지 (범위 제외) | 대 |
| `packages/daemon/src/index.ts` | `handleControlMessage` 호출부 타입 명시, TODO 주석 | 소 |
| `packages/daemon/tests/tool-surface.test.ts` | `ToolResult` -> `AnyToolResult` import, assertion 필드 검증 | 소 |
| `packages/daemon/tests/control-handler.test.ts` | `ControlMessage` 리터럴 payload 필드 완성, 팩토리 헬퍼 도입 | 중 |

**총 영향**: 소스 4파일, 테스트 2파일. 로직 변경 없음. 타입만 재구성.
