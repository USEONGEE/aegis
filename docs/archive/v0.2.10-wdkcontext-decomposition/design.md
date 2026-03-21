# v0.2.10 Design -- WDKContext 분해 + Port Interface

## 1. 요약

WDKContext를 god object에서 역할별 Port interface 기반 의존성 구조로 분해한다.
`broker: any`를 `ApprovalBrokerPort`로, `store: any`를 `ToolStorePort`로 교체하고,
소비자별로 실제 필요한 의존성만 받도록 함수 시그니처를 좁힌다.

## 2. 현재 상태 분석

### 2.1 WDKContext 정의 (tool-surface.ts:25-32)

```typescript
export interface WDKContext {
  wdk: WDKInstance
  broker: any        // 실제: SignedApprovalBroker
  store: any         // 실제: SqliteApprovalStore (30+ 메서드 중 9개만 사용)
  logger: Logger
  journal: ExecutionJournal | null
  relayClient?: RelayClient  // optional 필드 (설계 원칙 위반)
}
```

### 2.2 store에서 실제 호출하는 메서드 (tool-surface.ts 내부)

| # | 메서드 | 호출 위치 | 시그니처 |
|---|--------|-----------|----------|
| 1 | `getPolicyVersion` | sendTransaction(:358), transfer(:396), signTransaction(:555) | `(accountIndex: number, chainId: number) => Promise<number>` |
| 2 | `saveRejection` | sendTransaction(:359), transfer(:397), signTransaction(:556) | `(entry: RejectionEntry) => Promise<void>` |
| 3 | `loadPolicy` | policyList(:430) | `(accountIndex: number, chainId: number) => Promise<StoredPolicy \| null>` |
| 4 | `loadPendingApprovals` | policyPending(:445) | `(accountIndex: number \| null, type: string \| null, chainId: number \| null) => Promise<PendingApprovalRequest[]>` |
| 5 | `saveCron` | registerCron(:483) | `(accountIndex: number, cron: CronInput) => Promise<string>` |
| 6 | `listCrons` | listCrons(:501) | `(accountIndex?: number) => Promise<StoredCron[]>` |
| 7 | `removeCron` | removeCron(:515) | `(cronId: string) => Promise<void>` |
| 8 | `listRejections` | listRejections(:576) | `(opts: RejectionQueryOpts) => Promise<RejectionEntry[]>` |
| 9 | `listPolicyVersions` | listPolicyVersions(:590) | `(accountIndex: number, chainId: number) => Promise<PolicyVersionEntry[]>` |

### 2.3 broker에서 실제 호출하는 메서드 (tool-surface.ts 내부)

| # | 메서드 | 호출 위치 | 시그니처 |
|---|--------|-----------|----------|
| 1 | `createRequest` | policyRequest(:462) | `(type: ApprovalType, opts: CreateRequestOptions) => Promise<ApprovalRequest>` |

### 2.4 소비자별 WDKContext 필드 사용 매트릭스

| 소비자 | wdk | broker | store | logger | journal | relayClient |
|--------|-----|--------|-------|--------|---------|-------------|
| **tool-surface.ts** (executeToolCall) | O | O (1 메서드) | O (9 메서드) | O | O | - |
| **tool-call-loop.ts** (processChat) | - | - | - | O | - | - |
| **chat-handler.ts** (handleChatMessage) | - | - | - | O | - | - |
| **cron-scheduler.ts** (CronScheduler) | - | - | - | - | - | - |
| **admin-server.ts** (AdminServer) | - | - | - | - | - | - |
| **index.ts** (main) | O | O | O | O | O | O |

핵심 관찰:
- **tool-surface.ts**만 WDKContext의 5개 필드를 실제로 사용한다 (relayClient 제외).
- **tool-call-loop.ts**는 `wdkContext.logger`만 꺼내 쓰고, `executeToolCall`에 `wdkContext`를 통째로 전달한다 (pass-through).
- **chat-handler.ts**는 `wdkContext.logger`만 꺼내 쓰고, `processChat`에 `wdkContext`를 통째로 전달한다 (pass-through).
- **cron-scheduler.ts**는 `this._wdkContext`를 보관하고 `processChat`에 통째로 넘긴다. 직접 접근하는 필드가 없다 (pure pass-through).
- **admin-server.ts**는 `this._wdkContext`를 보관만 하고 직접 소비하지 않는다 (dead field).
- **index.ts (main)**은 WDKContext를 조립해서 하위 모듈에 넘기는 유일한 생산자이다.
- **control-handler.ts**는 WDKContext를 사용하지 않는다. `broker`와 `store`를 개별 파라미터로 직접 받는다.

