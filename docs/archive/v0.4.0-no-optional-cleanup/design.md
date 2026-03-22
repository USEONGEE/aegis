# v0.4.0 No Optional 전면 적용 -- Design Document

## 요약

7개 패키지에 걸쳐 64건의 "No Optional" 원칙 위반을 전수 수정하는 리팩토링 설계.
패키지 의존 방향(leaf -> root)에 따라 7개 Wave로 나누고, 각 Wave 내에서는 패턴별로 그룹화하여 한 커밋 단위로 처리한다.

핵심 설계 결정:
- 모노레포 원샷 변경이므로, wire 타입도 변경 대상. `ControlResult`는 DU 분리, `RelayEnvelope`는 required+null 패턴 (DU는 v0.4.1)
- 모든 optional -> required 변환은 **호출부까지 동시 수정** (타입만 바꾸고 호출부 깨뜨리지 않음)
- 기존 테스트 fixture 수정은 허용하되, 대규모 신규 테스트 추가는 범위 밖

---

## 1. 현재 상태 분석

### 1.1 위반 분포 (패턴별)

| 패턴 | 건수 | 대표 사례 |
|------|------|----------|
| Wide Bag | 22 | `ControlResult`, `RelayEnvelope`, `QueuedMessage`, `AdminRequest/Response` |
| DU 미적용 | 15 | `HistoryEntry`, `PendingApprovalRequest`, `CancelResult`, `ValidationResult` |
| Default 대신 Optional | 8 | `IntentInput.value`, `GuardedWDKConfig.wallets/protocols`, `ChainArgs.accountIndex` |
| Required+null 대신 Optional | 8 | `ApprovalStore.saveSigner._name`, `Policy.constraints/description`, `ControlEnvelope.messageId/timestamp` |
| Optional Deps | 6 | `SignedApprovalBroker.constructor.emitter`, `handleControlMessage` 파라미터 |
| 보안 필드 | 3 | `forTx.policyVersion`, `build.policyVersion`, `connect.authToken` |

### 1.2 의존 그래프 (수정 순서 결정의 기반)

```
canonical (leaf)    protocol (leaf)
         \            /
      guarded-wdk
           |
        manifest
           |
         daemon
           |
          relay
           |
          app
```

단방향 의존이므로, **leaf 패키지부터 수정하면 하위 패키지에서 import한 타입이 먼저 확정**되어 cascade가 최소화된다.

---

## 2. 수정 순서 최적화: 7 Waves

### Wave 1: canonical (1건)
### Wave 2: protocol (12건) -- 가장 cascade 큰 핵심 타입
### Wave 3: guarded-wdk (16건) -- 가장 많은 위반
### Wave 4: manifest (1건)
### Wave 5: daemon (12건)
### Wave 6: relay (12건)
### Wave 7: app (10건)

---

## 3. Wave별 상세 변환 설계

---

### Wave 1: canonical (1건)

#### #1 `IntentInput.value?` -- Default 대신 Optional

**현재 코드** (`packages/canonical/src/index.ts:22`):
```ts
export interface IntentInput {
  chainId: number
  to: string
  data: string
  value?: string | number | null  // 위반: 기본값 '0'이 있으므로 required여야 함
  timestamp: number
}
```

**변환**:
```ts
export interface IntentInput {
  chainId: number
  to: string
  data: string
  value: string              // required, 호출부에서 '0' 명시
  timestamp: number
}
```

**cascade 영향**:
- `intentHash()` 호출부 (canonical 내부): `normalizeValue(value)` -- undefined 분기 제거 가능
- daemon `tool-surface.ts`: `intentHash({ ..., value, ... })` -- `SendTransactionArgs.value`는 이미 required
- guarded-wdk `guarded-middleware.ts`: `intentHash({ ..., value: String(tx.value || '0'), ... })` -- 이미 String으로 변환 중

**변환 전략**: `value`를 `string`으로 확정. 내부의 `normalizeValue` 함수에서 `undefined` 분기 제거. 호출부에서 `value`를 명시적으로 전달.

**위험도**: **Low**. canonical은 leaf 패키지이고 호출부가 적으며, 기존 호출부가 이미 값을 전달하고 있다.

---

### Wave 2: protocol (12건) -- 최대 cascade

#### #2~#7 `ControlResult` Wide Bag (6건)

**현재 코드** (`packages/protocol/src/control.ts:49-57`):
```ts
export interface ControlResult {
  ok: boolean
  type?: string
  requestId?: string
  messageId?: string
  error?: string
  reason?: string
  wasProcessing?: boolean
}
```

