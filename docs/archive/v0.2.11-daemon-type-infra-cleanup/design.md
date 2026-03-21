# 설계 - v0.2.11

## 변경 규모
**규모**: 일반 기능
**근거**: 새 모듈 추가(ai-tool-schema.ts), 내부 API 변경(CronScheduler constructor, AdminServer constructor), 7개 파일 수정 + 1개 파일 생성. 외부 패키지 변경 없음.

---

## 문제 요약
daemon 패키지의 타입 인프라에 5가지 중간 우선순위 문제가 있다: (1) TOOL_DEFINITIONS가 execution 모듈(tool-surface.ts)에 위치하여 openclaw-client.ts가 역방향 import, (2) Cron 타입 3중 수동 복제, (3) Queue 타입 중복 정의, (4) CronScheduler가 MessageQueueManager를 직접 참조, (5) Options 타입에서 config와 dependency 혼재로 depth inflation.

> 상세: [README.md](README.md) 참조

---

## 의존성 분석 및 작업 순서

### 현재 import 그래프 (관련 부분)

```
openclaw-client.ts ──type import──→ tool-surface.ts (ToolDefinition)
tool-call-loop.ts  ──value+type──→ tool-surface.ts (TOOL_DEFINITIONS, executeToolCall, WDKContext, ToolResult, ToolDefinition)
chat-handler.ts    ──type import──→ tool-surface.ts (WDKContext)
cron-scheduler.ts  ──type import──→ tool-surface.ts (WDKContext)
cron-scheduler.ts  ──type import──→ message-queue.ts (MessageQueueManager)
cron-scheduler.ts  ──value import─→ tool-call-loop.ts (processChat)
admin-server.ts    ──type import──→ tool-surface.ts (WDKContext)
admin-server.ts    ──type import──→ cron-scheduler.ts (CronScheduler)
index.ts           ──type import──→ tool-surface.ts (WDKContext)
index.ts           ──value import─→ message-queue.ts (MessageQueueManager)
index.ts           ──value import─→ cron-scheduler.ts (CronScheduler)
index.ts           ──value import─→ admin-server.ts (AdminServer)
```

### 문제 간 의존성

```
[문제1: TOOL_DEFINITIONS 분리]  ← 독립 (다른 문제에 영향 없음)
[문제3: Queue 타입 통합]        ← 독립 (message-queue.ts 내부)
[문제2: Cron 타입 통합]         ← 독립 (cron-scheduler.ts 내부)
[문제4: CronScheduler 느슨화]   ← 문제2 이후 (Cron 타입 정리가 선행되어야 깔끔)
[문제5: Options depth 분리]     ← 문제4 이후 (dispatch 콜백 패턴이 확정되어야 Options 설계 가능)
```

### 권장 작업 순서

| 순서 | 문제 | 이유 |
|------|------|------|
| 1 | 문제1: TOOL_DEFINITIONS 분리 | 독립적, 가장 단순, import 방향 교정의 신호탄 |
| 2 | 문제3: Queue 타입 통합 | 독립적, 한 줄 변경 수준 |
| 3 | 문제2: Cron 타입 통합 | 독립적, CronBase 도입 |
| 4 | 문제4: CronScheduler 느슨화 | 문제2의 CronBase 기반 위에서 dispatch 패턴 변경 |
| 5 | 문제5: Options depth 분리 | 문제4의 콜백 패턴 확정 후 Options 재구성 |

---

## 문제 1: TOOL_DEFINITIONS 위치 교정

### 현재 상태

```
tool-surface.ts (L1: 타입 + L3: execution)
  ├── export interface ToolDefinition        ← AI transport schema
  ├── export const TOOL_DEFINITIONS          ← 런타임 값 (12개 도구 JSON schema)
  ├── export interface WDKContext             ← execution context
  ├── export interface ToolResult            ← execution result
  └── export async function executeToolCall  ← execution dispatcher

openclaw-client.ts (L2: AI client)
  └── import type { ToolDefinition } from './tool-surface.js'  ← 역방향! L2→L3

tool-call-loop.ts (L3: orchestration)
  └── import { TOOL_DEFINITIONS, executeToolCall } from './tool-surface.js'
  └── import type { WDKContext, ToolResult, ToolDefinition } from './tool-surface.js'
```