### 2.5 WDKContext 전달 체인

```
index.ts (생산)
  |
  +-- handleChatMessage(wdkContext)   chat-handler.ts (pass-through)
  |     |
  |     +-- processChat(wdkContext)   tool-call-loop.ts (logger만 사용, 나머지 pass-through)
  |           |
  |           +-- executeToolCall(wdkContext)   tool-surface.ts (실제 소비)
  |
  +-- CronScheduler(wdkContext)       cron-scheduler.ts (pass-through)
  |     |
  |     +-- processChat(wdkContext)   tool-call-loop.ts (동일 경로)
  |
  +-- AdminServer(wdkContext)         admin-server.ts (dead field)
  |
  +-- _processChatDirect(wdkContext)  chat-handler.ts (queue processor, pass-through)
```

### 2.6 admin-server.ts의 store 직접 사용

AdminServer는 WDKContext 외에 별도 `store: any` 파라미터를 받아서 사용한다:

| # | 메서드 | 호출 위치 | 용도 |
|---|--------|-----------|------|
| 1 | `listSigners` | signer_list 커맨드 (:214) | Signer 목록 조회 |
| 2 | `listWallets` | wallet_list 커맨드 (:244) | Wallet 목록 조회 |

이 2개 메서드는 tool-surface의 9개와 겹치지 않으므로 별도 Port가 필요하다.

### 2.7 control-handler.ts의 직접 의존성

WDKContext를 사용하지 않고 개별 파라미터를 받는다:

| 파라미터 | 타입 | 메서드 사용 |
|----------|------|------------|
| `broker` | `SignedApprovalBroker` | `submitApproval`, `setTrustedApprovers` |
| `approvalStore` | `SqliteApprovalStore \| null` | `loadPendingByRequestId`, `savePolicy`, `saveSigner`, `listSigners` |

이미 정확한 타입으로 받고 있어 WDKContext 분해 대상이 아니다. 단, `approvalStore`의 `any` 성향은 별도 Port로 좁힐 수 있다 (out of scope -- control-handler는 이미 concrete type 사용).

## 3. 식별된 문제

### Critical

| ID | 문제 | 영향 |
|----|------|------|
| C1 | `broker: any`, `store: any` -- 9+1개 메서드 계약이 타입에 없음 | 컴파일 타임 안전성 제로. 메서드명 오타, 시그니처 불일치를 런타임까지 잡지 못함 |
| C2 | God object 전달 패턴: chat-handler -> tool-call-loop -> tool-surface 3단 pass-through | 의존성 그래프 착시. 실제 의존은 tool-surface에만 있는데 모든 레이어가 전체 context를 알아야 함 |

### Major

| ID | 문제 | 영향 |
|----|------|------|
| M1 | AdminServer가 WDKContext를 보관하지만 사용하지 않음 (dead field) | 불필요한 결합. AdminServer 변경 시 WDKContext 변경이 강제될 수 있음 |
| M2 | `relayClient?: RelayClient` -- optional 필드 (설계 원칙 "No Optional" 위반) | WDKContext 소비자가 relayClient 존재 여부를 런타임에 확인해야 함 |
| M3 | CronScheduler가 이미 로컬 CronStore interface를 정의했지만, WDKContext의 store는 여전히 any | 부분적 타입화: cron 경로는 안전하지만 tool-surface 경로는 unsafe |

### Minor

| ID | 문제 | 영향 |
|----|------|------|
| m1 | tool-call-loop.ts가 logger만 쓰는데 WDKContext 전체를 받음 | 함수 시그니처가 실제 의존보다 넓음 |
| m2 | chat-handler.ts가 logger만 쓰는데 WDKContext 전체를 받음 | 동일 |

