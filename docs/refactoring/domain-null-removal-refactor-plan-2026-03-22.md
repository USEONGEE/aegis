# Domain Model `| null` Removal Refactoring Plan

**Date**: 2026-03-22
**Phase**: v0.4.9 (proposed)
**Scope**: ~43 domain `| null` occurrences across 5 packages
**Principle**: "No Optional" + "DU over Optional"

---

## Summary

프로젝트의 "No Optional" 원칙에 따라 도메인 모델 타입의 `| null` ~43건을 해소한다.
각 `| null`의 의미론을 분석하여 discriminated union, 기본값, 필드 삭제, 또는 타입 분리로 전환한다.
DB Row 타입(`store-types.ts`)의 null은 DB 경계에 해당하므로 유지하되,
도메인 인터페이스로의 매핑 레이어에서 변환을 수행한다.

---

## Current State Analysis

### Scope Boundary

| Category | Count | In Scope | 비고 |
|---|---|---|---|
| Domain model `\| null` | ~43 | YES | 이 계획의 대상 |
| DB Row types (`store-types.ts`) | ~12 | NO | DB 경계, null 유지 |
| External API / relay auth | ~15 | NO | 외부 경계 |
| RN App UI state (`useState<X \| null>`) | ~10 | NO | React 패턴 |
| Infrastructure (timer, ws, db handle) | ~15 | NO | 런타임 리소스 |

### Excluded Categories (rationale)

1. **DB Row types** (`store-types.ts`): `wallet_name: string | null`, `chain_id: number | null` 등은 SQLite 스키마의 nullable 컬럼과 1:1 대응. store 구현체 내부에서 도메인 타입으로 변환한다.
2. **Relay auth** (`auth.ts`): `verifyToken(): JwtPayload | null`, `deviceId: string | null` 등은 HTTP 경계의 검증 결과. 도메인 모델이 아님.
3. **RN App UI state**: `useState<string | null>(null)` 등은 React의 초기화 전 상태 표현. 도메인 모델이 아님.
4. **Infrastructure handles**: `_db: Database | null`, `_ws: WebSocket | null`, `_timer: ... | null` 등은 리소스 생명주기 관리.

---

## Identified Issues and Refactoring Targets

### Pattern 1: `chainId: number | null` (Critical, 6 sites)

**Current**: null = "전체 체인 (chain-agnostic)"

**Affected files**:
- `packages/guarded-wdk/src/wdk-store.ts` (HistoryEntry, loadPendingApprovals param, listCrons param)
- `packages/daemon/src/daemon-store.ts` (CronInput, StoredCron, DaemonStore.listCrons)
- `packages/daemon/src/message-queue.ts` (QueuedMessage)
- `packages/daemon/src/cron-scheduler.ts` (CronBase, CronDispatch)
- `packages/app/src/stores/useActivityStore.ts` (ActivityEvent)

**Consumers**:
- `sqlite-wdk-store.ts:291-296`: SQL `WHERE chain_id = ?` 조건부 추가 (null이면 필터 생략)
- `sqlite-daemon-store.ts:51-54`: 동일 패턴
- `cron-scheduler.ts:85`: `this._store.listCrons(null)` -- "전체" 의미
- `cron-scheduler.ts:168`: `this._dispatch(..., cron.chainId)` -- 전달만
- `tool-surface.ts:368,426`: `accountIndex ?? null` -- "전체" 의미
- `query-handler.ts:34`: `facade.getPendingApprovals(msg.params.accountIndex, null, null)` -- "전체" 의미

**Problem**: null이 "all chains"와 "no chain specified"를 구분 없이 표현.

**Solution -- Split into two patterns**:

**(A) Filter/Query Parameters**: `loadPendingApprovals`, `listCrons` 등의 필터 파라미터에서 null = "전체" 의미

```typescript
// BEFORE
loadPendingApprovals(accountIndex: number | null, type: string | null, chainId: number | null)
listCrons(accountIndex: number | null)

// AFTER -- DU filter type
interface PendingApprovalFilter {
  accountIndex?: number   // Query opts에는 optional 허용 (No Optional은 domain model에 적용)
  type?: ApprovalType
  chainId?: number
}
loadPendingApprovals(filter: PendingApprovalFilter): Promise<PendingApprovalRequest[]>

// Cron도 동일
listCrons(filter: CronFilter): Promise<StoredCron[]>
```

> Note: `HistoryQueryOpts`, `JournalQueryOpts`, `RejectionQueryOpts`는 이미 이 패턴을 사용 중.
> `loadPendingApprovals`만 null 파라미터를 사용하고 있어 일관성이 없다.
> Query/Filter 파라미터의 optional은 "No Optional" 위반이 아님 -- 도메인 모델이 아닌 쿼리 조건이므로.

**(B) Domain Field**: `HistoryEntry.chainId`, `CronInput.chainId`, `QueuedMessage.chainId`, `ActivityEvent.chainId`