**문제**: `ToolDefinition` 타입과 `TOOL_DEFINITIONS` 값은 OpenAI function calling의 transport schema인데, execution 모듈인 `tool-surface.ts`에 위치. `openclaw-client.ts`가 이를 import하면 L2가 L3를 참조하는 역방향 의존.

### 접근법

`ai-tool-schema.ts`를 새로 생성하여 `ToolDefinition` 타입과 `TOOL_DEFINITIONS` 상수를 분리한다.

### 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: `ai-tool-schema.ts` 신규 파일로 분리 | 소유권 명확, 역방향 제거, Layer 구분 자연스러움 | 파일 1개 추가 | **선택** |
| B: `ToolDefinition` 타입만 `openclaw-client.ts`로 이동 | import 방향 교정 | `TOOL_DEFINITIONS`가 여전히 tool-surface.ts에 남아 타입-값 분리, tool-call-loop.ts가 양쪽 import | ❌ |
| C: `openclaw-client.ts`에 자체 `ToolDefinition` 재선언 | import 끊김 | 타입 중복, 드리프트 위험 | ❌ |

**선택 이유**: A가 "ToolDefinition 타입 + TOOL_DEFINITIONS 값"을 하나의 모듈에 두어 응집도가 가장 높다. openclaw-client.ts와 tool-call-loop.ts 모두 이 모듈을 import하면 방향이 자연스럽다(schema → consumer).

### 변경 후 구조

```
ai-tool-schema.ts (신규, L1: AI transport schema)
  ├── export interface ToolDefinition
  └── export const TOOL_DEFINITIONS: ToolDefinition[]

tool-surface.ts (L3: execution only)
  ├── export interface WDKContext
  ├── export interface ToolResult
  └── export async function executeToolCall

openclaw-client.ts (L2)
  └── import type { ToolDefinition } from './ai-tool-schema.js'  ← 정방향

tool-call-loop.ts (L3)
  └── import { TOOL_DEFINITIONS } from './ai-tool-schema.js'
  └── import type { ToolDefinition } from './ai-tool-schema.js'
  └── import { executeToolCall } from './tool-surface.js'
  └── import type { WDKContext, ToolResult } from './tool-surface.js'
```

### 변경 파일 목록

| 파일 | 동작 | 변경 내용 |
|------|------|-----------|
| `src/ai-tool-schema.ts` | 생성 | `ToolDefinition` 인터페이스 + `TOOL_DEFINITIONS` 상수 이동 |
| `src/tool-surface.ts` | 수정 | `ToolDefinition` 인터페이스, `TOOL_DEFINITIONS` 상수 제거 |
| `src/openclaw-client.ts` | 수정 | import 경로 `tool-surface.js` → `ai-tool-schema.js` |
| `src/tool-call-loop.ts` | 수정 | `TOOL_DEFINITIONS`, `ToolDefinition` import를 `ai-tool-schema.js`에서, 나머지는 `tool-surface.js`에서 |

---

## 문제 2: Cron 타입 3중 복제 통합

### 현재 상태

```typescript
// cron-scheduler.ts -- 3개의 거의 동일한 타입

export interface CronEntry {           // 인메모리 캐시용 (runtime)
  id: string
  sessionId: string
  interval: string
  intervalMs: number                   // ← CronEntry만 보유
  prompt: string
  chainId: number | null
  accountIndex: number
  lastRunAt: number                    // ← CronEntry, CronListItem 보유
}

export interface CronRegistration {    // register() 메서드 입력용
  id: string
  sessionId: string
  interval: string
  prompt: string
  chainId: number | null
  accountIndex: number
}

export interface CronListItem {        // list() 메서드 반환용
  id: string
  sessionId: string
  interval: string
  prompt: string
  chainId: number | null
  accountIndex: number
  lastRunAt: number                    // ← CronEntry, CronListItem 보유
}
```