## 4. Port Interface 설계

### 4.1 ToolStorePort

tool-surface.ts의 `executeToolCall`이 store에서 호출하는 9개 메서드만 정의.

```typescript
// packages/daemon/src/ports.ts

import type {
  StoredPolicy,
  PendingApprovalRequest,
  CronInput,
  StoredCron,
  RejectionEntry,
  RejectionQueryOpts,
  PolicyVersionEntry
} from '@wdk-app/guarded-wdk'

/**
 * tool-surface.ts가 store에서 사용하는 메서드만 정의한 Port.
 * 구현: SqliteApprovalStore (guarded-wdk).
 */
export interface ToolStorePort {
  // -- Policy 조회 --
  getPolicyVersion (accountIndex: number, chainId: number): Promise<number>
  loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null>
  loadPendingApprovals (accountIndex: number | null, type: string | null, chainId: number | null): Promise<PendingApprovalRequest[]>

  // -- Rejection 기록 --
  saveRejection (entry: RejectionEntry): Promise<void>
  listRejections (opts: RejectionQueryOpts): Promise<RejectionEntry[]>

  // -- Cron 관리 --
  saveCron (accountIndex: number, cron: CronInput): Promise<string>
  listCrons (accountIndex?: number): Promise<StoredCron[]>
  removeCron (cronId: string): Promise<void>

  // -- Policy Version --
  listPolicyVersions (accountIndex: number, chainId: number): Promise<PolicyVersionEntry[]>
}
```

### 4.2 ApprovalBrokerPort

tool-surface.ts의 `executeToolCall`이 broker에서 호출하는 1개 메서드만 정의.

```typescript
// packages/daemon/src/ports.ts

import type { ApprovalType, ApprovalRequest } from '@wdk-app/guarded-wdk'

interface CreateRequestOptions {
  chainId: number
  targetHash: string
  accountIndex: number
  content: string
}

/**
 * tool-surface.ts가 broker에서 사용하는 메서드만 정의한 Port.
 * 구현: SignedApprovalBroker (guarded-wdk).
 */
export interface ApprovalBrokerPort {
  createRequest (type: ApprovalType, opts: CreateRequestOptions): Promise<ApprovalRequest>
}
```

### 4.3 AdminStorePort

admin-server.ts가 store에서 호출하는 2개 메서드만 정의.

```typescript
// packages/daemon/src/ports.ts

import type { StoredSigner, StoredWallet } from '@wdk-app/guarded-wdk'

/**
 * admin-server.ts가 store에서 사용하는 메서드만 정의한 Port.
 * 구현: SqliteApprovalStore (guarded-wdk).
 */
export interface AdminStorePort {
  listSigners (): Promise<StoredSigner[]>
  listWallets (): Promise<StoredWallet[]>
}
```

## 5. 대안 검토

### 대안 A: Port Interface + WDKContext 내부 필드 교체 (최소 변경)

WDKContext의 `broker: any`를 `broker: ApprovalBrokerPort`로, `store: any`를 `store: ToolStorePort`로 교체. 구조 자체는 유지.

```typescript
export interface WDKContext {
  wdk: WDKInstance
  broker: ApprovalBrokerPort   // any -> Port
  store: ToolStorePort         // any -> Port
  logger: Logger
  journal: ExecutionJournal | null
  relayClient?: RelayClient
}
```

장점:
- 변경 범위 최소 (tool-surface.ts, index.ts 2개 파일)
- any를 Port로 교체하는 것만으로도 타입 안전성 확보
- 하위 호환: WDKContext를 받는 모든 소비자의 시그니처 변경 불필요

단점:
- God object 구조가 유지됨 (chat-handler, cron-scheduler가 불필요한 필드를 계속 받음)
- `relayClient?` optional 유지
- AdminServer의 dead field 해결 안 됨

변경 파일: **2개** (tool-surface.ts, index.ts)

### 대안 B: Port Interface + ToolExecutionContext 분리 (권장)