```typescript
// BEFORE
chainId: number | null   // null = "chain-agnostic"

// AFTER -- sentinel value (0 is invalid chain ID)
// OR -- 별도 타입 분리

// Option 1: ChainScope DU (recommended for Cron)
type ChainScope = { kind: 'specific'; chainId: number } | { kind: 'all' }

// Option 2: ActivityEvent는 이미 optional chain context → 별도 variant
// ActivityEvent는 이벤트 타입마다 chainId 유무가 결정적:
// - IntentProposed, PolicyEvaluated 등: 항상 chainId 있음
// - SignerRevoked, WalletCreated 등: chainId 없음
// → 이벤트 타입별 DU를 써야 하지만 App store 설계와 충돌
// → 현실적으로 이 1건은 app UI 경계이므로 scope 외로 유지
```

**Recommendation**:
- **(A) Filter params**: `PendingApprovalFilter` 객체로 전환 (기존 `*QueryOpts` 패턴과 일관성)
- **(B-1) CronInput/StoredCron/QueuedMessage/CronDispatch**: `ChainScope` DU 도입
- **(B-2) HistoryEntry.chainId**: `chainId: number`로 변경 (현재 SignedApproval.chainId는 항상 number)
- **(B-3) ActivityEvent.chainId**: App UI 경계 -- scope 외 유지

**Effort**: Medium (5 files, 2 store implementations, 3 test files)

---

### Pattern 2: `walletName: string | null` (Major, 4 sites)

**Current**: null = "사용자가 이름을 제공하지 않음"

**Affected files**:
- `packages/guarded-wdk/src/wdk-store.ts` (PendingApprovalRequest, StoredSigner, saveSigner param)
- `packages/daemon/src/ports.ts` (CreateRequestOptions)
- `packages/guarded-wdk/src/guarded-wdk-factory.ts` (CreateRequestOptions)
- `packages/guarded-wdk/src/signed-approval-broker.ts` (CreateRequestOptions, fallback logic)

**Consumers**:
- `signed-approval-broker.ts:182`: `(pending as PendingApprovalRequest | null)?.walletName ?? 'Wallet ${accountIndex}'` -- 기본값 fallback
- `tool-surface.ts:391`: `walletName: null` -- policyRequest에서 항상 null 전달

**Problem**: null은 항상 fallback 기본값으로 대체됨. "이름 없음"이라는 도메인 의미가 실재하지 않음.

**Solution -- Default value at creation boundary**:

```typescript
// BEFORE
interface PendingApprovalRequest extends ApprovalRequest {
  walletName: string | null
}

// AFTER
interface PendingApprovalRequest extends ApprovalRequest {
  walletName: string   // 생성 시점에 기본값 확정: name || `Wallet ${accountIndex}`
}
```

변경 영향:
- `signed-approval-broker.ts`: `createRequest`에서 `walletName ?? 'Wallet ${accountIndex}'`를 확정
- `tool-surface.ts`: `walletName: ''` 또는 `walletName: 'AI Policy'` 등 의미 있는 값 전달
- `store-types.ts`: `wallet_name: string | null` 유지 (DB row, 기존 데이터 호환)
- Store 구현: DB에서 읽을 때 `?? 'Wallet'` 변환

**Effort**: Low (3 files, fallback 이동만)

---

### Pattern 3: `signedApproval: SignedApproval | null` (Major, 2 sites)

**Current**: null = "아직 서명 안 됨" 또는 "거부됨"

**Affected files**:
- `packages/guarded-wdk/src/wdk-store.ts` (HistoryEntry)
- `packages/guarded-wdk/src/store-types.ts` (StoredHistoryEntry.signed_approval_json)

**Consumers**:
- `signed-approval-broker.ts:205-216`: `appendHistory`에 signedApproval을 항상 전달 (approved/rejected 모두)
- `sqlite-wdk-store.ts`: JSON serialize/deserialize만

**Analysis**:
현재 `appendHistory`를 호출하는 곳은 `signed-approval-broker.ts:205`뿐이며,
항상 `signedApproval` 인자를 전달한다. 따라서 `signedApproval: SignedApproval | null`에서
null 경로는 실제로 도달하지 않는다.

그러나 `action: 'rejected'`인 경우에도 signedApproval이 존재하는 것은 맞다
(rejection도 서명된 요청이므로). 따라서:

**Solution -- DU by action**:

```typescript
// BEFORE
interface HistoryEntry {
  action: HistoryAction            // 'approved' | 'rejected'
  signedApproval: SignedApproval | null
  // ...other fields
}

// AFTER -- signedApproval은 항상 존재 (null 제거)
interface HistoryEntry {
  action: HistoryAction
  signedApproval: SignedApproval   // always present (approved OR rejected both have signed envelope)
  // ...other fields
}
```

- DB row의 `signed_approval_json: string | null`은 유지 (기존 row 호환)
- Store 구현에서 null row → 기본 empty SignedApproval로 변환하거나, 해당 row를 건너뛸 수 있음
- 현재 실제 null이 들어오는 경로가 없으므로 breaking 위험 없음

**Effort**: Low (타입 변경 + store 매핑 1곳)

---

### Pattern 4: `context: EvaluationContext | null` (Critical, 5 sites)

**Current**: null = "정책 매칭 상세 정보 없음" (정책이 없거나, 매칭 시도 전 거부)