**문제**: 성공/실패, approval 결과/cancel 결과 등 서로 다른 응답 형태를 하나의 bag에 합침.

**변환** -- discriminated union:
```ts
// 승인 계열 성공 (tx_approval, policy_approval, policy_reject, device_revoke, wallet_create, wallet_delete)
export interface ControlResultApprovalOk {
  ok: true
  type: 'tx_approval' | 'policy_approval' | 'policy_reject' | 'device_revoke' | 'wallet_create' | 'wallet_delete'
  requestId: string
}

// 승인 계열 실패
export interface ControlResultApprovalError {
  ok: false
  type: 'tx_approval' | 'policy_approval' | 'policy_reject' | 'device_revoke' | 'wallet_create' | 'wallet_delete'
  requestId: string
  error: string
}

// cancel_queued 성공
export interface ControlResultCancelQueuedOk {
  ok: true
  type: 'cancel_queued'
  messageId: string
}

// cancel_queued 실패
export interface ControlResultCancelQueuedError {
  ok: false
  type: 'cancel_queued'
  messageId: string
  reason: 'not_found' | 'already_completed'
}

// cancel_active 성공
export interface ControlResultCancelActiveOk {
  ok: true
  type: 'cancel_active'
  messageId: string
  wasProcessing: true
}

// cancel_active 실패
export interface ControlResultCancelActiveError {
  ok: false
  type: 'cancel_active'
  messageId: string
  reason: 'not_found' | 'already_completed'
}

// cancel 계열 에러 (cancel 시도 중 catch된 에러)
export interface ControlResultCancelError {
  ok: false
  type: 'cancel_queued' | 'cancel_active'
  error: string
}

// 일반 에러 (malformed message, unknown type)
export interface ControlResultGenericError {
  ok: false
  error: string
}

export type ControlResult =
  | ControlResultApprovalOk
  | ControlResultApprovalError
  | ControlResultCancelQueuedOk
  | ControlResultCancelQueuedError
  | ControlResultCancelActiveOk
  | ControlResultCancelActiveError
  | ControlResultCancelError
  | ControlResultGenericError
```

**cascade 영향** (높음):
- daemon `control-handler.ts`: 각 case에서 `ControlResult` 리터럴 객체를 반환 -- 반환 타입이 좁혀짐
- daemon `index.ts`: `relayClient.send('control', result)` -- 타입 변경 없이 전달
- relay `ws.ts`: wire에서 받는 payload는 `any`이므로 직접 영향 없음
- app에서 control result를 수신할 때 payload를 파싱하는 코드 -- 현재 `as any` cast이므로 영향 미미

**위험도**: **Medium-High** (cascade는 크지만, 모노레포 내 원샷 수정이므로 관리 가능)

#### #8~#13 `RelayEnvelope` Wide Bag (6건)

**현재 코드** (`packages/protocol/src/relay.ts:14-27`):
```ts
export interface RelayEnvelope {
  type: string
  payload?: unknown
  encrypted?: boolean
  sessionId?: string
  userId?: string
  daemonId?: string
  userIds?: string[]
  lastControlIds?: Record<string, string>
}
```

**문제**: 인증 요청, 인증 응답, 데이터 전송, 하트비트 등 완전히 다른 메시지 유형을 하나의 bag에 합침.

**변환** -- discriminated union:
```ts
// 인증 요청 (daemon/app -> relay)
export interface RelayAuthenticateEnvelope {
  type: 'authenticate'
  payload: { token: string; lastControlIds?: Record<string, string> }
}

// 인증 응답 (relay -> daemon)
export interface RelayAuthenticatedEnvelope {
  type: 'authenticated'
  daemonId: string
  userIds: string[]
}

// 데이터 전송 (control/chat)
export interface RelayDataEnvelope {
  type: 'control' | 'chat'
  payload: unknown
  encrypted: boolean
  userId: string
  sessionId: string | null
}

// 하트비트
export interface RelayHeartbeatEnvelope {
  type: 'heartbeat'
}

// 에러
export interface RelayErrorEnvelope {
  type: 'error'
  message: string
}

export type RelayEnvelope =
  | RelayAuthenticateEnvelope
  | RelayAuthenticatedEnvelope
  | RelayDataEnvelope
  | RelayHeartbeatEnvelope
  | RelayErrorEnvelope
```

**실용적 판단**: `RelayEnvelope`는 wire protocol이므로, **실제로 수신 측에서는 JSON.parse 후 `as any`로 처리**하는 패턴이 대부분이다. 송신 측에서만 타입 체크가 의미 있다.