WDKContext를 `ToolExecutionContext`로 이름 변경하고 역할을 명확히 한다.
pass-through 소비자(chat-handler, tool-call-loop, cron-scheduler)는 `ToolExecutionContext`를 계속 받되,
실제 필드 소비자는 tool-surface.ts(executeToolCall)뿐이다. pass-through 패턴 자체는 유지.
AdminServer에서 dead field를 제거한다.

```typescript
// tool-surface.ts
export interface ToolExecutionContext {
  wdk: WDKInstance
  broker: ApprovalBrokerPort
  store: ToolStorePort
  logger: Logger
  journal: ExecutionJournal | null
}
```

변경 체인:

```
index.ts                      ToolExecutionContext 조립 (relayClient 제거)
  |
  +-- processChat(ctx, ...)   logger를 ctx에서 추출 (기존과 동일, 타입만 변경)
  |     |
  |     +-- executeToolCall(ctx)   ToolExecutionContext 소비 (변경 없음)
  |
  +-- handleChatMessage(logger, ...)   WDKContext 대신 logger 직접 전달? -- 아래 판단.
```

판단: chat-handler.ts와 tool-call-loop.ts의 시그니처에서 WDKContext를 제거하면 pass-through가 사라지는 장점이 있지만, 이 두 함수는 `processChat` -> `executeToolCall`로 ctx를 넘겨야 하므로 어차피 ctx 파라미터가 필요하다. **logger를 ctx에서 분리하는 것은 이번 스코프에서는 과도한 분해**이며, 핵심 목표(any 제거 + Port 도입)에서 벗어난다.

따라서 대안 B의 실질적 변경:
1. `WDKContext` -> `ToolExecutionContext` 이름 변경
2. `broker: any` -> `broker: ApprovalBrokerPort`
3. `store: any` -> `store: ToolStorePort`
4. `relayClient?` 필드 제거 (실제 사용처 없음)
5. AdminServer에서 `wdkContext` 파라미터 제거 (dead field)
6. AdminServer의 `store: any` -> `store: AdminStorePort`

변경 파일: **6개** (tool-surface.ts, tool-call-loop.ts, chat-handler.ts, cron-scheduler.ts, admin-server.ts, index.ts) + **1개 신규** (ports.ts)

### 대안 C: 완전 분해 (Function-level DI)

각 함수가 필요한 의존성만 개별 파라미터로 받도록 전면 분해.

```typescript
// tool-surface.ts
export async function executeToolCall (
  name: string,
  args: ToolArgs,
  wdk: WDKInstance,
  broker: ApprovalBrokerPort,
  store: ToolStorePort,
  logger: Logger,
  journal: ExecutionJournal | null
): Promise<ToolResult>

// tool-call-loop.ts
export async function processChat (
  userId: string,
  sessionId: string,
  userMessage: string,
  wdk: WDKInstance,
  broker: ApprovalBrokerPort,
  store: ToolStorePort,
  logger: Logger,
  journal: ExecutionJournal | null,
  openclawClient: OpenClawClient,
  opts: ProcessChatOptions
): Promise<ProcessChatResult>
```

장점:
- 각 함수의 의존성이 시그니처에 완전히 노출됨
- context object 불필요

단점:
- **파라미터 폭발**: processChat이 10개 파라미터를 받음 (가독성 저하)
- 의존성이 추가될 때마다 전체 호출 체인의 시그니처 변경 필요
- Primitive First 원칙에 부합하지만, 실용성이 떨어짐
- chat-handler, cron-scheduler의 호출 코드가 복잡해짐

변경 파일: **6개** (tool-surface.ts, tool-call-loop.ts, chat-handler.ts, cron-scheduler.ts, admin-server.ts, index.ts)

### 대안 비교표

| 기준 | A: 필드 교체 | B: Port + 이름 변경 (권장) | C: 완전 분해 |
|------|:---:|:---:|:---:|
| any 제거 | O | O | O |
| God object 축소 | X | 부분 (dead field 제거, optional 제거) | O |
| 파라미터 폭발 | X | X | **O (문제)** |
| 변경 범위 | 2 파일 | 6+1 파일 | 6 파일 |
| Pass-through 제거 | X | X (의도적 유지) | O |
| 설계 원칙 부합 | 부분 | **높음** | 높지만 실용성 저하 |
| 위험도 | 매우 낮음 | 낮음 | 중간 |

