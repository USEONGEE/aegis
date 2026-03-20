# v0.2.6 Daemon 타입 경계 정합성 복원 -- Design Document

**작성일**: 2026-03-20
**상태**: 리팩토링 계획 확정

---

## 1. 요약

daemon 패키지가 guarded-wdk의 public export 타입을 직접 사용하지 않고 로컬 shadow interface를 유지하여 타입 drift가 축적되었다. 이 리팩토링은 7개 파일을 4단계로 나누어 점진적으로 수정하며, 각 단계마다 기존 테스트가 통과하는 중간 상태를 유지한다.

**변경 범위**: daemon 패키지만 (guarded-wdk 변경 없음)
**목표**: daemon `npx tsc --noEmit` 에러 0건, shadow interface 전량 제거

---

## 2. 현재 상태 분석

### 2.1 Shadow Interface 목록

| 파일 | Shadow | 실제 guarded-wdk 타입 | 불일치 |
|------|--------|----------------------|--------|
| `wdk-host.ts:21-29` | `WDKInstance` interface | `GuardedWDKFacade` (비공개) | `getFeeRates?()` vs `getFeeRates(chain: string)`, `getAccount` 반환 `any` vs `IWalletAccountWithProtocols`, `getApprovalStore?()` 반환 `any` vs `ApprovalStore` |
| `control-handler.ts:62-66` | `SignedApprovalBroker` interface | `SignedApprovalBroker` class | `submitApproval(Record<string,unknown>, Record<string,unknown>?)` vs `submitApproval(SignedApproval, VerificationContext)` |
| `control-handler.ts:65` | `_trustedApprovers?: string[]` | private 필드 | private 접근 -- tsc strict 모드에서 에러 |
| `control-handler.ts:43-47` | `ApprovalStoreWriter` interface | `ApprovalStore` abstract class | 시그니처 subset이지만 `loadPendingByRequestId` 반환 타입 불일치 |
| `execution-journal.ts:30-40` | `ApprovalStore` interface | `ApprovalStore` abstract class | subset 재정의, `listJournal` 반환 `JournalEntry[]` vs `StoredJournal[]` |
| `tool-surface.ts:27-28` | `broker: any`, `store: any` | `SignedApprovalBroker`, `ApprovalStore` | 완전 미타입 |

### 2.2 Relay Event Drift

**daemon의 RELAY_EVENTS** (`index.ts:108-111`):
```
IntentProposed, PolicyEvaluated, ApprovalGranted,
ExecutionBroadcasted, ExecutionSettled, ExecutionFailed,
PendingPolicyRequested, ApprovalVerified, ApprovalRejected, PolicyApplied, SignerRevoked
```

**guarded-wdk에서 실제 emit하는 이벤트** (소스 코드 기준):
```
guarded-middleware.ts:
  - IntentProposed
  - PolicyEvaluated
  - ExecutionBroadcasted
  - ExecutionSettled
  - ExecutionFailed
  - TransactionSigned    <-- daemon에 없음

signed-approval-broker.ts:
  - PendingPolicyRequested
  - ApprovalVerified
  - PolicyApplied
  - ApprovalRejected
  - SignerRevoked
  - WalletCreated        <-- daemon에 없음
  - WalletDeleted        <-- daemon에 없음
```

**차이점**:
- `ApprovalGranted`: daemon에만 존재, guarded-wdk에서 emit하지 않음 (v0.2.5 Decision 단순화 잔재)
- `TransactionSigned`: guarded-wdk에서 emit하지만 daemon이 relay하지 않음
- `WalletCreated`: guarded-wdk에서 emit하지만 daemon이 relay하지 않음
- `WalletDeleted`: guarded-wdk에서 emit하지만 daemon이 relay하지 않음

### 2.3 `_trustedApprovers` Private 접근 문제

`control-handler.ts:294`:
```typescript
const current: string[] = broker._trustedApprovers || []
```

`SignedApprovalBroker._trustedApprovers`는 `private` 필드이다. daemon이 이 필드에 직접 접근하고 있어 tsc strict 모드에서 컴파일 에러가 발생한다.

**대체 패턴**: `store.listSigners()` + `setTrustedApprovers()`로 현재 활성 approver를 조회한 뒤 재설정. `device_revoke` 분기(line 185-191)에서 이미 이 패턴을 사용하고 있으므로, `pairing_confirm` 분기(line 293-298)도 동일하게 변경한다.

### 2.4 `getApprovalStore` 간접 접근 문제