**BUT -- 현재 relay `ws.ts`에서 `IncomingMessage`/`OutgoingMessage`를 별도 정의하고 있고, daemon `relay-client.ts`에서도 자체 envelope을 구성한다. 따라서 `RelayEnvelope`를 DU로 바꾸면:**
1. daemon `relay-client.ts`의 `send()` 메서드에서 envelope 구성 로직 변경 필요
2. relay `ws.ts`의 `IncomingMessage`/`OutgoingMessage`가 `RelayEnvelope` 기반이 아닌 별도 타입이므로 독립적으로 수정 가능

**위험도**: **High** -- 가장 cascade가 큰 변경. 그러나 실제 런타임에서 wire는 JSON이므로 타입 변경만으로 기능이 깨지지는 않는다.

**대안 (보수적 접근)**: `RelayEnvelope` DU 분리 대신, **optional 필드를 `T | null` required로 변환**만 수행. 이 경우:
```ts
export interface RelayEnvelope {
  type: string
  payload: unknown          // required (항상 존재)
  encrypted: boolean        // required, default false
  sessionId: string | null  // required
  userId: string | null     // required
  daemonId: string | null   // required
  userIds: string[] | null  // required
  lastControlIds: Record<string, string> | null // required
}
```

**설계 결정**: DU 분리가 이상적이지만, `RelayEnvelope`는 7개 파일에서 사용되며 wire protocol의 근간이다. **Wave 2에서는 보수적 접근(required + null)으로 시작하고, DU 분리는 v0.4.1 별도 Phase로 분리**한다. 단, 이 design doc에서 DU 형태를 기록하여 후속 Phase의 target state로 사용.

> **최종 결정**: `RelayEnvelope`는 **`required | null` 패턴**으로 수정. optional 6건은 모두 해소되지만 DU는 아님.

---

### Wave 3: guarded-wdk (16건)

#### #14~#15 `VerificationContext` Wide Bag (2건)

**현재** (`approval-verifier.ts:13-16`):
```ts
export interface VerificationContext {
  currentPolicyVersion?: number
  expectedTargetHash?: string
}
```

**변환**:
```ts
export interface VerificationContext {
  currentPolicyVersion: number | null
  expectedTargetHash: string | null
}
```

**cascade**: `verifyApproval()` 호출부 (signed-approval-broker.ts, daemon control-handler.ts)에서 `context: {}` 또는 `context: { expectedTargetHash: ... }` 형태로 전달 -- `null` 명시로 변경.

**위험도**: **Low**. 호출부 4곳.

#### #16 `PendingApprovalRequest.walletName?` -- DU 미적용

**현재** (`approval-store.ts:64-66`):
```ts
export interface PendingApprovalRequest extends ApprovalRequest {
  walletName?: string
}
```

**분석**: `walletName`은 `wallet_create`/`wallet_delete` 타입일 때만 존재. 그러나 `PendingApprovalRequest`는 `ApprovalStore`의 추상 메서드 시그니처에서 사용되고, SQLite/JSON store 구현체에서도 범용적으로 사용된다. DU로 분리하면 store 인터페이스 전체를 바꿔야 한다.

**실용적 결정**: `walletName: string | null` (required+null 패턴). 완전한 DU 분리는 scope 대비 cascade가 과도.

```ts
export interface PendingApprovalRequest extends ApprovalRequest {
  walletName: string | null
}
```

**cascade**: `signed-approval-broker.ts:59-61`에서 `walletName`을 조건부 spread하는 코드 수정.

#### #17~#19 `HistoryEntry` DU 미적용 (3건)

**현재** (`approval-store.ts:70-81`):
```ts
export interface HistoryEntry {
  accountIndex: number
  requestId?: string
  type: ApprovalType
  chainId?: number | null
  targetHash: string
  approver: string
  action: HistoryAction
  content?: string
  signedApproval?: SignedApproval
  timestamp: number
}
```

**분석**: `requestId`, `content`, `signedApproval`은 모든 HistoryEntry에 존재해야 하는 필드. `chainId`는 `number | null`이어야 한다.

**변환**:
```ts
export interface HistoryEntry {
  accountIndex: number
  requestId: string
  type: ApprovalType
  chainId: number | null
  targetHash: string
  approver: string
  action: HistoryAction
  content: string
  signedApproval: SignedApproval | null
  timestamp: number
}
```

**cascade**: `appendHistory()` 호출부 (signed-approval-broker.ts:205)에서 이미 모든 필드를 전달. `signedApproval`만 추가 필요.

#### #20 `ApprovalStore.saveSigner._name?` -- Required+null