## 6. 기술 결정

**대안 B를 채택한다.**

근거:
1. 핵심 목표(`any` 제거, Port 도입)를 달성하면서도 구조 개선(dead field 제거, optional 제거, 이름 명확화)을 포함한다.
2. pass-through 구조는 의도적으로 유지한다. tool-call-loop과 chat-handler가 `ToolExecutionContext`를 받아 `executeToolCall`에 넘기는 것은 현재 코드의 호출 체인에서 자연스러운 패턴이며, logger 분리는 과도한 분해이다.
3. 대안 C의 파라미터 폭발 문제를 회피한다.
4. 대안 A와 비교하면 4개 파일 추가 변경이 있지만, AdminServer dead field 제거와 optional 제거라는 실질적 개선을 얻는다.

## 7. 상세 설계

### 7.1 신규 파일: `packages/daemon/src/ports.ts`

Port interface 3개를 한 파일에 정의한다.

```typescript
import type {
  StoredPolicy,
  PendingApprovalRequest,
  CronInput,
  StoredCron,
  RejectionEntry,
  RejectionQueryOpts,
  PolicyVersionEntry,
  ApprovalType,
  ApprovalRequest,
  StoredSigner,
  StoredWallet
} from '@wdk-app/guarded-wdk'

// ---------------------------------------------------------------------------
// Port: tool-surface.ts용 Store
// ---------------------------------------------------------------------------

export interface ToolStorePort {
  getPolicyVersion (accountIndex: number, chainId: number): Promise<number>
  loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null>
  loadPendingApprovals (accountIndex: number | null, type: string | null, chainId: number | null): Promise<PendingApprovalRequest[]>
  saveRejection (entry: RejectionEntry): Promise<void>
  listRejections (opts: RejectionQueryOpts): Promise<RejectionEntry[]>
  saveCron (accountIndex: number, cron: CronInput): Promise<string>
  listCrons (accountIndex?: number): Promise<StoredCron[]>
  removeCron (cronId: string): Promise<void>
  listPolicyVersions (accountIndex: number, chainId: number): Promise<PolicyVersionEntry[]>
}

// ---------------------------------------------------------------------------
// Port: tool-surface.ts용 Broker
// ---------------------------------------------------------------------------

interface CreateRequestOptions {
  chainId: number
  targetHash: string
  accountIndex: number
  content: string
}

export interface ApprovalBrokerPort {
  createRequest (type: ApprovalType, opts: CreateRequestOptions): Promise<ApprovalRequest>
}

// ---------------------------------------------------------------------------
// Port: admin-server.ts용 Store
// ---------------------------------------------------------------------------

export interface AdminStorePort {
  listSigners (): Promise<StoredSigner[]>
  listWallets (): Promise<StoredWallet[]>
}
```

### 7.2 tool-surface.ts 변경

```typescript
// Before
import type { RelayClient } from './relay-client.js'
import type { ExecutionJournal } from './execution-journal.js'

export interface WDKContext {
  wdk: WDKInstance
  broker: any
  store: any
  logger: Logger
  journal: ExecutionJournal | null
  relayClient?: RelayClient
}

// After
import type { ExecutionJournal } from './execution-journal.js'
import type { ToolStorePort, ApprovalBrokerPort } from './ports.js'

export interface ToolExecutionContext {
  wdk: WDKInstance
  broker: ApprovalBrokerPort
  store: ToolStorePort
  logger: Logger
  journal: ExecutionJournal | null
}
```

`executeToolCall` 시그니처:
```typescript
// Before
export async function executeToolCall (name: string, args: ToolArgs, wdkContext: WDKContext): Promise<ToolResult>

// After
export async function executeToolCall (name: string, args: ToolArgs, ctx: ToolExecutionContext): Promise<ToolResult>
```

함수 내부: `const { wdk, broker, store, logger, journal } = ctx` (변경 없음, 변수명 동일).

### 7.3 tool-call-loop.ts 변경