**Affected files**:
- `packages/guarded-wdk/src/wdk-store.ts` (RejectionEntry)
- `packages/guarded-wdk/src/guarded-middleware.ts` (EvaluationResult)
- `packages/guarded-wdk/src/errors.ts` (PolicyRejectionError)
- `packages/daemon/src/tool-surface.ts` (IntentRejectedResult, TransferRejectedResult, errObj)
- `packages/protocol/src/events.ts` (PolicyEvaluatedEvent)

**Analysis -- evaluatePolicy return paths**:

| Return path | context value | Reason |
|---|---|---|
| No policies for chain | `null` | 정책 자체가 없음 |
| Timestamp too early/expired | `null` | 시간 정책 위반, call 정책과 무관 |
| No call policy | `null` | call 정책이 없음 |
| Missing tx.to | `null` | 트랜잭션 형식 오류 |
| Missing tx.data | `null` | 트랜잭션 형식 오류 |
| Matched rule (ALLOW/REJECT) | `null` | 규칙이 직접 매칭됨, 실패 상세 불필요 |
| No matching permission (candidates exist) | `{ target, selector, effectiveRules, ruleFailures }` | 후보 있었으나 조건 불일치 |

**Solution -- DU for rejection reason**:

context가 null인 경우는 "상세 정보가 의미 없는" 거부이고,
non-null인 경우는 "규칙 후보가 있었으나 조건 불일치"이다.
이를 DU로 표현:

```typescript
// BEFORE
interface EvaluationResult {
  decision: Decision
  matchedPermission: Rule | null
  reason: string
  context: EvaluationContext | null
}

// AFTER
type EvaluationOutcome =
  | { decision: 'ALLOW'; matchedPermission: Rule; reason: 'matched' }
  | { decision: 'REJECT'; reason: string }                              // simple rejection (no candidates)
  | { decision: 'REJECT'; reason: string; context: EvaluationContext }  // rejection with diagnostics

// 그러나 이 변경은 matchedPermission도 동시에 해소해야 하므로 Pattern 6과 결합해야 함
```

**Practical alternative -- 빈 context 기본값**:

EvaluationContext에 empty state를 도입하면 null 없이 표현 가능:

```typescript
// context가 없는 경우 빈 EvaluationContext 사용
const EMPTY_CONTEXT: EvaluationContext = {
  target: '',
  selector: '',
  effectiveRules: [],
  ruleFailures: []
}
```

그러나 이는 "Primitive First" 원칙 위반이며 empty object anti-pattern이다.

**Recommended approach -- Pattern 4 + 6 결합 DU**:

Pattern 6 (matchedPermission)과 함께 `EvaluationResult`를 완전한 DU로 전환:

```typescript
type EvaluationResult =
  | { decision: 'ALLOW'; matchedPermission: Rule; reason: 'matched' }
  | { decision: 'REJECT'; reason: string }
  | { decision: 'REJECT'; reason: string; context: EvaluationContext }
```

그러나 이 3-variant DU에서 "context 유무"를 구분하려면 discriminant가 필요:

```typescript
type EvaluationResult =
  | AllowResult
  | SimpleRejectResult
  | DetailedRejectResult

interface AllowResult {
  kind: 'allow'
  matchedPermission: Rule
}

interface SimpleRejectResult {
  kind: 'reject'
  reason: string
}

interface DetailedRejectResult {
  kind: 'reject_with_context'
  reason: string
  context: EvaluationContext
}
```

**Impact on downstream**:
- `PolicyRejectionError`: context 필드를 optional이 아닌 DU로
- `RejectionEntry`: rejection을 저장할 때 context 유무를 반영
- `tool-surface.ts`: errObj가 context를 추출하는 방식 변경
- `protocol/events.ts`: PolicyEvaluatedEvent의 wire 형식 변경 필요

**Effort**: High (guarded-middleware 핵심 함수 + 이벤트 체인 전체)

---

### Pattern 5: `targetPublicKey: string | null` (Minor, 1 site)

**Current**: device_revoke 타입에서만 사용, 나머지는 null

**Affected file**:
- `packages/app/src/core/approval/types.ts` (ApprovalRequest)

**Analysis**:
이 필드는 App-local 타입. device_revoke일 때만 값이 있고, 나머지 5개 ApprovalType에서는 null.
전형적인 "DU over Optional" 위반.

**Solution -- DU by ApprovalType**:

```typescript
// BEFORE
interface ApprovalRequest {
  requestId: string
  type: ApprovalType
  chainId: number
  targetHash: string
  accountIndex: number
  content: string
  policyVersion: number
  createdAt: number
  expiresAt: number
  targetPublicKey: string | null   // only for device_revoke
}

// AFTER
interface ApprovalRequestBase {
  requestId: string
  chainId: number
  targetHash: string
  accountIndex: number
  content: string
  policyVersion: number
  createdAt: number
  expiresAt: number
}

type ApprovalRequest =
  | (ApprovalRequestBase & { type: 'tx' })
  | (ApprovalRequestBase & { type: 'policy' })
  | (ApprovalRequestBase & { type: 'policy_reject' })
  | (ApprovalRequestBase & { type: 'device_revoke'; targetPublicKey: string })
  | (ApprovalRequestBase & { type: 'wallet_create' })
  | (ApprovalRequestBase & { type: 'wallet_delete' })
```