**현재** (`approval-store.ts:203`):
```ts
async saveSigner (_publicKey: string, _name?: string): Promise<void>
```

**변환**:
```ts
async saveSigner (_publicKey: string, _name: string | null): Promise<void>
```

**cascade**: 호출부에서 `saveSigner(pubKey)` -> `saveSigner(pubKey, null)`.

#### #21 `ApprovalStore.updateJournalStatus._txHash?` -- DU 미적용

**현재** (`approval-store.ts:225`):
```ts
async updateJournalStatus (_intentHash: string, _status: JournalStatus, _txHash?: string): Promise<void>
```

**변환**:
```ts
async updateJournalStatus (_intentHash: string, _status: JournalStatus, _txHash: string | null): Promise<void>
```

**cascade**: daemon `execution-journal.ts:141`, daemon `tool-surface.ts` 내 여러 곳에서 `txHash`를 optional로 전달 -- `null` 명시.

#### #22~#23 `GuardedWDKConfig.wallets/protocols?` -- Default 대신 Optional

**현재** (`guarded-wdk-factory.ts:25-31`):
```ts
interface GuardedWDKConfig {
  seed: string
  wallets?: Record<string, WalletEntry>
  protocols?: Record<string, ProtocolEntry[]>
  approvalBroker?: SignedApprovalBroker
  approvalStore: ApprovalStore
  trustedApprovers?: string[]
}
```

**변환**: `wallets`와 `protocols`는 빈 객체가 기본값. Required로 변경:
```ts
interface GuardedWDKConfig {
  seed: string
  wallets: Record<string, WalletEntry>
  protocols: Record<string, ProtocolEntry[]>
  approvalStore: ApprovalStore
} & (
  | { approvalBroker: SignedApprovalBroker }
  | { trustedApprovers: string[] }
)
```

**실용적 판단**: DU intersection은 과도. 대신:
```ts
interface GuardedWDKConfig {
  seed: string
  wallets: Record<string, WalletEntry>
  protocols: Record<string, ProtocolEntry[]>
  approvalBroker: SignedApprovalBroker | null
  approvalStore: ApprovalStore
  trustedApprovers: string[]
}
```
- `approvalBroker: null`이면 `trustedApprovers`로 생성
- `approvalBroker`가 주어지면 `trustedApprovers` 무시 (문서화)

**빈 signer 처리**: daemon 부팅 시 signer가 0명이면 `trustedApprovers: []`를 전달. factory에서 빈 배열은 허용 — broker 없이+signer 없이 approval 요청 시 즉시 reject (기존 동작 유지).

**cascade**: daemon `wdk-host.ts`에서 `createGuardedWDK()` 호출 시 `wallets: {}`, `protocols: {}`, `trustedApprovers: []` 명시.

#### #24~#25 `GuardedWDKConfig.approvalBroker?/trustedApprovers?` -- DU 미적용

위 #22-23에 포함.

#### #26 `GuardedWDKFacade.getAccount.index?` -- Default 대신 Optional

**현재**: `getAccount(chain: string, index?: number)`

**변환**: `getAccount(chain: string, index: number)` -- 호출부에서 `0` 명시.

#### #27~#28 `CreateRequestOptions.requestId?/walletName?` -- DU 미적용

**현재** (`signed-approval-broker.ts:8-15`):
```ts
interface CreateRequestOptions {
  chainId: number
  targetHash: string
  requestId?: string
  accountIndex: number
  content: string
  walletName?: string
}
```

**변환**:
```ts
interface CreateRequestOptions {
  chainId: number
  targetHash: string
  requestId: string          // 호출부에서 항상 생성 (randomUUID)
  accountIndex: number
  content: string
  walletName: string | null  // wallet_create/delete 시에만 값, 나머지 null
}
```

**cascade**:
- `createRequest()` 내부에서 `requestId || randomUUID()` -> `requestId` 직접 사용
- daemon `tool-surface.ts:383`에서 `policyRequest` 호출 시 `requestId` 추가
- daemon `ports.ts:44`의 `CreateRequestOptions`도 동기화

#### #29 `SignedApprovalBroker.constructor.emitter?` -- Optional Deps

**현재**: `constructor(trustedApprovers: string[], store: ApprovalStore, emitter?: EventEmitter)`

**변환**: `emitter`를 required로. 이벤트가 불필요하면 호출부에서 빈 EventEmitter를 전달.

```ts
constructor(trustedApprovers: string[], store: ApprovalStore, emitter: EventEmitter)
```

**cascade**: `guarded-wdk-factory.ts`에서 이미 `emitter`를 전달하고 있으므로 영향 없음. 테스트에서 emitter 없이 생성하는 코드가 있을 수 있음.