**필드 비교표**:

| 필드 | CronEntry | CronRegistration | CronListItem |
|------|-----------|-----------------|--------------|
| id | O | O | O |
| sessionId | O | O | O |
| interval | O | O | O |
| prompt | O | O | O |
| chainId | O | O | O |
| accountIndex | O | O | O |
| intervalMs | O | - | - |
| lastRunAt | O | - | O |

### 접근법

`CronBase`를 도입하고 나머지 타입을 파생한다.

### 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: `CronBase` (6 필드) + `CronEntry = CronBase & { intervalMs, lastRunAt }` + `CronRegistration = CronBase` + `CronListItem = CronBase & { lastRunAt }` | 최소 중복, 파생 관계 명확 | CronRegistration이 CronBase와 동일해져서 별도 타입이 필요한지 질문 | **선택** |
| B: `CronEntry`를 base로 놓고 `CronRegistration = Omit<CronEntry, 'intervalMs' \| 'lastRunAt'>`, `CronListItem = Omit<CronEntry, 'intervalMs'>` | base가 가장 풍부한 타입 | Omit 체인이 깊어짐, base가 런타임 전용 필드(intervalMs)를 포함하는 것이 개념적으로 어색 | ❌ |
| C: 단일 `Cron` 타입에 `intervalMs?`, `lastRunAt?` optional | 타입 1개로 통일 | No Optional 원칙 위반 | ❌ |

**선택 이유**: A가 No Optional 원칙을 준수하면서 중복을 제거한다. `CronRegistration`이 `CronBase`와 동일해지므로 **`CronRegistration`을 type alias로 유지**한다. 이렇게 하면 register() 메서드의 시그니처에서 의도가 명확하게 읽힌다.

### 변경 후 구조

```typescript
// cron-scheduler.ts

export interface CronBase {
  id: string
  sessionId: string
  interval: string
  prompt: string
  chainId: number | null
  accountIndex: number
}

export type CronRegistration = CronBase

export interface CronEntry extends CronBase {
  intervalMs: number
  lastRunAt: number
}

export interface CronListItem extends CronBase {
  lastRunAt: number
}
```

### 변경 파일 목록

| 파일 | 동작 | 변경 내용 |
|------|------|-----------|
| `src/cron-scheduler.ts` | 수정 | `CronBase` 도입, `CronEntry`/`CronRegistration`/`CronListItem` 파생으로 재작성 |

내부 코드(`register()`, `list()`, `start()` 내 객체 리터럴)는 변경 불필요 -- 구조적 타이핑으로 기존 코드가 새 타입에 자동 호환.

---

## 문제 3: Queue 타입 중복 제거

### 현재 상태

```typescript
// message-queue.ts

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

export interface PendingMessageRequest {
  messageId: string
  sessionId: string
  source: 'user' | 'cron'
  text: string              // ← userId 빠짐
  chainId?: number
  createdAt: number
  cronId?: string           // ← abortController 빠짐
}
```

**분석**: `PendingMessageRequest`는 정확히 `Omit<QueuedMessage, 'userId' | 'abortController'>`이다. `listPending()` 메서드가 `QueuedMessage`에서 이 두 필드를 제외하고 반환하는 투영이므로 Omit 유도가 의미적으로도 정확하다.

### 접근법

`PendingMessageRequest`를 Omit 유도로 교체한다.

### 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: `type PendingMessageRequest = Omit<QueuedMessage, 'userId' \| 'abortController'>` | 중복 제거, QueuedMessage 변경 시 자동 동기화 | Omit 사용 (가독성은 충분) | **선택** |
| B: 현재 유지 (별도 인터페이스) | 독립적, 명시적 | 필드 추가 시 2곳 수정, 드리프트 위험 | ❌ |

### 변경 후 구조