**Impact**: App-local only. control-handler에서 `device_revoke` payload 구성 시 `targetPublicKey`를 계산하여 전달.

**Effort**: Low (App 패키지 내부, 1 file + consumers)

---

### Pattern 6: `matchedPermission: Rule | null` (Major, 2 sites)

**Current**: ALLOW일 때만 Rule populated, REJECT면 null

**Affected files**:
- `packages/guarded-wdk/src/guarded-middleware.ts` (EvaluationResult)
- `packages/protocol/src/events.ts` (PolicyEvaluatedEvent)

**Analysis**: Pattern 4 (context)와 완전히 결합됨. evaluatePolicy 반환값에서:
- ALLOW: `{ decision: 'ALLOW', matchedPermission: Rule, context: null }`
- REJECT: `{ decision: 'REJECT', matchedPermission: null, context: EvaluationContext | null }`

이 두 null은 decision에 의해 결정론적이므로 DU가 자연스러움.

**Solution**: Pattern 4의 결합 DU 참조. `EvaluationResult`를 3-variant DU로 전환하면
matchedPermission과 context의 null이 동시에 해소됨.

**Wire impact** (protocol/events.ts):

```typescript
// BEFORE
interface PolicyEvaluatedEvent {
  matchedPermission: PolicyRuleWire | null
  reason: string | null
  context: PolicyEvaluationContextWire | null
}

// AFTER
interface PolicyEvaluatedAllowed {
  type: 'PolicyEvaluated'
  decision: 'ALLOW'
  matchedPermission: PolicyRuleWire
  // reason 생략 (항상 'matched')
}

interface PolicyEvaluatedRejected {
  type: 'PolicyEvaluated'
  decision: 'REJECT'
  reason: string
}

interface PolicyEvaluatedRejectedWithContext {
  type: 'PolicyEvaluated'
  decision: 'REJECT'
  reason: string
  context: PolicyEvaluationContextWire
}
```

그러나 wire protocol 변경은 app과의 호환을 위해 단계적 전환이 필요하다.
동시 배포 전제이므로 한 번에 전환 가능하지만, 이벤트 소비 코드 전체 수정 필요.

**Effort**: High (Pattern 4와 결합 -- 동일 작업)

---

### Pattern 7: `currentPolicyVersion: number | null` + `expectedTargetHash: string | null` (Minor, 1 site)

**Current**:
- `currentPolicyVersion`: 항상 null 전달 (dead field)
- `expectedTargetHash`: ApprovalSubmitContext의 kind에 따라 조건부

**Affected file**:
- `packages/guarded-wdk/src/approval-verifier.ts` (VerificationContext)

**Analysis**:

`signed-approval-broker.ts:101-103`에서 VerificationContext 구성:
```typescript
const verificationContext: VerificationContext = {
  currentPolicyVersion: null,                    // ALWAYS null
  expectedTargetHash: 'expectedTargetHash' in context ? context.expectedTargetHash : null
}
```

`currentPolicyVersion`은 verifier에서 `!== null` 검사 후에만 사용되므로 항상 skip됨.
이는 dead code이다.

**Solution**:

```typescript
// BEFORE
interface VerificationContext {
  currentPolicyVersion: number | null
  expectedTargetHash: string | null
}

// AFTER
interface VerificationContext {
  expectedTargetHash: string | null   // 유지: null = "해시 검증 skip" (valid semantic)
}
```

Wait -- `expectedTargetHash: string | null`도 null이 "skip verification"이라는 의미.
이것도 DU로 표현 가능:

```typescript
// Full DU version
type VerificationContext =
  | { kind: 'verify_hash'; expectedTargetHash: string }
  | { kind: 'skip_hash' }
```

그러나 이 함수의 caller는 1곳(`signed-approval-broker.ts`)뿐이고, switch-case로 분기하면 오히려 코드가 복잡해짐.

**Recommendation**:
- `currentPolicyVersion` 필드 삭제 (dead field)
- `expectedTargetHash` null은 유지 -- internal API, 단일 caller, "skip" 의미가 명확

**Effort**: Very Low (1 file, 2 lines)

---

### Pattern 8: Relay/Protocol Domain null (Major, 5 fields)

**Current**: `RelayEnvelope`의 5개 nullable 필드

```typescript
interface RelayEnvelope {
  sessionId: string | null       // null when not session-scoped
  userId: string | null          // null before authentication
  daemonId: string | null        // null for non-daemon senders
  userIds: string[] | null       // null for non-daemon senders
  lastControlIds: Record<string, string> | null  // null when no cursors
}
```

**Affected files**:
- `packages/protocol/src/relay.ts` (RelayEnvelope)
- `packages/relay/src/routes/ws.ts` (IncomingMessage -- RelayEnvelope 미러)

**Analysis**:
이 필드들은 wire 메시지의 "방향별 의미"가 다르다:

| Field | authenticate | control (daemon->app) | chat | heartbeat |
|---|---|---|---|---|
| sessionId | - | - | required | - |
| userId | - | required | - | - |
| daemonId | response only | - | - | - |
| userIds | response only | - | - | - |
| lastControlIds | daemon auth payload | - | - | - |

현재 하나의 `RelayEnvelope`이 모든 방향/채널의 superset 역할을 하고 있으며,
각 사용처에서 `if (msg.userId)`, `if (msg.sessionId)` 등으로 런타임 분기.

**Solution -- Channel-discriminated message types** (v0.4.8에서 일부 진행):

```typescript
// v0.4.8에서 ControlMessage, ChatMessage, QueryMessage 등이 이미 분리됨.
// RelayEnvelope 자체를 DU로 전환:

type RelayMessage =
  | AuthenticateMessage
  | ControlMessage
  | ChatMessage
  | HeartbeatMessage
  | QueryMessage
  | QueryResultMessage

interface AuthenticateMessage {
  type: 'authenticate'
  payload: { token: string; lastControlIds?: Record<string, string>; lastStreamId?: string }
}

interface ControlMessage {
  type: 'control'
  userId: string        // required (not null)
  payload: unknown
  encrypted: boolean
}

interface ChatMessage {
  type: 'chat'
  sessionId: string     // required (not null)
  payload: unknown
  encrypted: boolean
}
```

그러나 이 변경은 v0.4.8 WS 채널 재설계와 중복될 수 있다.
v0.4.8 상태를 확인해야 함.

**Recommendation**: v0.4.8이 RelayEnvelope 구조를 이미 다루고 있다면 거기서 처리.
독립적으로 진행할 경우, `IncomingMessage`를 DU로 전환하되
`RelayEnvelope` wire 타입은 backward-compatible하게 유지 후 단계적 제거.

**Effort**: High (relay + daemon + app 동시 변경, v0.4.8과 조율 필요)

---

### Pattern 9: Additional Domain nulls (discovered during analysis)

#### 9a. `StoredSigner.name: string | null` + `StoredSigner.revokedAt: number | null`

- `name: string | null`: Pattern 2와 동일. 기본값으로 해소.
- `revokedAt: number | null`: null = "active". DU로 표현 가능:

```typescript
// BEFORE
interface StoredSigner {
  publicKey: string
  name: string | null
  registeredAt: number
  revokedAt: number | null
}

// AFTER
interface StoredSigner {
  publicKey: string
  name: string              // default at creation
  registeredAt: number
  status: SignerStatus
}

type SignerStatus =
  | { kind: 'active' }
  | { kind: 'revoked'; revokedAt: number }
```

소비자: `wdk-host.ts:55` (`d.revokedAt === null`), `signed-approval-broker.ts:170` (동일)

#### 9b. `StoredJournal.txHash: string | null` + `PolicyVersionEntry.diff: PolicyDiff | null`

- `txHash`: null = "아직 tx hash 미확정" (signed/received 상태). settled일 때만 값 있음.
  DU로: `{ status: 'settled'; txHash: string } | { status: ...; /* no txHash */ }`
  그러나 StoredJournal은 status + txHash 조합이므로 status DU에 txHash를 내장하면 됨.
- `diff`: null = "최초 버전 (이전 정책 없음)". DU로 분리 가능하나, 이력 조회에만 사용되므로 우선순위 낮음.

#### 9c. `ExecutionJournal` logger/constructor nulls

- `_logger: JournalLogger | null`: constructor에서 optional 주입. null = "no logging"
  - Solution: NullLogger 패턴 (`{ info() {}, error() {} }`) -- Primitive First에 부합
- `getStatus(): JournalStatus | null`: Map.get 결과. 이는 조회 API의 "not found" 의미.
  - 조회 API의 "not found" null은 합리적이나, 프로젝트 원칙에 따르면 `undefined`가 아닌 explicit error가 낫다.
  - 현재 이 메서드는 호출되는 곳이 없다 (dead method). 삭제 가능.

#### 9d. `tool-surface.ts` result type nulls

```typescript
interface SendTransactionExecuted {
  hash: string | null       // null = sendTransaction 결과에 hash 없음
  fee: string | null        // null = fee 미보고
}

interface SignTransactionSigned {
  signedTx: string | null   // null = signTransaction이 string 미반환
}
```

이들은 WDK 외부 인터페이스(`ToolAccount`)의 반환값 불확실성을 반영.
`sendTransaction`이 `{ hash?: string | null }` 를 반환하는 것은 WDK 외부 의존성.

**Solution**: ToolAccount 인터페이스를 strict하게 재정의하여 항상 필수 반환하도록 하거나,
result DU에 성공/부분성공을 구분:

```typescript
// Current (result from external WDK)
sendTransaction(tx: ...): Promise<{ hash?: string | null; fee?: bigint | null }>

// Strict boundary
sendTransaction(tx: ...): Promise<TransactionResult>  // { hash: string; fee: bigint }
```

외부 의존성이므로 경계 변환 레이어에서 처리. guarded-middleware가 이미 `TransactionResult` 타입을 정의하고 있으므로, tool-surface의 `ToolAccount`가 이를 따르도록 수정.

---

## Proposed Refactoring Plan