`control-handler.ts:185`, `control-handler.ts:286`:
```typescript
const store = wdk?.getApprovalStore?.() || null
```

WDK facade를 통해 store에 접근하지만, store는 이미 `initWDK`에서 직접 반환되어 `wdkContext.store`로 전달되고 있다. `handleControlMessage`의 `approvalStore` 파라미터가 이 용도이다. `wdk.getApprovalStore()` 호출을 제거하고 `approvalStore` 파라미터를 직접 사용해야 한다.

---

## 3. 식별된 문제와 기회

### Critical (tsc 실패 원인)

| ID | 문제 | 위치 | 설명 |
|----|------|------|------|
| C1 | `WDKInstance` shadow drift | `wdk-host.ts:21-29` | `getFeeRates`, `getAccount`, `getApprovalStore` 시그니처 불일치 |
| C2 | `SignedApprovalBroker` shadow drift | `control-handler.ts:62-66` | `submitApproval` 시그니처 불일치 |
| C3 | `_trustedApprovers` private 접근 | `control-handler.ts:294` | `private` 필드 직접 접근 |

### Major (타입 안전성 저하)

| ID | 문제 | 위치 | 설명 |
|----|------|------|------|
| M1 | `broker: any` in WDKContext | `tool-surface.ts:27` | broker 타입 미지정 |
| M2 | `store: any` in WDKContext | `tool-surface.ts:28` | store 타입 미지정 |
| M3 | `ApprovalStore` shadow in journal | `execution-journal.ts:30-40` | 반환 타입 불일치 (`JournalEntry[]` vs `StoredJournal[]`) |
| M4 | `ApprovalStoreWriter` shadow | `control-handler.ts:43-47` | `loadPendingByRequestId` 반환 타입 불일치 |

### Minor (코드 정합성)

| ID | 문제 | 위치 | 설명 |
|----|------|------|------|
| m1 | `ApprovalGranted` dead event | `index.ts:109` | guarded-wdk에서 emit하지 않는 이벤트 |
| m2 | `TransactionSigned` 누락 | `index.ts:108-111` | relay에 포함되지 않음 |
| m3 | `WalletCreated` 누락 | `index.ts:108-111` | relay에 포함되지 않음 |
| m4 | `WalletDeleted` 누락 | `index.ts:108-111` | relay에 포함되지 않음 |
| m5 | `MockAccount` interface 미사용 의심 | `wdk-host.ts:13-19` | export되지만 외부 참조 없음 |

---

## 4. 리팩토링 계획

### 핵심 기술 결정 (확정)

1. **GuardedWDK 타입 derive**: `GuardedWDKFacade`는 비공개이므로 `createGuardedWDK`의 반환 타입에서 derive한다.
   ```typescript
   type GuardedWDK = Awaited<ReturnType<typeof import('@wdk-app/guarded-wdk').createGuardedWDK>>
   ```
2. **broker shadow 제거**: guarded-wdk의 `SignedApprovalBroker` class를 직접 import하고, `handleControlMessage`의 파라미터 타입을 `Pick<SignedApprovalBroker, 'submitApproval' | 'setTrustedApprovers'>`로 변경한다.
3. **`_trustedApprovers` 접근 제거**: `store.listSigners()` + `setTrustedApprovers()` 패턴으로 대체한다.
4. **store 타입**: `ApprovalStore` abstract class를 직접 import하여 사용한다.

---

### Step 1: `wdk-host.ts` -- WDKInstance shadow 교체 + createMockWDK 정렬

**목적**: tsc 실패의 근본 원인인 `WDKInstance` shadow interface를 제거하고, `createGuardedWDK` 반환 타입에서 derive한 boundary type으로 교체한다.

**영향 파일**: `wdk-host.ts`
**노력**: 소 (타입 변경 + mock 정렬)
**위험**: 중 (모든 downstream 소비자의 WDKInstance 참조가 변경됨)

#### 변경 사항

**1a. `WDKInstance` interface 제거, derived type으로 교체**

현재 (`wdk-host.ts:21-29`):
```typescript
export interface WDKInstance {
  getAccount (chain: string, index?: number): Promise<any>
  getFeeRates? (): Promise<Record<string, unknown>>
  getApprovalBroker? (): SignedApprovalBroker
  getApprovalStore? (): any
  on (event: string, listener: (...args: any[]) => void): void
  off (event: string, listener: (...args: any[]) => void): void
  dispose? (): void
}
```