```typescript
// Before
import type { WDKContext, ToolResult, ToolDefinition } from './tool-surface.js'

export async function processChat (
  userId: string, sessionId: string, userMessage: string,
  wdkContext: WDKContext,
  openclawClient: OpenClawClient,
  opts: ProcessChatOptions = {}
): Promise<ProcessChatResult>

// After
import type { ToolExecutionContext, ToolResult, ToolDefinition } from './tool-surface.js'

export async function processChat (
  userId: string, sessionId: string, userMessage: string,
  ctx: ToolExecutionContext,
  openclawClient: OpenClawClient,
  opts: ProcessChatOptions = {}
): Promise<ProcessChatResult>
```

내부: `const { logger } = ctx` (동일 패턴, 타입만 변경).

### 7.4 chat-handler.ts 변경

```typescript
// Before
import type { WDKContext } from './tool-surface.js'

export async function handleChatMessage (
  msg: ChatMessage,
  openclawClient: OpenClawClient,
  relayClient: RelayClient,
  wdkContext: WDKContext,
  opts: ChatHandlerOptions,
  queueManager?: MessageQueueManager | null
): Promise<void>

// After
import type { ToolExecutionContext } from './tool-surface.js'

export async function handleChatMessage (
  msg: ChatMessage,
  openclawClient: OpenClawClient,
  relayClient: RelayClient,
  ctx: ToolExecutionContext,
  opts: ChatHandlerOptions,
  queueManager?: MessageQueueManager | null
): Promise<void>
```

내부: `const { logger } = ctx` (동일).

### 7.5 cron-scheduler.ts 변경

```typescript
// Before
import type { WDKContext } from './tool-surface.js'

export class CronScheduler {
  private _wdkContext: WDKContext
  constructor (store: CronStore, wdkContext: WDKContext, ...)
}

// After
import type { ToolExecutionContext } from './tool-surface.js'

export class CronScheduler {
  private _ctx: ToolExecutionContext
  constructor (store: CronStore, ctx: ToolExecutionContext, ...)
}
```

`tick()` 내부: `processChat(userId, cron.sessionId, cron.prompt, this._ctx, ...)` (변수명만 변경).

### 7.6 admin-server.ts 변경

```typescript
// Before
import type { WDKContext } from './tool-surface.js'

export interface AdminServerOptions {
  socketPath: string
  store: any
  journal: ExecutionJournal | null
  cronScheduler: CronScheduler | null
  relayClient: RelayClient
  wdkContext: WDKContext        // dead field
  logger: Logger
}

// After
import type { AdminStorePort } from './ports.js'

export interface AdminServerOptions {
  socketPath: string
  store: AdminStorePort         // any -> Port
  journal: ExecutionJournal | null
  cronScheduler: CronScheduler | null
  relayClient: RelayClient
  logger: Logger
  // wdkContext 제거
}
```

내부: `this._store: AdminStorePort` (동일 메서드 호출, 타입만 좁아짐).

### 7.7 index.ts 변경

```typescript
// Before
import type { WDKContext } from './tool-surface.js'
const wdkContext: WDKContext = { wdk: wdk!, broker, store, logger, journal, relayClient }

// After
import type { ToolExecutionContext } from './tool-surface.js'
const ctx: ToolExecutionContext = { wdk: wdk!, broker, store, logger, journal }

// AdminServer
const adminServer = new AdminServer({
  socketPath: config.socketPath,
  store,          // SqliteApprovalStore satisfies AdminStorePort
  journal,
  cronScheduler,
  relayClient,
  logger
  // wdkContext 제거
})
```

## 8. 변경 파일 목록

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `packages/daemon/src/ports.ts` | **신규** | ToolStorePort, ApprovalBrokerPort, AdminStorePort 정의 |
| `packages/daemon/src/tool-surface.ts` | 수정 | WDKContext -> ToolExecutionContext, any -> Port, relayClient 제거 |
| `packages/daemon/src/tool-call-loop.ts` | 수정 | WDKContext -> ToolExecutionContext (import + 파라미터 타입) |
| `packages/daemon/src/chat-handler.ts` | 수정 | WDKContext -> ToolExecutionContext (import + 파라미터 타입) |
| `packages/daemon/src/cron-scheduler.ts` | 수정 | WDKContext -> ToolExecutionContext (import + 필드 타입) |
| `packages/daemon/src/admin-server.ts` | 수정 | wdkContext 제거, store: any -> AdminStorePort |
| `packages/daemon/src/index.ts` | 수정 | WDKContext -> ToolExecutionContext 조립, AdminServer 옵션 변경 |