```typescript
// message-queue.ts
export type PendingMessageRequest = Omit<QueuedMessage, 'userId' | 'abortController'>
```

### 변경 파일 목록

| 파일 | 동작 | 변경 내용 |
|------|------|-----------|
| `src/message-queue.ts` | 수정 | `PendingMessageRequest` 인터페이스를 Omit type alias로 교체 |

`listPending()` 메서드의 `map` 본문은 변경 불필요 -- 반환 형상이 동일하므로 타입 체크 통과.

---

## 문제 4: CronScheduler 직접 결합 느슨화

### 현재 상태

```typescript
// cron-scheduler.ts

import { processChat } from './tool-call-loop.js'
import type { MessageQueueManager } from './message-queue.js'

export class CronScheduler {
  private _queueManager: MessageQueueManager | null

  async tick (): Promise<void> {
    // ...
    if (this._queueManager) {
      // 전략 A: queue를 통한 dispatch
      this._queueManager.enqueue(cron.sessionId, { ... })
    } else {
      // 전략 B: 직접 processChat 호출
      const result = await processChat(userId, cron.sessionId, cron.prompt, ...)
    }
  }
}
```

**문제**:
1. CronScheduler가 dispatch 전략(queue vs direct)을 직접 알고 있음
2. `MessageQueueManager`와 `processChat` 두 가지 구체 타입/함수에 동시 의존
3. `processChat` import으로 인해 `tool-call-loop.ts` → `tool-surface.ts` 의존 체인이 CronScheduler까지 전파

### 접근법

dispatch를 콜백 함수로 추출하여 CronScheduler가 "어떻게 실행할지"를 모르게 한다.

### 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: dispatch 콜백 `(cronId, sessionId, userId, prompt, chainId) => Promise<void>` | 가장 단순, CronScheduler가 MessageQueueManager/processChat 모두 모름, import 2개 제거 | 콜백 시그니처가 고정 | **선택** |
| B: Port 인터페이스 `CronDispatcher { dispatch(entry: CronDispatchRequest): Promise<void> }` | 추상화 수준 높음, 테스트 용이 | Primitive First 위반 -- 현재 구현체가 1개뿐인데 인터페이스 도입 | ❌ |
| C: EventEmitter 기반 `scheduler.emit('cron:due', entry)` | 완전 비동기 분리 | 에러 처리 어려움, 실행 완료 대기 불가 | ❌ |

**선택 이유**: A는 Primitive First 원칙에 부합한다. 콜백은 가장 단순한 의존성 역전 메커니즘이며, 추후 Port가 필요하면 콜백에서 인터페이스로 승격하면 된다. 현재 dispatch 구현체는 1개(index.ts에서 queueManager.enqueue 또는 _processChatDirect 분기)이므로 인터페이스는 과잉.

### 변경 후 구조

```typescript
// cron-scheduler.ts

// 콜백 타입 정의
export type CronDispatch = (
  cronId: string,
  sessionId: string,
  userId: string,
  prompt: string,
  chainId: number | null
) => Promise<void>

export class CronScheduler {
  private _dispatch: CronDispatch

  constructor (
    store: CronStore,
    logger: Logger,
    dispatch: CronDispatch,
    opts: CronSchedulerConfig = {}
  ) {
    // ...
    this._dispatch = dispatch
  }

  async tick (): Promise<void> {
    // ...
    const userId = `cron:${cronId}`
    await this._dispatch(cronId, cron.sessionId, userId, cron.prompt, cron.chainId)
    this._logger.info({ cronId }, 'Cron dispatched')
  }
}
```

```typescript
// index.ts -- caller가 dispatch 전략을 결정

const cronDispatch: CronDispatch = async (cronId, sessionId, userId, prompt, chainId) => {
  queueManager.enqueue(sessionId, {
    sessionId,
    source: 'cron',
    userId,
    text: prompt,
    chainId: chainId ?? undefined,
    cronId
  })
}

const cronScheduler = new CronScheduler(store, logger, cronDispatch, {
  tickIntervalMs: config.cronTickIntervalMs
})
```