변경 후:
```typescript
import type { createGuardedWDK, ApprovalStore } from '@wdk-app/guarded-wdk'

/**
 * Derived boundary type from createGuardedWDK return type.
 * daemon이 실제로 사용하는 메서드만 Pick으로 선택한다.
 */
type GuardedWDKFull = Awaited<ReturnType<typeof createGuardedWDK>>

export type WDKInstance = Pick<GuardedWDKFull,
  'getAccount' | 'getFeeRates' | 'getApprovalBroker' | 'getApprovalStore' |
  'on' | 'off' | 'dispose'
>
```

이렇게 하면:
- `getAccount`는 `(chain: string, index?: number) => Promise<IWalletAccountWithProtocols>`로 정확히 정렬된다.
- `getFeeRates`는 `(chain: string) => Promise<FeeRates>`로 정확히 정렬된다.
- `getApprovalStore`는 `() => ApprovalStore`로 정확히 정렬된다.
- 모든 메서드가 non-optional이 된다 (실제 facade와 동일).

**1b. `MockAccount` interface 정리**

현재 `MockAccount`은 export되지만 외부 참조가 없다. `createMockWDK` 내부에서만 사용되므로 export를 제거하고 inline으로 유지한다. 단, mock account의 `getBalance` 시그니처가 `{ balances: unknown[] }`을 반환하는데 이는 getBalance 계약 drift (out of scope)이므로 일단 `as any`로 처리한다.

**1c. `createMockWDK` 반환 타입 정렬**

현재 (`wdk-host.ts:107`):
```typescript
function createMockWDK (broker: SignedApprovalBroker, store: any): WDKInstance {
```

변경 후:
```typescript
function createMockWDK (broker: SignedApprovalBroker, store: ApprovalStore): WDKInstance {
```

mock body 변경 사항:
- `getFeeRates()` -> `getFeeRates(_chain: string)`: 파라미터 추가
- `getApprovalStore()` 반환 타입: `store` (이미 올바름, `any` -> `ApprovalStore`으로 타입만 변경)
- `getAccount` 반환값이 `WDKInstance['getAccount']`의 반환 타입(`IWalletAccountWithProtocols`)과 호환되어야 한다. mock이므로 `as any`로 캐스팅하여 런타임 동작은 유지하면서 타입을 맞춘다.

**1d. `WDKInitResult` 타입 갱신**

현재 (`wdk-host.ts:31-35`):
```typescript
export interface WDKInitResult {
  wdk: WDKInstance | null
  broker: SignedApprovalBroker | null
  store: InstanceType<typeof SqliteApprovalStore>
}
```

변경 후:
```typescript
export interface WDKInitResult {
  wdk: WDKInstance | null
  broker: SignedApprovalBroker | null
  store: SqliteApprovalStore
}
```

`InstanceType<typeof SqliteApprovalStore>`과 `SqliteApprovalStore`는 동일하므로 단순화한다.

#### 수락 기준
- `wdk-host.ts`에 `WDKInstance` interface 정의가 없다 (type alias로 대체).
- `createMockWDK`의 `store` 파라미터가 `ApprovalStore` 타입이다.
- `WDKInstance`의 모든 메서드가 `GuardedWDKFacade`의 시그니처와 정확히 일치한다.

---

### Step 2: `control-handler.ts` -- broker/store shadow 제거 + private 접근 제거

**목적**: 로컬 shadow interface를 guarded-wdk public export로 교체하고, `_trustedApprovers` private 접근을 제거한다.

**영향 파일**: `control-handler.ts`
**노력**: 중 (3개 shadow 제거 + 로직 변경)
**위험**: 중 (pairing_confirm 분기 로직 변경)

#### 변경 사항

**2a. `SignedApprovalBroker` shadow interface 제거**

현재 (`control-handler.ts:62-66`):
```typescript
interface SignedApprovalBroker {
  submitApproval (approval: Record<string, unknown>, context?: Record<string, unknown>): Promise<void>
  setTrustedApprovers (approvers: string[]): void
  _trustedApprovers?: string[]
}
```

제거하고, 파라미터 타입을 boundary Pick type으로 변경:
```typescript
import type { SignedApprovalBroker as FullBroker } from '@wdk-app/guarded-wdk'

type BrokerBoundary = Pick<FullBroker, 'submitApproval' | 'setTrustedApprovers'>
```

`handleControlMessage`의 `broker` 파라미터 타입을 `BrokerBoundary`로 변경.