### Step 1: Dead Field Cleanup (Very Low Risk)
**Scope**: Pattern 7 (`currentPolicyVersion`) + Pattern 9c (dead `getStatus`)
**Files**: 2
**Effort**: 0.5h

1. `approval-verifier.ts`: `VerificationContext`에서 `currentPolicyVersion` 제거
2. `signed-approval-broker.ts`: `verificationContext` 구성에서 해당 필드 제거
3. `execution-journal.ts`: `getStatus()` 메서드 삭제 (unused)
4. 테스트 업데이트 (있다면)

**Acceptance Criteria**:
- `tsc --noEmit` 통과
- 기존 테스트 전부 통과
- `verifyApproval`의 6단계 검증 로직 변경 없음

---

### Step 2: Default Value Conversions (Low Risk)
**Scope**: Pattern 2 (`walletName`), Pattern 9a (`StoredSigner.name`), Pattern 9c (NullLogger)
**Files**: ~8
**Effort**: 1h

1. `PendingApprovalRequest.walletName`: `string | null` -> `string`
   - `signed-approval-broker.ts:createRequest`: fallback 확정 (`walletName || 'Wallet ${accountIndex}'`)
   - `tool-surface.ts:391`: `walletName: 'Policy Request'`
   - Store 구현 2곳: DB null -> fallback 값 매핑

2. `StoredSigner.name`: `string | null` -> `string`
   - `saveSigner(publicKey, name)`: `name || publicKey.slice(0, 8)` 확정
   - Store 구현 2곳: DB null -> fallback 매핑

3. `ExecutionJournal` logger: `JournalLogger | null` -> `JournalLogger`
   - NullLogger 기본값: `{ info() {}, error() {} }`

4. `CreateRequestOptions.walletName` (daemon/ports.ts, guarded-wdk-factory.ts): `string | null` -> `string`

**Acceptance Criteria**:
- `tsc --noEmit` 통과
- 기존 테스트 전부 통과
- `walletName`이 null인 DB row 읽기 시 fallback 값 적용 확인

---

### Step 3: Filter Parameter Consolidation (Low Risk)
**Scope**: Pattern 1A (loadPendingApprovals, listCrons 필터 파라미터)
**Files**: ~12
**Effort**: 2h

1. `PendingApprovalFilter` 인터페이스 도입 (기존 `*QueryOpts` 패턴과 일관성):
   ```typescript
   interface PendingApprovalFilter {
     accountIndex?: number
     type?: ApprovalType
     chainId?: number
   }
   ```

2. `WdkStore.loadPendingApprovals(filter: PendingApprovalFilter)` 시그니처 변경
3. `DaemonStore.listCrons(filter: CronFilter)` 시그니처 변경
4. 모든 caller 업데이트:
   - `guarded-wdk-factory.ts`: `getPendingApprovals`
   - `signed-approval-broker.ts`: `getPendingApprovals`
   - `tool-surface.ts`: `facade.getPendingApprovals`
   - `query-handler.ts`: `facade.getPendingApprovals`
   - `cron-scheduler.ts`: `this._store.listCrons`
5. Store 구현 2곳 (sqlite, json): 내부 로직 변경 없음 (필드 추출만)
6. 테스트 3곳: 호출 시그니처 업데이트
7. Ports 인터페이스 업데이트 (`ToolFacadePort`, `QueryFacadePort`)

**Acceptance Criteria**:
- `tsc --noEmit` 통과
- 기존 테스트 전부 통과
- `loadPendingApprovals({})` = 전체, `loadPendingApprovals({ chainId: 1 })` = 필터

---

### Step 4: HistoryEntry null Removal (Low Risk)
**Scope**: Pattern 3 (`signedApproval`), Pattern 1B-2 (`HistoryEntry.chainId`)
**Files**: ~4
**Effort**: 1h

1. `HistoryEntry.signedApproval`: `SignedApproval | null` -> `SignedApproval`
   - 현재 null path가 없으므로 타입만 변경
   - Store 구현: DB null 방어 코드 추가 (기존 데이터 마이그레이션 불필요 -- null row 시 skip)

2. `HistoryEntry.chainId`: `number | null` -> `number`
   - SignedApproval.chainId가 항상 number이므로 history 기록 시 항상 값이 있음
   - Store 구현: 기존 null row는 0으로 변환

**Acceptance Criteria**:
- `tsc --noEmit` 통과
- 기존 테스트 전부 통과

---

### Step 5: Cron ChainScope DU (Medium Risk)
**Scope**: Pattern 1B-1 (`CronInput.chainId`, `StoredCron.chainId`, `QueuedMessage.chainId`)
**Files**: ~6
**Effort**: 2h

1. `ChainScope` 타입 도입:
   ```typescript
   type ChainScope =
     | { kind: 'specific'; chainId: number }
     | { kind: 'all' }
   ```

2. `CronInput`, `StoredCron`, `CronBase`, `CronEntry`, `CronListItem`, `CronDispatch` 변경
3. `QueuedMessage.chainId` 변경
4. `cron-scheduler.ts`: tick에서 dispatch 호출 시 ChainScope 전달
5. `sqlite-daemon-store.ts`: DB row 변환 (null -> `{ kind: 'all' }`)
6. `tool-surface.ts`: registerCron에서 ChainScope 구성