### 제거되는 import

```diff
// cron-scheduler.ts
- import { processChat } from './tool-call-loop.js'
- import type { OpenClawClient } from './openclaw-client.js'
- import type { MessageQueueManager } from './message-queue.js'
```

### constructor 시그니처 변경

```diff
// Before
constructor (store, wdkContext, openclawClient, logger, opts)

// After
constructor (store, logger, dispatch, opts)
```

`wdkContext`와 `openclawClient`는 direct processChat 경로에만 필요했는데, 그 경로가 콜백 내부로 이동하므로 CronScheduler에서 제거된다.

### 변경 파일 목록

| 파일 | 동작 | 변경 내용 |
|------|------|-----------|
| `src/cron-scheduler.ts` | 수정 | `CronDispatch` 타입 추가, constructor에서 `wdkContext`/`openclawClient`/`queueManager` 제거 → `dispatch` 콜백으로 교체, `tick()` 내 분기 제거 |
| `src/index.ts` | 수정 | CronScheduler 생성 시 `cronDispatch` 콜백 전달, constructor 인자 변경 |

---

## 문제 5: Options depth inflation 해소

### 현재 상태

```typescript
// cron-scheduler.ts
export interface CronSchedulerOptions {
  tickIntervalMs?: number                    // ← config 값
  queueManager?: MessageQueueManager | null  // ← service dependency
}

// admin-server.ts
export interface AdminServerOptions {
  socketPath: string           // ← config 값
  store: any                   // ← service dependency
  journal: ExecutionJournal | null  // ← service dependency
  cronScheduler: CronScheduler | null  // ← service dependency
  relayClient: RelayClient     // ← service dependency
  wdkContext: WDKContext        // ← service dependency
  logger: Logger               // ← infra dependency
}
```

**문제**: config 값과 service dependency가 하나의 Options 타입에 혼재. `CronSchedulerOptions`가 `MessageQueueManager`를 참조하여 불필요한 depth 증가. `AdminServerOptions`는 7개 필드 중 1개만 config.

### 접근법

문제 4에서 `CronSchedulerOptions.queueManager`가 제거되므로, 남은 작업은:
1. `CronSchedulerOptions`를 `CronSchedulerConfig`로 이름 변경 (config만 남으므로)
2. `AdminServerOptions`에서 config와 dependency를 분리

### 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: AdminServerOptions를 2개로 분리 (`AdminServerConfig` + constructor 인자) | config/dep 구분 명확, depth 감소 | constructor 시그니처 변경 | **선택** |
| B: AdminServerOptions 내 중첩 `config: { socketPath }` | 한 타입으로 유지 | 중첩 수준만 바뀌고 depth 감소 효과 미미 | ❌ |
| C: 현재 유지 | 변경 없음 | 문제 4에서 CronSchedulerOptions.queueManager가 제거되면 depth 일부 감소되지만 AdminServer는 그대로 | ❌ |

**선택 이유**: 문제 4가 완료되면 CronSchedulerOptions에는 `tickIntervalMs`만 남는다. 이를 `CronSchedulerConfig`로 이름 변경하면 config-only라는 의도가 명확해진다. AdminServerOptions도 같은 패턴을 적용하여 `AdminServerConfig`(socketPath만)와 나머지 서비스 dependency를 constructor positional args로 분리한다.

### 변경 후 구조

#### CronSchedulerConfig

```typescript
// cron-scheduler.ts

export interface CronSchedulerConfig {
  tickIntervalMs: number
}

export class CronScheduler {
  constructor (
    store: CronStore,
    logger: Logger,
    dispatch: CronDispatch,
    config: CronSchedulerConfig
  ) { ... }
}
```

**변경점**: `CronSchedulerOptions`(optional 필드 포함) → `CronSchedulerConfig`(required 필드). `tickIntervalMs`의 기본값은 caller(index.ts)에서 `config.cronTickIntervalMs`를 전달하므로 CronScheduler 내부 기본값 불필요. No Optional 원칙 준수.