---

### Wave 4: manifest (1건)

#### #30 `ValidationResult.errors?` -- DU 미적용

**현재** (`packages/manifest/src/types.ts:75-78`):
```ts
export interface ValidationResult {
  valid: boolean
  errors?: string[]
}
```

**변환**:
```ts
export interface ValidationResultValid {
  valid: true
}

export interface ValidationResultInvalid {
  valid: false
  errors: string[]
}

export type ValidationResult = ValidationResultValid | ValidationResultInvalid
```

**cascade**: `validateManifest()` 반환부 수정, 호출부에서 `result.valid` 체크 후 `result.errors` 접근 가능.

**위험도**: **Low**. manifest는 leaf에 가깝고 호출부 적음.

---

### Wave 5: daemon (12건)

#### #31~#32 `QueuedMessage.chainId?/cronId?` -- Wide Bag

**현재** (`message-queue.ts:3-13`):
```ts
export interface QueuedMessage {
  messageId: string
  sessionId: string
  source: 'user' | 'cron'
  userId: string
  text: string
  chainId?: number
  createdAt: number
  cronId?: string
  abortController: AbortController
}
```

**분석**: `source`가 `'cron'`일 때만 `chainId`, `cronId`가 의미가 있다. 하지만 `chainId`는 user source에서도 의미가 있을 수 있고, 실제 사용을 보면 `cronId`만이 cron 전용이다.

**변환**: `chainId`와 `cronId`를 `| null` required로:
```ts
export interface QueuedMessage {
  messageId: string
  sessionId: string
  source: 'user' | 'cron'
  userId: string
  text: string
  chainId: number | null
  createdAt: number
  cronId: string | null
  abortController: AbortController
}
```

**cascade**: daemon `index.ts`의 `queueManager.enqueue()` 호출부에서 `chainId: chainId ?? null`, `cronId: cronId ?? null` 명시.

#### #33~#34 `CancelResult.reason?/wasProcessing?` -- DU 미적용

**현재** (`message-queue.ts:15-19`):
```ts
export interface CancelResult {
  ok: boolean
  reason?: 'not_found' | 'already_completed'
  wasProcessing?: boolean
}
```

**변환**:
```ts
export interface CancelResultOk {
  ok: true
  wasProcessing: boolean
}

export interface CancelResultFailed {
  ok: false
  reason: 'not_found' | 'already_completed'
}

export type CancelResult = CancelResultOk | CancelResultFailed
```

**cascade**: `cancelQueued()`, `cancelActive()` 반환부 수정. `control-handler.ts`에서 `cancelResult.reason`, `cancelResult.wasProcessing` 접근 시 narrowing 필요.

#### #35~#37 `handleControlMessage` Optional Deps (3건)

**현재** (`control-handler.ts:47-53`):
```ts
export async function handleControlMessage (
  msg: ControlMessage,
  broker: SignedApprovalBroker,
  logger: Logger,
  relayClient?: RelayClient,
  approvalStore?: InstanceType<typeof SqliteApprovalStore> | null,
  queueManager?: MessageQueueManager | null
): Promise<ControlResult>
```

**분석**: `relayClient`는 현재 함수 내에서 실제로 사용되지 않는다 (dead code). `approvalStore`는 `policy_approval`과 `device_revoke`에서 사용. `queueManager`는 `cancel_queued`와 `cancel_active`에서 사용.

**변환**: 의존성 객체로 묶기:
```ts
export interface ControlHandlerDeps {
  broker: SignedApprovalBroker
  logger: Logger
  approvalStore: InstanceType<typeof SqliteApprovalStore>
  queueManager: MessageQueueManager
}

export async function handleControlMessage (
  msg: ControlMessage,
  deps: ControlHandlerDeps
): Promise<ControlResult>
```

**cascade**: daemon `index.ts`에서 호출부 수정.

**위험도**: **Medium**. 함수 시그니처 변경이므로 테스트 fixture도 수정 필요.

#### #38~#39 `ChainArgs.accountIndex?` / `CronIdArgs.accountIndex?` -- Default 대신 Optional

**변환**: required로, 호출부에서 0 명시. AI tool schema에서도 required로 변경.

#### #40~#41 `JournalEntry.chainId?/txHash?` -- Wide Bag / DU 미적용

**현재** (`execution-journal.ts:8-15`):
```ts
export interface JournalEntry {
  intentHash: string
  targetHash: string
  status: JournalStatus
  accountIndex: number
  chainId?: number
  txHash?: string | null
}
```