**Acceptance Criteria**:
- `tsc --noEmit` 통과
- Cron 등록/실행 flow 테스트 통과
- `switch (chainScope.kind)` exhaustiveness check 통과

---

### Step 6: EvaluationResult DU (High Risk, High Value)
**Scope**: Pattern 4 + 6 (`context`, `matchedPermission`)
**Files**: ~10
**Effort**: 4h

1. `EvaluationResult` DU 정의:
   ```typescript
   type EvaluationResult =
     | AllowResult
     | SimpleRejectResult
     | DetailedRejectResult

   interface AllowResult {
     kind: 'allow'
     matchedPermission: Rule
   }

   interface SimpleRejectResult {
     kind: 'reject'
     reason: string
   }

   interface DetailedRejectResult {
     kind: 'reject_with_context'
     reason: string
     context: EvaluationContext
   }
   ```

2. `evaluatePolicy()` 함수 반환값 변경 (guarded-middleware.ts)
3. `PolicyRejectionError` 변경:
   ```typescript
   // BEFORE
   context: EvaluationContext | null

   // AFTER: DU 전달
   evaluationResult: SimpleRejectResult | DetailedRejectResult
   ```
4. 이벤트 emit 수정: `PolicyEvaluated` 이벤트 payload에 kind 기반 분기
5. `tool-surface.ts`: errObj에서 context 추출 로직 수정
6. `RejectionEntry`: context를 optional로 유지하되 store 경계에서 변환
7. `protocol/events.ts`: `PolicyEvaluatedEvent` wire 타입 변경

**Wire compatibility note**:
- 동시 배포 전제이므로 wire breaking change 허용
- App이 `PolicyEvaluated` 이벤트를 소비하는 곳 확인 필요

**Acceptance Criteria**:
- `tsc --noEmit` 통과
- evaluatePolicy 단위 테스트 전부 통과
- `kind` discriminant로 exhaustive switch 가능

---

### Step 7: StoredSigner Status DU (Medium Risk)
**Scope**: Pattern 9a (`revokedAt`)
**Files**: ~6
**Effort**: 1.5h

1. `SignerStatus` DU:
   ```typescript
   type SignerStatus =
     | { kind: 'active' }
     | { kind: 'revoked'; revokedAt: number }
   ```

2. `StoredSigner` 변경:
   ```typescript
   interface StoredSigner {
     publicKey: string
     name: string           // Step 2에서 이미 non-null
     registeredAt: number
     status: SignerStatus   // revokedAt 대체
   }
   ```

3. 소비자 업데이트:
   - `wdk-host.ts:55`: `d.revokedAt === null` -> `d.status.kind === 'active'`
   - `signed-approval-broker.ts:170`: 동일
   - `admin-server.ts:200`: signer list API 변환
4. Store 구현: DB row의 `revoked_at` null -> `{ kind: 'active' }` 변환

**Acceptance Criteria**:
- `tsc --noEmit` 통과
- Signer revocation flow 테스트 통과

---

### Step 8: App ApprovalRequest DU (Low Risk)
**Scope**: Pattern 5 (`targetPublicKey`)
**Files**: ~3 (App 내부)
**Effort**: 1h

1. `ApprovalRequest` DU by type (App 로컬 타입):
   ```typescript
   type ApprovalRequest =
     | TxApprovalRequest
     | PolicyApprovalRequest
     | DeviceRevokeApprovalRequest
     | WalletCreateApprovalRequest
     | WalletDeleteApprovalRequest
   ```

2. `targetPublicKey`는 `DeviceRevokeApprovalRequest`에만 존재
3. App UI에서 switch by type 시 exhaustive check

**Acceptance Criteria**:
- `tsc --noEmit` 통과
- App approval flow 테스트 통과

---

### Step 9: Tool Result null Cleanup (Medium Risk)
**Scope**: Pattern 9d (`hash`, `fee`, `signedTx` nulls in tool-surface)
**Files**: ~2
**Effort**: 1.5h

1. `ToolAccount` 인터페이스 strict화:
   ```typescript
   interface ToolAccount {
     sendTransaction(tx: ...): Promise<{ hash: string; fee: bigint }>
     signTransaction(tx: ...): Promise<{ signedTx: string; intentHash: string; requestId: string }>
   }
   ```

2. guarded-middleware의 `TransactionResult`, `SignTransactionResult`는 이미 non-null.
   tool-surface의 `ToolAccount`만 sync하면 됨.

3. Result types 변경:
   - `SendTransactionExecuted.hash`: `string` (not null)
   - `SendTransactionExecuted.fee`: `string` (not null)
   - `SignTransactionSigned.signedTx`: `string` (not null)

4. `|| null` fallback 제거 (tool-surface.ts:289, 316, 462)

**Acceptance Criteria**:
- `tsc --noEmit` 통과
- tool-surface 단위 테스트 통과

---

### Step 10: Relay Envelope DU (Deferred / v0.4.8 coordination)
**Scope**: Pattern 8
**Status**: v0.4.8 WS 채널 재설계 진행 상태에 따라 결정