이 변경의 핵심 영향:
- `broker.submitApproval`의 첫 번째 인자가 `Record<string, unknown>` -> `SignedApproval`로 변경된다.
- `broker.submitApproval`의 두 번째 인자가 `Record<string, unknown>` -> `VerificationContext`로 변경된다.
- 각 case 분기에서 `signedApproval` 객체를 `Record<string, unknown>`이 아닌 `SignedApproval`로 구성해야 한다.

**중요**: daemon이 relay에서 받는 `ControlPayload`는 `Record<string, unknown>` 형태이다. `SignedApproval`의 필드명(`sig`, `approver` 등)이 wire payload와 일치하는지 확인해야 한다. wire payload가 이미 `SignedApproval` shape이면 `as SignedApproval`로 narrow하고, 아니면 daemon에서 명시적 필드 매핑/정규화 함수를 두어야 한다.

**추가 결정**: `handleControlMessage`의 `wdk` 파라미터는 `wdk.getApprovalStore()` 제거 후 불필요해지므로 이번 Phase에서 제거한다.

**추가 범위**: `admin-server.ts`도 `JournalListOptions` 등을 직접 사용하므로 Step 3의 영향 파일에 포함한다.

변경할 코드 패턴 (각 case 분기):
```typescript
// Before
const signedApproval: Record<string, unknown> = { ...payload, type: 'policy' }
await broker.submitApproval(signedApproval, context)

// After
const signedApproval = { ...payload, type: 'policy' as const } as SignedApproval
await broker.submitApproval(signedApproval, context)
```

`context` 객체도 `Record<string, unknown>` -> `VerificationContext`로 변경:
```typescript
// Before
const context: Record<string, unknown> = {}
context.expectedTargetHash = pending.targetHash

// After
import type { VerificationContext } from '@wdk-app/guarded-wdk'
const context: VerificationContext = {}
context.expectedTargetHash = pending.targetHash
```

**2b. `ApprovalStoreWriter` shadow interface 제거**

현재 (`control-handler.ts:43-47`):
```typescript
interface ApprovalStoreWriter {
  loadPendingByRequestId (requestId: string): Promise<{ ... } | null>
  getPolicyVersion (accountIndex: number, chainId: number): Promise<number>
  savePolicy (accountIndex: number, chainId: number, input: { ... }, description: string): Promise<void>
}
```

이 인터페이스는 `handleControlMessage`에서 `approvalStore` 파라미터 타입으로 사용된다.
`ApprovalStore` abstract class를 직접 import하여 교체:

```typescript
import type { ApprovalStore } from '@wdk-app/guarded-wdk'
```

파라미터 변경:
```typescript
// Before
approvalStore?: ApprovalStoreWriter | null

// After
approvalStore?: ApprovalStore | null
```

`savePolicy`의 두 번째 인자 타입이 `PolicyInput`으로 정확히 맞아야 한다. 현재:
```typescript
{ policies: payload.policies as unknown[], signature: {} }
```

`PolicyInput`은 `{ policies: unknown[]; signature: Record<string, unknown> }`이므로 호환된다.

`loadPendingByRequestId`의 반환 타입이 `PendingApprovalRequest | null`로 변경된다. 현재 shadow는 `{ requestId, accountIndex, type, chainId, targetHash, content, createdAt }`을 반환하는데, `PendingApprovalRequest`는 `ApprovalRequest`를 extends하므로 이 필드들을 모두 포함한다. `walletName?` 필드가 추가되지만 사용하지 않으므로 문제없다.

**2c. `_trustedApprovers` private 접근 제거 (pairing_confirm)**

현재 (`control-handler.ts:293-298`):
```typescript
if (broker && identityPubKey) {
  const current: string[] = broker._trustedApprovers || []
  if (!current.includes(identityPubKey)) {
    broker.setTrustedApprovers([...current, identityPubKey])
  }
  logger.info({ identityPubKey }, 'Added to trusted approvers')
}
```

변경 후 -- `store.listSigners()` + `setTrustedApprovers()` 패턴 (device_revoke와 동일):
```typescript
if (approvalStore && identityPubKey) {
  const signers = await approvalStore.listSigners()
  const active: string[] = signers
    .filter(s => s.revokedAt === null || s.revokedAt === undefined)
    .map(s => s.publicKey)
  // saveSigner가 이미 호출되었으므로 identityPubKey는 signers에 포함됨
  broker.setTrustedApprovers(active)
  logger.info({ identityPubKey, activeSigners: active.length }, 'Trusted approvers updated after pairing')
}
```

**2d. `wdk.getApprovalStore()` 간접 접근 제거**

`device_revoke` 분기 (`control-handler.ts:185`):
```typescript
const store = wdk?.getApprovalStore?.() || null
```