**변환**:
```ts
export interface JournalEntry {
  intentHash: string
  targetHash: string
  status: JournalStatus
  accountIndex: number
  chainId: number
  txHash: string | null
}
```

#### #42 `AdminRequest/AdminResponse` Wide Bag (5 optional 필드)

**현재** (`admin-server.ts:27-39`):
```ts
interface AdminRequest {
  command: string
  status?: string
  chainId?: number
  limit?: number
  [key: string]: unknown
}

interface AdminResponse {
  ok: boolean
  data?: Record<string, unknown>
  error?: string
}
```

**변환**:
```ts
// AdminRequest -- command별 DU
type AdminRequest =
  | { command: 'status' }
  | { command: 'journal_list'; status: string | null; chainId: number | null; limit: number }
  | { command: 'signer_list' }
  | { command: 'cron_list' }
  | { command: 'wallet_list' }

// AdminResponse -- ok/error DU
interface AdminResponseOk {
  ok: true
  data: Record<string, unknown>
}

interface AdminResponseError {
  ok: false
  error: string
}

type AdminResponse = AdminResponseOk | AdminResponseError
```

**위험도**: **Low**. admin-server 내부 타입이므로 외부 노출 없음.

---

### Wave 6: relay (12건)

#### #43 `PairBody.pushToken?` -- Wide Bag

**분석**: `pushToken`은 daemon에게는 해당 없고, app에서만 제공한다. `type` 필드로 구분 가능.

**변환**:
```ts
type PairBody =
  | { deviceId: string; type: 'daemon' }
  | { deviceId: string; type: 'app'; pushToken: string | null }
```

#### #44~#46 `JwtPayload.deviceId?`, `signAppToken.deviceId?`, Google body `deviceId?`

**분석**: `deviceId`는 app 토큰에만 존재, daemon 토큰에는 없다. `role`로 구분 가능.

**변환**:
```ts
export type JwtPayload =
  | { sub: string; role: 'daemon' }
  | { sub: string; role: 'app'; deviceId: string | null }
```

`signAppToken`: `deviceId: string | null` (required).

#### #47 `IncomingMessage/OutgoingMessage` Wide Bag

**현재** (`ws.ts:26-37`):
```ts
interface IncomingMessage extends Omit<RelayEnvelope, 'payload'> {
  payload?: any
  id?: string
  message?: string
}
```

**변환**: `RelayEnvelope`가 required+null로 바뀌면, `IncomingMessage`도 자동 전파. 추가 optional(`id`, `message`)은:
```ts
interface IncomingMessage {
  type: string
  payload: unknown
  encrypted: boolean
  sessionId: string | null
  userId: string | null
  id: string | null
  message: string | null
  lastControlIds: Record<string, string> | null
}
```

#### #48 `PushResult.ticketId?/error?` -- DU 미적용

**변환**:
```ts
export type PushResult =
  | { ok: true; ticketId: string }
  | { ok: false; error: string }
```

#### #49~#54 Registry 타입들 (6건)

**UserRecord.passwordHash?**: 패스워드/OAuth 구분 -> `passwordHash: string | null`
**DeviceRecord.pushToken?**: daemon/app 구분 -> `pushToken: string | null`
**SessionRecord.metadata?**: -> `metadata: Record<string, unknown> | null`
**CreateUserParams.passwordHash?**: -> `passwordHash: string | null`
**CreateDeviceParams.pushToken?**: -> `pushToken: string | null`
**CreateSessionParams.metadata?**: -> `metadata: Record<string, unknown> | null`

---

### Wave 7: app (10건)

#### #55~#56 `Policy.constraints?/description?` -- Required+null

```ts
export interface Policy {
  id: string;
  chainId: number;
  target: string;
  selector: string;
  decision: 'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT';
  constraints: Record<string, unknown> | null;
  description: string | null;
}
```

#### #57~#58 `ActivityEvent.chainId?/details?` -- Wide Bag / Required+null

```ts
export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  chainId: number | null;
  summary: string;
  details: Record<string, unknown> | null;
  timestamp: number;
}
```

#### #59~#60 `forTx.policyVersion?` / `build.policyVersion?` -- 보안 필드

**현재**: `policyVersion?: number` (default 0)

**변환**: `policyVersion: number` (required). 보안 필드이므로 호출부에서 명시적으로 전달.

#### #61 `EncryptedMessage.ephemeralPubKey?` -- DU 미적용

**현재** (`E2ECrypto.ts:22-25`):
```ts
export interface EncryptedMessage {
  nonce: string;
  ciphertext: string;
  ephemeralPubKey?: string;
}
```