#### AdminServerConfig

```typescript
// admin-server.ts

export interface AdminServerConfig {
  socketPath: string
}

// 비공개 — 타입 그래프 노드에 포함되지 않음
interface AdminServerDeps {
  store: any
  journal: ExecutionJournal | null
  cronScheduler: CronScheduler | null
  relayClient: RelayClient
  logger: Logger
}

export class AdminServer {
  constructor (config: AdminServerConfig, deps: AdminServerDeps) { ... }
}
```

**핵심**: `AdminServerDeps`는 **export하지 않는다**. 타입 그래프에 노드로 잡히지 않으므로 `AdminServer` 클래스의 depth가 실질적으로 감소한다. `wdkContext`는 v0.2.10에서 제거되므로 deps에서도 제거.

### 예상 그래프 변화 (depth)

| 타입 | 현재 depth | 변경 후 depth | 이유 |
|------|-----------|-------------|------|
| CronSchedulerOptions → CronSchedulerConfig | 4 | **0** | queueManager 제거(문제4), config만 남아 leaf |
| CronScheduler | 5 | **3** | CronSchedulerOptions(4→0) + dispatch 콜백(L0) 효과 |
| AdminServerOptions → AdminServerConfig | 6 | **0** | socketPath만 남아 leaf, deps는 비공개 |
| AdminServer | 7 | **4~5** | AdminServerConfig(0) + 비공개 deps(그래프 미포함). CronScheduler(3), ExecutionJournal(1), RelayClient(1) 중 max depth + 1 |

**max depth 7 → 4~5로 감소. 개념 깊이(4~5)에 근접.**

**대안 고려: positional args vs named deps**

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A-1: `constructor (config: AdminServerConfig, deps: AdminServerDeps)` | 2 그룹으로 구분 명확, 기존 패턴과 유사 | 파라미터 2개 | **선택** |
| A-2: positional args `constructor (socketPath, store, journal, ...)` | 개별 타입 명확 | 7개 positional arg는 가독성 저하 | ❌ |

### 변경 파일 목록

| 파일 | 동작 | 변경 내용 |
|------|------|-----------|
| `src/cron-scheduler.ts` | 수정 | `CronSchedulerOptions` → `CronSchedulerConfig` (required, queueManager 제거, tickIntervalMs만) |
| `src/admin-server.ts` | 수정 | `AdminServerOptions` → `AdminServerConfig` + `AdminServerDeps` 분리, constructor 시그니처 변경 |
| `src/index.ts` | 수정 | AdminServer, CronScheduler 생성 코드 업데이트 |

---

## 전체 변경 파일 요약

| 파일 | 문제 | 동작 | 핵심 변경 |
|------|------|------|-----------|
| `src/ai-tool-schema.ts` | #1 | **생성** | ToolDefinition + TOOL_DEFINITIONS |
| `src/tool-surface.ts` | #1 | 수정 | ToolDefinition, TOOL_DEFINITIONS 제거 |
| `src/openclaw-client.ts` | #1 | 수정 | import 경로 변경 |
| `src/tool-call-loop.ts` | #1 | 수정 | import 분리 (schema vs execution) |
| `src/message-queue.ts` | #3 | 수정 | PendingMessageRequest를 Omit으로 교체 |
| `src/cron-scheduler.ts` | #2,#4,#5 | 수정 | CronBase 도입, dispatch 콜백화, Config 분리 |
| `src/admin-server.ts` | #5 | 수정 | Options → Config + Deps 분리 |
| `src/index.ts` | #4,#5 | 수정 | cronDispatch 콜백 정의, constructor 호출 업데이트 |

**총**: 1개 생성, 7개 수정

---

## 범위 / 비범위

**범위 (In Scope)**:
- `packages/daemon/src/` 내 8개 파일 (위 표 참조)
- daemon 내부 타입 구조, import 방향, constructor 시그니처