`pairing_confirm` 분기 (`control-handler.ts:286`):
```typescript
const store = wdk?.getApprovalStore?.() || null
```

두 곳 모두 `approvalStore` 파라미터를 직접 사용하도록 변경. `approvalStore`는 이미 `handleControlMessage`의 6번째 파라미터로 전달되고 있다.

변경 후:
```typescript
// device_revoke 분기
if (approvalStore) {
  const signers = await approvalStore.listSigners()
  // ...
}

// pairing_confirm 분기
if (approvalStore) {
  await approvalStore.saveSigner(signerId, identityPubKey)
  // ...
}
```

**주의**: 현재 `pairing_confirm`에서 `store.saveSigner`를 호출하는 부분은 `wdk?.getApprovalStore?.()`에서 받은 store를 사용하고 있다. 이를 `approvalStore` 파라미터로 교체하면, `index.ts`에서 `handleControlMessage` 호출 시 `store`를 전달하고 있으므로 동일한 인스턴스가 사용된다.

#### 수락 기준
- `control-handler.ts`에 `interface SignedApprovalBroker` 로컬 정의가 없다.
- `control-handler.ts`에 `interface ApprovalStoreWriter` 로컬 정의가 없다.
- `_trustedApprovers` 문자열이 파일에 존재하지 않는다.
- `wdk?.getApprovalStore?.()` 호출이 파일에 존재하지 않는다.
- `broker.submitApproval` 호출의 첫 번째 인자에 `as SignedApproval` 캐스팅이 있다.
- 모든 `context` 변수가 `VerificationContext` 타입이다.

---

### Step 3: `tool-surface.ts` + `execution-journal.ts` -- any 타입 제거 + store shadow 교체

**목적**: WDKContext의 `broker: any`, `store: any`를 실제 타입으로 교체하고, execution-journal의 ApprovalStore shadow를 제거한다.

**영향 파일**: `tool-surface.ts`, `execution-journal.ts`
**노력**: 소
**위험**: 저 (타입만 변경, 로직 불변)

#### 변경 사항

**3a. `WDKContext` 타입 정밀화**

현재 (`tool-surface.ts:25-32`):
```typescript
export interface WDKContext {
  wdk: WDKInstance
  broker: any
  store: any
  logger: Logger
  journal: ExecutionJournal | null
  relayClient?: RelayClient
}
```

변경 후:
```typescript
import type { SignedApprovalBroker, ApprovalStore } from '@wdk-app/guarded-wdk'

export interface WDKContext {
  wdk: WDKInstance
  broker: SignedApprovalBroker
  store: ApprovalStore
  logger: Logger
  journal: ExecutionJournal | null
  relayClient?: RelayClient
}
```

이 변경으로 `executeToolCall` 내부에서 `store.loadPolicy()`, `store.loadPendingApprovals()`, `broker.createRequest()` 등의 호출이 타입 체크를 받게 된다.

**3b. `execution-journal.ts` ApprovalStore shadow 제거**

현재 (`execution-journal.ts:30-40`):
```typescript
interface ApprovalStore {
  listJournal (opts: JournalListOptions): Promise<JournalEntry[]>
  saveJournalEntry (entry: { ... }): Promise<void>
  updateJournalStatus (intentHash: string, status: JournalStatus, txHash?: string): Promise<void>
}
```

이 shadow를 제거하고 guarded-wdk의 `ApprovalStore`를 직접 import한다.

```typescript
import type { ApprovalStore } from '@wdk-app/guarded-wdk'
```

**JournalEntry vs StoredJournal 불일치 해결**:

현재 daemon의 `JournalEntry`:
```typescript
export interface JournalEntry {
  intentHash: string
  targetHash: string
  status: JournalStatus
  accountIndex: number
  chainId?: number
  txHash?: string | null
}
```

guarded-wdk의 `StoredJournal`:
```typescript
export interface StoredJournal extends JournalInput {
  txHash: string | null
  createdAt: number
  updatedAt: number
}
// JournalInput = { intentHash, accountIndex, chainId, targetHash, status }
```

`StoredJournal`은 `JournalEntry`의 superset이다. daemon의 `JournalEntry`는 `StoredJournal`에서 필요한 필드만 Pick한 것으로 볼 수 있다. 그러나 `JournalEntry`는 daemon 자체의 도메인 타입으로, 반환값의 shape를 정의하므로 유지한다. `list()` 메서드의 반환을 `StoredJournal[]`로 받고 `JournalEntry`로 매핑하거나, `StoredJournal`을 그대로 반환한다.