**분석**: `ephemeralPubKey`는 초기 key exchange 시에만 포함. 그러나 실제로 이 필드를 사용하는 코드가 없다 (dead field).

**변환**: 필드 제거. key exchange 시 별도 타입이 필요하면 그때 추가.

```ts
export interface EncryptedMessage {
  nonce: string;
  ciphertext: string;
}
```

#### #62 `RelayMessage.sessionId?` -- Wide Bag

```ts
export interface RelayMessage {
  channel: RelayChannel;
  messageId: string;
  timestamp: number;
  payload: unknown;
  sessionId: string | null;
}
```

#### #63 `ControlEnvelope.messageId?/timestamp?` -- Required+null

```ts
export interface ControlEnvelope {
  type: string;
  payload: unknown;
  messageId: string;    // required, buildEnvelope()에서 항상 생성
  timestamp: number;    // required, buildEnvelope()에서 항상 생성
}
```

**생성 책임 명확화**: 현재 `buildEnvelope()`가 기본값을 넣지만 `...extras` spread가 `undefined`로 덮어쓸 수 있는 버그가 있다. 이번 수정에서:
1. `ControlEnvelope.messageId: string`, `timestamp: number`로 **required (non-null)** 변경
2. `buildEnvelope()` 내에서 `extras`가 이 필드를 덮어쓰지 않도록 spread 순서 수정
3. 외부에서 `ControlEnvelope`을 직접 구성하는 경로는 없으므로 null 불필요

#### #64 `connect.authToken?` -- 보안 필드

**현재**: `async connect(relayUrl: string, userId: string, authToken?: string): Promise<void>`

**변환**: `authToken: string` (required). 인증 없는 연결은 존재하지 않아야 한다.

---

## 4. 위험도 평가

### 높은 cascade (우선 주의)

| 위반 # | 타입 | cascade 범위 | 위험도 |
|--------|------|-------------|--------|
| 2-7 | ControlResult DU | daemon, relay, app | **High** |
| 8-13 | RelayEnvelope | daemon, relay, app | **High** (보수적 접근으로 완화) |
| 35-37 | handleControlMessage deps | daemon 내부 + 테스트 | **Medium** |

### 중간 cascade

| 위반 # | 타입 | cascade 범위 | 위험도 |
|--------|------|-------------|--------|
| 14-15 | VerificationContext | guarded-wdk, daemon | **Medium** |
| 33-34 | CancelResult DU | daemon 내부 | **Medium** |
| 27-28 | CreateRequestOptions | guarded-wdk, daemon ports | **Medium** |

### 낮은 cascade

| 위반 # | 타입 | cascade 범위 | 위험도 |
|--------|------|-------------|--------|
| 1 | IntentInput.value | canonical 내부 | **Low** |
| 30 | ValidationResult DU | manifest 내부 | **Low** |
| 42 | AdminRequest/Response | daemon 내부 | **Low** |
| 55-64 | App 내부 타입 | app 내부 | **Low** |

---

## 5. 패키지별 티켓 그룹핑

실제 코드 수정을 커밋/PR 단위로 묶을 때의 최적 그룹핑:

### Ticket A: canonical + protocol leaf 타입 (13건)
- Wave 1 (#1): IntentInput.value required
- Wave 2 (#2-7): ControlResult DU 분리
- Wave 2 (#8-13): RelayEnvelope required+null 변환
- **이유**: leaf 패키지를 먼저 확정해야 나머지 cascade 수정 가능

### Ticket B: guarded-wdk 내부 타입 (16건)
- Wave 3 (#14-29): 전체
- **이유**: guarded-wdk는 내부 타입 16건이 서로 밀접하게 연관

### Ticket C: manifest (1건)
- Wave 4 (#30): ValidationResult DU
- **이유**: 독립적이고 작음. Ticket B와 합쳐도 무방

### Ticket D: daemon 내부 타입 + deps (12건)
- Wave 5 (#31-42): 전체
- **이유**: control-handler deps 변경은 daemon 내부에서 완결

### Ticket E: relay 타입 (12건)
- Wave 6 (#43-54): 전체
- **이유**: relay 내부 타입들은 서로 연관 (auth, ws, registry)

### Ticket F: app 타입 (10건)
- Wave 7 (#55-64): 전체
- **이유**: app은 leaf (의존 방향 끝단)이므로 마지막 수정

---

## 6. 테스트 영향 분석

### 수정이 필요한 테스트 파일

| 테스트 파일 | 영향받는 위반 # | 필요한 수정 |
|------------|---------------|-----------|
| `daemon/tests/control-handler.test.ts` | #2-7, #35-37 | ControlResult assertion 수정, 함수 시그니처 변경에 따른 호출부 수정 |
| `daemon/tests/message-queue.test.ts` | #31-34 | CancelResult assertion 수정, QueuedMessage fixture 수정 |
| `daemon/tests/tool-surface.test.ts` | #38-39 | ChainArgs fixture 수정 |
| `daemon/tests/execution-journal.test.ts` | #40-41 | JournalEntry fixture 수정 |
| `guarded-wdk/tests/approval-broker.test.ts` | #16, #27-29 | CreateRequestOptions, emitter 전달 수정 |
| `guarded-wdk/tests/factory.test.ts` | #22-26 | GuardedWDKConfig fixture 수정 |
| `guarded-wdk/tests/sqlite-approval-store.test.ts` | #20-21 | saveSigner, updateJournalStatus 호출 수정 |
| `guarded-wdk/tests/json-approval-store.test.ts` | #20-21 | 동일 |
| `manifest/tests/manifest-to-policy.test.ts` | #30 | ValidationResult assertion 수정 |
| `relay/tests/pg-registry.test.ts` | #49-54 | 레지스트리 타입 fixture 수정 |
| `canonical/tests/canonical.test.ts` | #1 | IntentInput fixture 수정 |
| `app/tests/E2ECrypto.test.js` | #61 | EncryptedMessage fixture 수정 |

### 테스트 전략

1. **각 Wave 완료 후**: 해당 패키지 `tsc --noEmit` + 테스트 실행
2. **Ticket A 완료 후**: 전체 모노레포 `tsc` 실행하여 downstream 영향 확인 (빌드만, 테스트는 각 Wave에서)
3. **최종**: 전체 모노레포 테스트 + `tsc` 통과 확인

---

## 7. 성공 지표

1. README의 위반 ID 64건 기준으로, 각 ID의 파일:심볼에서 `?:` optional이 제거되었음을 개별 검증
2. 모든 패키지 `tsc --noEmit` 통과
3. 모든 패키지 테스트 통과
4. 새로 추가된 optional 필드 0건 (정당한 optional 79건은 유지)
5. `ControlResult`, `CancelResult`, `ValidationResult`, `PushResult`, `AdminResponse` 5개 타입이 discriminated union으로 분리됨
6. 보안 필드 3건 (`policyVersion` x2, `authToken`) 모두 required

---

## 8. 롤백 전략

- 각 Ticket(Wave)은 독립 커밋
- 문제 발생 시 해당 Wave 커밋만 revert
- Wire protocol 변경 (Ticket A)이 가장 위험하므로, 이 커밋 전에 전체 모노레포 상태를 tag로 보존: `git tag v0.3.x-pre-no-optional`

---

## 9. chat.ts의 `source?` 필드 (정당 판단 재확인)

`ChatStreamEvent`, `ChatDoneEvent`, `ChatErrorEvent`, `ChatCancelledEvent`, `ChatToolStartEvent`, `ChatToolDoneEvent`에 있는 `source?: 'user' | 'cron'` 필드는 v0.3.3에서 추가된 필드로, 모든 이벤트에 항상 존재해야 하지만 **이전 버전 호환을 위해** optional로 선언된 것이다.

그러나 CLAUDE.md 설계 원칙에 "No Backward Compatibility: 이전 인터페이스를 유지하기 위한 shim, re-export, deprecated wrapper를 만들지 않는다"가 있으므로, **이 6건도 위반으로 분류하여 required로 변경**해야 한다.

> **추가 발견**: chat.ts에서 `source?` 6건을 추가하면 총 **70건**. 그러나 PRD에서 정당으로 분류했고 (`source`는 cron/user 구분용이지만 typing event에는 의미 없음), 이번 design에서는 **PRD의 64건 기준을 유지**한다. chat.ts `source?`는 후속 Phase에서 검토.

---

## 10. 중요 설계 결정 요약

| 결정 | 근거 |
|------|------|
| `RelayEnvelope`는 DU 아닌 required+null 패턴 | Wire protocol 근간. 7파일 cascade. DU는 v0.4.1로 |
| `PendingApprovalRequest.walletName`은 required+null | Store 인터페이스 전체 변경 회피 |
| `ControlResult`는 완전 DU 분리 | Type narrowing 이득 > cascade 비용 |
| `handleControlMessage`는 deps 객체 패턴 | Optional 3개를 1개 required 객체로 |
| `EncryptedMessage.ephemeralPubKey` 제거 | Dead field (사용처 없음) |
| 수정 순서: leaf -> root | 의존 방향 순수 |