**비범위 (Out of Scope)**:
- ToolResult/ControlPayload union 분리 (v0.2.9 범위)
- WDKContext 분해 (v0.2.10 범위)
- tool 기능/로직 변경
- Relay 프로토콜 변경
- 외부 패키지 (guarded-wdk, manifest, relay, app) 변경

---

## 아키텍처 개요

### 변경 전 import 방향 (문제 영역)

```
                 openclaw-client ──type──→ tool-surface (역방향!)
                                              ↑
                 tool-call-loop ──value+type───┘
                      ↑
cron-scheduler ──value┘ ──type──→ message-queue (직접 결합)
      ↑
admin-server ──type───┘
```

### 변경 후 import 방향

```
ai-tool-schema (L1: schema)
    ↑ type          ↑ value+type
openclaw-client    tool-call-loop ──value+type──→ tool-surface (L3: execution)
    (L2)                (L3)
                         ↑ (간접, dispatch 콜백 통해)
                  cron-scheduler (L3, message-queue import 제거)
                         ↑ type
                  admin-server (L4)
```

---

## API/인터페이스 계약 변경

### ai-tool-schema.ts (신규)

```typescript
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description: string; items?: { type: string }; enum?: string[] }>
      required?: string[]
    }
  }
}

export const TOOL_DEFINITIONS: ToolDefinition[]
```

### CronBase (신규)

```typescript
export interface CronBase {
  id: string
  sessionId: string
  interval: string
  prompt: string
  chainId: number | null
  accountIndex: number
}
```

### CronDispatch (신규)

```typescript
export type CronDispatch = (
  cronId: string,
  sessionId: string,
  userId: string,
  prompt: string,
  chainId: number | null
) => Promise<void>
```

### PendingMessageRequest (Breaking -- internal only)

```typescript
// Before
export interface PendingMessageRequest {
  messageId: string
  sessionId: string
  source: 'user' | 'cron'
  text: string
  chainId?: number
  createdAt: number
  cronId?: string
}

// After
export type PendingMessageRequest = Omit<QueuedMessage, 'userId' | 'abortController'>
```

### CronScheduler constructor (Breaking -- internal only)

```typescript
// Before
constructor (store, wdkContext, openclawClient, logger, opts?: CronSchedulerOptions)

// After
constructor (store, logger, dispatch: CronDispatch, config: CronSchedulerConfig)
```

### AdminServer constructor (Breaking -- internal only)

```typescript
// Before
constructor (opts: AdminServerOptions)

// After
constructor (config: AdminServerConfig, deps: AdminServerDeps)
```

---

## 테스트 전략

- **빌드 검증**: `npx tsc -p packages/daemon/tsconfig.json --noEmit` 통과 확인 (각 문제 완료 시마다)
- **CI 체크**: `scripts/check/` 의 cross/dead-files, cross/no-cross-package-import 통과 확인
- **수동 확인**: import 방향이 역방향 없이 단방향인지 grep으로 검증
  - `grep -r "from.*tool-surface" src/openclaw-client.ts` → 결과 없음 확인
  - `grep -r "from.*message-queue" src/cron-scheduler.ts` → 결과 없음 확인

---

## 리스크/오픈 이슈

| 리스크 | 영향 | 완화 |
|--------|------|------|
| constructor 시그니처 변경으로 index.ts 컴파일 실패 | 빌드 실패 | 문제 4,5를 같은 커밋에서 index.ts 동시 수정 |
| CronScheduler에서 direct processChat 경로 제거 | 기능 변경? | 아님 -- 현재 index.ts에서 항상 queueManager를 전달하므로 direct 경로는 dead code. 단, queueManager 없이 CronScheduler를 사용하는 미래 시나리오가 필요하면 dispatch 콜백에서 직접 processChat을 호출하면 됨 |
| PendingMessageRequest의 Omit 변환으로 기존 소비자 호환성 | 구조 동일하므로 소비자 코드 변경 없음 | TypeScript 구조적 타이핑이 보장 |

**리스크 수준**: 낮음. 모든 변경이 daemon 내부이며 외부 소비자 없음.