**결정**: `JournalEntry` 타입을 `StoredJournal`로 교체한다. daemon에서 `JournalEntry`를 별도로 유지할 이유가 없다 (추가 필드 없음, subset일 뿐).

```typescript
import type { ApprovalStore, StoredJournal, JournalStatus, JournalInput, JournalQueryOpts } from '@wdk-app/guarded-wdk'
```

`JournalEntry` 제거, `StoredJournal` 사용. `TrackMeta`는 daemon 고유이므로 유지. `JournalListOptions`는 `JournalQueryOpts`로 교체.

`recover()`, `list()` 메서드의 반환 타입이 `StoredJournal[]`로 변경된다.

**3c. `getBalance` 반환 타입 처리 (out of scope 경계)**

`tool-surface.ts:416`:
```typescript
const balances = await account.getBalance()
return { balances: balances || [] }
```

`getBalance`의 실제 반환 타입은 upstream WDK에 의존하며, 이는 out of scope이다. Step 1에서 `WDKInstance`의 `getAccount` 반환 타입이 `IWalletAccountWithProtocols`로 정밀화되면, `account.getBalance()`의 반환 타입도 정확해진다. 이 단계에서는 추가 처리 없이 타입이 자연스럽게 따라오도록 한다.

#### 수락 기준
- `WDKContext.broker`가 `SignedApprovalBroker` 타입이다.
- `WDKContext.store`가 `ApprovalStore` 타입이다.
- `execution-journal.ts`에 `interface ApprovalStore` 로컬 정의가 없다.
- `execution-journal.ts`에 `JournalEntry` interface가 없다 (`StoredJournal` 사용).
- `execution-journal.ts`에 `JournalListOptions` interface가 없다 (`JournalQueryOpts` 사용).

---

### Step 4: `index.ts` -- relay event 정합 + 잔재 cleanup

**목적**: RELAY_EVENTS 목록을 guarded-wdk에서 실제 emit하는 이벤트와 정합시킨다.

**영향 파일**: `index.ts`
**노력**: 소
**위험**: 저 (이벤트 추가/제거)

#### 변경 사항

**4a. RELAY_EVENTS 목록 갱신**

현재 (`index.ts:108-111`):
```typescript
const RELAY_EVENTS = [
  'IntentProposed', 'PolicyEvaluated', 'ApprovalGranted',
  'ExecutionBroadcasted', 'ExecutionSettled', 'ExecutionFailed',
  'PendingPolicyRequested', 'ApprovalVerified', 'ApprovalRejected', 'PolicyApplied', 'SignerRevoked'
] as const
```

변경 후:
```typescript
const RELAY_EVENTS = [
  'IntentProposed', 'PolicyEvaluated', 'TransactionSigned',
  'ExecutionBroadcasted', 'ExecutionSettled', 'ExecutionFailed',
  'PendingPolicyRequested', 'ApprovalVerified', 'ApprovalRejected',
  'PolicyApplied', 'SignerRevoked', 'WalletCreated', 'WalletDeleted'
] as const
```

변경 내역:
- `ApprovalGranted` **제거**: guarded-wdk에서 emit하지 않음 (v0.2.5 Decision 단순화 잔재)
- `TransactionSigned` **추가**: guarded-middleware.ts에서 signTransaction 성공 시 emit
- `WalletCreated` **추가**: signed-approval-broker.ts에서 wallet_create 승인 후 emit
- `WalletDeleted` **추가**: signed-approval-broker.ts에서 wallet_delete 승인 후 emit

#### 수락 기준
- RELAY_EVENTS에 `ApprovalGranted`가 없다.
- RELAY_EVENTS에 `TransactionSigned`, `WalletCreated`, `WalletDeleted`가 있다.
- RELAY_EVENTS 개수: 12개 (11 - 1 + 3 = 13... 아니, 현재 11개에서 -1 +3 = 13개).

현재 11개: IntentProposed, PolicyEvaluated, ApprovalGranted, ExecutionBroadcasted, ExecutionSettled, ExecutionFailed, PendingPolicyRequested, ApprovalVerified, ApprovalRejected, PolicyApplied, SignerRevoked.
변경 후 13개: IntentProposed, PolicyEvaluated, TransactionSigned, ExecutionBroadcasted, ExecutionSettled, ExecutionFailed, PendingPolicyRequested, ApprovalVerified, ApprovalRejected, PolicyApplied, SignerRevoked, WalletCreated, WalletDeleted.

---