이 단계는 v0.4.8과의 충돌 가능성이 높으므로 별도 Phase로 분리하거나
v0.4.8에 포함시킬 것을 권고.

---

## Risk Assessment

| Step | Risk | Impact | Mitigation |
|---|---|---|---|
| 1. Dead field cleanup | Very Low | guarded-wdk only | 단일 파일, 동작 변경 없음 |
| 2. Default values | Low | guarded-wdk + daemon | 기존 null -> 기본값, backward compatible DB |
| 3. Filter params | Low | All packages | 시그니처만 변경, 로직 동일 |
| 4. History null removal | Low | guarded-wdk | null path가 없으므로 타입만 변경 |
| 5. Cron ChainScope | Medium | daemon | DU 도입, cron scheduler 전체 경로 |
| 6. EvaluationResult DU | **High** | guarded-wdk + daemon + protocol + app | 핵심 policy 평가 경로 변경 |
| 7. Signer Status DU | Medium | guarded-wdk + daemon | 인증/폐기 경로 |
| 8. App ApprovalRequest | Low | App only | App 내부 변경 |
| 9. Tool Result nulls | Medium | daemon | 외부 WDK 의존성 경계 |
| 10. Relay Envelope | **High** | relay + daemon + app + protocol | Wire protocol 변경, v0.4.8 조율 |

### Rollback Strategy
- 각 Step은 독립 커밋으로 분리
- Step 1-4: 개별 revert 가능 (의존성 없음)
- Step 5: 독립 revert 가능
- Step 6: 가장 큰 변경. revert 시 Step 7도 함께 revert 필요할 수 있음
- Step 7-9: 개별 revert 가능
- Step 10: 별도 Phase

---

## Testing Strategy

### Unit Tests
- `evaluate-policy.test.ts`: 모든 반환 경로에서 DU variant 검증
- `approval-broker.test.ts`: walletName 기본값 확인
- `sqlite-wdk-store.test.ts`: null DB row -> 도메인 변환 확인
- `json-wdk-store.test.ts`: 동일
- `tool-surface.test.ts`: result type null 제거 확인

### Integration Tests
- `integration.test.ts`: policy evaluation -> rejection -> event 전체 경로
- `factory.test.ts`: facade 메서드 시그니처 호환

### Type-level Tests
- `tsc --noEmit` (CI)
- `never` exhaustiveness check가 모든 switch-case에서 통과

### Manual Verification
- Step 6 후: daemon 기동 -> AI tool call -> policy 평가 -> 이벤트 수신 확인
- Step 7 후: signer revoke flow 확인

---

## Success Metrics

| Metric | Before | After |
|---|---|---|
| Domain `\| null` count | ~43 | ~5 (DB row + relay envelope deferred) |
| Filter param null usage | 3 methods with positional nulls | 0 (all use filter objects) |
| DU exhaustiveness coverage | Partial | All domain model switches have `never` guard |
| "No Optional" violations in domain types | ~20 | 0 |

---

## Implementation Order Summary

```
Step 1: Dead field cleanup          [0.5h] [Very Low Risk]
  └ approval-verifier.ts, execution-journal.ts

Step 2: Default value conversions   [1h]   [Low Risk]
  └ walletName, signer name, NullLogger

Step 3: Filter param consolidation  [2h]   [Low Risk]
  └ loadPendingApprovals, listCrons -> filter object

Step 4: History null removal        [1h]   [Low Risk]
  └ signedApproval always present, chainId always number

Step 5: Cron ChainScope DU          [2h]   [Medium Risk]
  └ daemon-store, message-queue, cron-scheduler

Step 6: EvaluationResult DU         [4h]   [High Risk]  ← highest value
  └ guarded-middleware, errors, tool-surface, protocol/events

Step 7: Signer Status DU            [1.5h] [Medium Risk]
  └ wdk-store, wdk-host, signed-approval-broker

Step 8: App ApprovalRequest DU      [1h]   [Low Risk]
  └ app/core/approval/types.ts

Step 9: Tool result null cleanup    [1.5h] [Medium Risk]
  └ tool-surface.ts, ToolAccount interface

Step 10: Relay Envelope DU          [---]  [Deferred → v0.4.8]
  └ protocol/relay.ts, ws.ts

Total estimated: ~14.5h (excluding Step 10)
```

---

## Dependencies

```
Step 1 ──────────────────────────────> (independent)
Step 2 ──────────────────────────────> (independent)
Step 3 ──────────────────────────────> (independent)
Step 4 ──────────────────────────────> (independent)
Step 5 ──────────────────────────────> (independent)
Step 6 ──────────────────────────────> (independent, but test after 1-5)
Step 7 ─── depends on Step 2 (name) ─> (StoredSigner.name must be non-null first)
Step 8 ──────────────────────────────> (independent, App only)
Step 9 ──────────────────────────────> (independent)
Step 10 ── coordinates with v0.4.8 ──> (deferred)
```

Recommended execution: Steps 1-4 in sequence (low risk warmup), then Step 5,
then Step 6 (highest value), then Steps 7-9 in any order.