총 **7개 파일** (신규 1, 수정 6).

## 9. 위험 평가

| 위험 | 확률 | 영향 | 완화 |
|------|------|------|------|
| Port interface가 SqliteApprovalStore의 실제 시그니처와 불일치 | 낮음 | 컴파일 에러 | Port 정의 시 approval-store.ts의 abstract 메서드 시그니처를 그대로 복사 |
| CronScheduler 내부 CronStore interface와 ToolStorePort의 cron 메서드 중복 | 낮음 | 혼란 | CronStore를 ToolStorePort의 부분집합으로 유지하거나, CronStore를 ToolStorePort에서 Pick으로 도출 |
| index.ts에서 `store`가 ToolStorePort와 AdminStorePort 모두를 만족해야 함 | 없음 | - | SqliteApprovalStore는 두 Port의 모든 메서드를 이미 구현. TypeScript의 structural typing이 자동 처리 |
| control-handler.ts가 구체 타입(SignedApprovalBroker)을 사용하는데 이번에 Port로 바꾸지 않음 | 의도적 | - | control-handler는 submitApproval, setTrustedApprovers 등 broker의 full API를 사용하므로 Port 축소가 부적절. Out of scope로 유지 |

## 10. 테스팅 전략

1. **컴파일 타임 검증**: `tsc --noEmit`으로 모든 Port 적합성 확인. SqliteApprovalStore가 ToolStorePort, AdminStorePort를 만족하는지, SignedApprovalBroker가 ApprovalBrokerPort를 만족하는지 structural typing으로 자동 검증.
2. **기존 테스트 실행**: daemon 패키지의 기존 테스트가 있다면 모두 통과해야 함. 시그니처 변경이므로 테스트 코드에서 WDKContext -> ToolExecutionContext 변경 필요.
3. **수동 검증**: daemon 기동 -> relay 연결 -> chat 메시지 처리 -> tool call 실행 흐름이 정상 동작하는지 확인.

## 11. 성공 지표

1. `grep -r 'any' packages/daemon/src/tool-surface.ts` 결과에 `broker: any`, `store: any`가 없어야 한다.
2. `grep -r 'any' packages/daemon/src/admin-server.ts` 결과에 `store: any`가 없어야 한다.
3. `grep -r 'WDKContext' packages/daemon/src/` 결과가 0건이어야 한다.
4. `grep -r 'relayClient' packages/daemon/src/tool-surface.ts` 결과가 0건이어야 한다 (ToolExecutionContext에서 제거).
5. `tsc --noEmit` 성공.
6. admin-server.ts에 `wdkContext` 관련 코드가 없어야 한다.

## 12. 구현 순서

| 단계 | 작업 | 의존 |
|------|------|------|
| 1 | `ports.ts` 생성 (ToolStorePort, ApprovalBrokerPort, AdminStorePort) | 없음 |
| 2 | `tool-surface.ts`: WDKContext -> ToolExecutionContext, any -> Port, relayClient 제거 | 단계 1 |
| 3 | `tool-call-loop.ts`: import 변경, 파라미터 타입 변경 | 단계 2 |
| 4 | `chat-handler.ts`: import 변경, 파라미터 타입 변경 | 단계 2 |
| 5 | `cron-scheduler.ts`: import 변경, 필드 타입 변경 | 단계 2 |
| 6 | `admin-server.ts`: wdkContext 제거, store: any -> AdminStorePort | 단계 1 |
| 7 | `index.ts`: ToolExecutionContext 조립, AdminServer 옵션 변경 | 단계 2-6 |
| 8 | `tsc --noEmit` + 기존 테스트 실행 | 단계 7 |

단계 3-6은 병렬 수행 가능.