### Step 5: 테스트 파일 정합

**목적**: Step 1-4의 타입 변경에 맞춰 테스트 파일의 mock 객체를 정합시킨다.

**영향 파일**: `tests/control-handler.test.ts`, `tests/tool-surface.test.ts`
**노력**: 소
**위험**: 저

#### 변경 사항

**5a. `control-handler.test.ts`**

`createMockBroker`:
- `_trustedApprovers: [] as string[]` 제거. 더 이상 필요하지 않다.
- mock 타입이 `BrokerBoundary`와 호환되어야 한다 (이미 `submitApproval`, `setTrustedApprovers`만 사용).

`createMockWdk`:
- `getApprovalStore` mock 제거 가능. Step 2에서 `wdk.getApprovalStore()` 호출이 제거되므로, 테스트에서도 불필요하다.
- 단, pairing_confirm 테스트에서 `approvalStore` 파라미터를 직접 전달하도록 변경해야 한다.

pairing_confirm 테스트 호출 변경:
```typescript
// Before
const result = await handleControlMessage(msg, broker, logger as any, wdk, undefined, undefined, pairingSession)

// After
const result = await handleControlMessage(msg, broker, logger as any, wdk, undefined, store, pairingSession)
```

device_revoke 테스트 호출: 이미 `wdk`를 통해 `getApprovalStore`를 호출하지만, Step 2 후에는 `approvalStore` 파라미터를 사용하므로 `store`를 전달해야 한다.

```typescript
// Before
const result = await handleControlMessage(msg, broker, logger as any, wdk)

// After
const result = await handleControlMessage(msg, broker, logger as any, wdk, undefined, store)
```

**5b. `tool-surface.test.ts`**

`WDKContext`의 `broker`와 `store`가 `any`에서 실제 타입으로 변경되므로, mock 객체가 해당 타입과 호환되어야 한다. 현재 mock은 이미 필요한 메서드를 구현하고 있으므로 `as any` 캐스팅으로 충분하다 (이미 사용 중).

#### 수락 기준
- `control-handler.test.ts`에 `_trustedApprovers` 참조가 없다.
- 모든 `handleControlMessage` 호출에서 device_revoke/pairing_confirm 테스트가 `approvalStore` 파라미터를 전달한다.
- 모든 테스트 통과.

---

## 5. 의존성 다이어그램

```
Step 1: wdk-host.ts (WDKInstance 타입 변경)
  |
  +--> Step 2: control-handler.ts (WDKInstance import 소비자)
  |       |
  |       +--> Step 5a: control-handler.test.ts
  |
  +--> Step 3: tool-surface.ts + execution-journal.ts
  |       |
  |       +--> Step 5b: tool-surface.test.ts
  |
  +--> Step 4: index.ts (WDKInstance import 소비자 + relay events)
```

Step 1은 반드시 먼저 완료해야 한다 (WDKInstance 타입이 변경되므로).
Step 2, 3, 4는 Step 1 이후 병렬 진행 가능하나, 순차 권장 (리뷰 편의).
Step 5는 Step 2, 3 완료 후 진행.

---

## 6. 위험 평가와 완화 방안

| 위험 | 심각도 | 확률 | 완화 |
|------|--------|------|------|
| `createMockWDK` 반환이 `WDKInstance`와 호환 불가 | 중 | 중 | mock account를 `as any` 캐스팅하여 타입 호환 유지. getBalance drift는 별도 Phase. |
| `SignedApproval` 캐스팅 오류 (runtime payload 불일치) | 중 | 저 | 기존과 동일한 runtime 동작. `Record<string,unknown>` -> `as SignedApproval`은 컴파일 타임에만 영향. verifyApproval이 runtime 검증 담당. |
| `listSigners()` 호출 시 빈 배열 반환으로 trusted approvers 초기화 | 중 | 저 | `saveSigner`가 `listSigners` 전에 호출되므로, 방금 등록한 signer가 포함됨. 단, DB 트랜잭션이 아니므로 race condition 가능성 극히 낮음. |
| `JournalEntry` -> `StoredJournal` 교체로 admin-server 등 소비자 영향 | 저 | 저 | `StoredJournal`은 `JournalEntry`의 superset이므로 하위 호환. |
| relay event 변경으로 app 측 영향 | 저 | 중 | app이 unknown event를 무시하는지 확인 필요. `ApprovalGranted` 제거는 app에서 이미 사용하지 않는 이벤트여야 함. |

### 롤백 전략

각 Step은 독립 커밋으로 진행한다. 문제 발생 시 해당 커밋만 revert하면 된다.

- Step 1 revert: `WDKInstance` interface 복원, downstream 영향 없음
- Step 2 revert: shadow interface 복원, `_trustedApprovers` 접근 복원
- Step 3 revert: `any` 타입 복원
- Step 4 revert: RELAY_EVENTS 목록 복원
- Step 5 revert: 테스트 mock 복원

---

## 7. 테스팅 전략

### 기존 테스트

| 테스트 파일 | 영향 Step | 예상 변경 |
|------------|-----------|----------|
| `tests/control-handler.test.ts` | Step 2, 5 | mock에서 `_trustedApprovers` 제거, `approvalStore` 파라미터 전달, `createMockWdk`에서 `getApprovalStore` 제거 가능 |
| `tests/tool-surface.test.ts` | Step 3, 5 | 변경 최소 (mock 이미 호환) |

### 검증 명령

```bash
# 각 Step 완료 후:
cd packages/daemon && npx tsc --noEmit
cd packages/daemon && npx jest --passWithNoTests

# 최종 검증:
cd packages/daemon && npx tsc --noEmit && npx jest
```

### tsc 에러 0건 달성 범위

이 Phase에서 해결하는 tsc 에러:
- `WDKInstance` / `GuardedWDKFacade` 시그니처 충돌
- `SignedApprovalBroker` shadow와 실제 타입 불일치
- `_trustedApprovers` private 접근

이 Phase에서 해결하지 않는 tsc 에러 (별도 chore):
- `pino` ESM import 관련
- OpenAI SDK overload 관련
- relay payload typing

---

## 8. 성공 지표

| 지표 | 기준 |
|------|------|
| tsc 에러 (guarded-wdk 경계) | 0건 |
| 로컬 shadow interface 수 | 0개 (WDKInstance은 derived type alias) |
| `_trustedApprovers` 직접 접근 | 0건 |
| `any` 타입 (broker, store) | 0건 (WDKContext 기준) |
| RELAY_EVENTS vs guarded-wdk emit 차이 | 0건 |
| 기존 테스트 통과 | 100% |
| guarded-wdk internal path import | 0건 |

---

## 9. 파일별 변경 요약

| 파일 | Step | 변경 내용 |
|------|------|----------|
| `packages/daemon/src/wdk-host.ts` | 1 | `WDKInstance` interface -> derived type alias, `MockAccount` export 제거, `createMockWDK` store 타입 정밀화, `WDKInitResult` 단순화 |
| `packages/daemon/src/control-handler.ts` | 2 | `SignedApprovalBroker` shadow 제거 -> `Pick<FullBroker, ...>`, `ApprovalStoreWriter` 제거 -> `ApprovalStore`, `_trustedApprovers` 접근 -> `listSigners()` 패턴, `wdk.getApprovalStore()` -> `approvalStore` 파라미터, `SignedApproval` import + 캐스팅, `VerificationContext` import |
| `packages/daemon/src/tool-surface.ts` | 3 | `WDKContext.broker: any` -> `SignedApprovalBroker`, `WDKContext.store: any` -> `ApprovalStore` |
| `packages/daemon/src/execution-journal.ts` | 3 | `ApprovalStore` shadow 제거, `JournalEntry` -> `StoredJournal`, `JournalListOptions` -> `JournalQueryOpts`, `TrackMeta` 유지 |
| `packages/daemon/src/index.ts` | 4 | RELAY_EVENTS: -`ApprovalGranted`, +`TransactionSigned`, +`WalletCreated`, +`WalletDeleted` |
| `packages/daemon/tests/control-handler.test.ts` | 5 | `_trustedApprovers` mock 제거, `approvalStore` 파라미터 전달 추가 |
| `packages/daemon/tests/tool-surface.test.ts` | 5 | 최소 변경 (타입 호환 확인) |

---

## 10. Out of Scope 확인

| 항목 | 사유 |
|------|------|
| `getBalance` 계약 drift (`Promise<bigint>` vs 배열) | upstream WDK 의존, 별도 Phase |
| pino ESM import 에러 | daemon 빌드 인프라, 별도 chore |
| OpenAI SDK overload 에러 | 외부 SDK 타입, 별도 chore |
| relay payload 구조체 타입화 | relay 패키지 공동 변경 필요, 별도 Phase |
| guarded-wdk 코드 변경 | 제약 조건 |
| `MockAccount` 상세 구현 (mock이 IWalletAccountWithProtocols 완전 구현) | getBalance drift와 연결, 별도 Phase |
