# Daemon 도메인 Aggregate 분석서

> daemon 패키지의 5개 도메인 Aggregate를 타입 그래프 기반으로 식별하고, 도메인 간 관계 → 기능 축 → 시나리오 순서로 풀어낸 아키텍처 원페이저

---

## Section 1 — 한줄 정의

```
┌─────────────────────────────────────────────────────────────────────┐
│                         daemon 전체 구조                             │
│                                                                     │
│  "앱에서 자연어 메시지가 들어오면 AI(OpenClaw)와 도구 호출 루프를     │
│   돌려 온체인 트랜잭션을 실행하고, 승인/거부 결과를 앱으로 돌려보낸다" │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Section 2 — 도메인 Aggregate

### 도구 (Tool)

> "AI가 호출할 수 있는 12종의 온체인 기능과, 실행 결과를 돌려주는 단위"

Aggregate Root: `ToolExecutionContext` — core (`tool-surface.ts:12`)
생애주기: 정적 — 도구 정의는 부팅 시 확정. 각 호출은 stateless.

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │  ToolDefinition ──→ TOOL_DEFINITIONS ──→ processChat()          │
  │   (input)             (config)              │                   │
  │                                             ▼                   │
  │  ToolArgs ─────────────────────────→ [ToolExecutionContext]     │
  │   (input)                               (core)                  │
  │                                        ╱  │  │  ╲               │
  │                                       ╱   │  │   ╲              │
  │                            WDKInstance  Store Broker Journal     │
  │                              (port)    (port) (port) (port)     │
  │                                        │                        │
  │                                        ▼                        │
  │                                   AnyToolResult                 │
  │                                     (output)                    │
  │                                   ╱    │    ╲                   │
  │                      SendTxResult  TransferResult  ...12개      │
  │                       = executed     = executed                  │
  │                       | duplicate    | rejected                  │
  │                       | rejected     | error                    │
  │                       | error                                   │
  │                                        │                        │
  │                                        ▼                        │
  │                                  ToolResultEntry                │
  │                                    (output)                     │
  │                          { toolCallId, name, args, result }     │
  │                           name으로 discriminated                 │
  │                                        │                        │
  │                                        ▼                        │
  │                                ProcessChatResult                │
  │                                   (output)                      │
  │                          { content, toolResults[], iterations }  │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘
```

- **ToolExecutionContext** — 모든 도구 실행의 의존성 번들. wdk(서명엔진), broker(승인요청), store(정책/크론 DB), journal(중복방지)
- **ToolDefinition** — OpenAI function calling 스키마 `{ type:'function', function: { name, description, parameters } }`
- **AnyToolResult** — 12개 도구별 결과의 합집합. 각 variant는 `status` 필드로 판별 (executed/rejected/error/duplicate/pending/signed)
- **ToolResultEntry** — 루프 1회 실행 결과. `name` 필드로 도구별 result 타입이 보장되는 discriminated union
- **ToolStorePort / ApprovalBrokerPort / WDKInstance** — 외부 의존(guarded-wdk) 경계 인터페이스

---

### 메시지 (Message)

> "사용자 또는 크론에서 온 채팅 요청을 세션별 FIFO 큐에 넣고 순차 처리하는 작업 단위"

Aggregate Root: `MessageQueueManager` — core (`message-queue.ts:120`)
생애주기: **enqueued → started → done / cancelled / error**

```
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │  Omit<QueuedMessage,...> ──→ [MessageQueueManager]       │
  │       (input)                     (core)                 │
  │                                     │                    │
  │                          Map<userId:sessionId, ▼>        │
  │                                     │                    │
  │                             SessionMessageQueue          │
  │                                  (core)                  │
  │                                ╱       ╲                 │
  │                         enqueue()    drain()             │
  │                            │            │                │
  │                            ▼            ▼                │
  │                      QueuedMessage ──→ MessageProcessor  │
  │                        (value)           (port)          │
  │                      { messageId         (msg,signal)    │
  │                        sessionId           => void       │
  │                        source:'user'|'cron'              │
  │                        userId                            │
  │                        text                              │
  │                        abortController }                 │
  │                            │                             │
  │               cancelQueued/cancelActive                   │
  │                            │                             │
  │                            ▼                             │
  │                       CancelResult                       │
  │                         (output)                         │
  │                  { ok, reason?, wasProcessing? }          │
  │                                                          │
  │  MessageQueueOptions ─config─→ maxQueueSize(100)         │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

- **MessageQueueManager** — `userId:sessionId` 복합키로 SessionMessageQueue를 관리. 크로스-유저 충돌 방지
- **SessionMessageQueue** — FIFO 큐. `_drain()`이 한 번에 하나씩 순차 처리. `_processing` 슬롯이 현재 실행 중인 메시지
- **QueuedMessage** — `messageId`(UUID)로 식별. `abortController`로 처리 중 취소 가능. `source`로 user/cron 구분
- **CancelResult** — cancelQueued(큐에서 제거) / cancelActive(AbortController.abort) 결과

---

### 의도 (Intent)

> "온체인 행동(tx 전송/서명)을 intentHash로 식별하고, 중복 실행을 방지하며 상태를 추적하는 저널"

Aggregate Root: `ExecutionJournal` — core (`execution-journal.ts:55`)
생애주기: **received → settled / rejected / signed / failed**

```
  ┌─────────────────────────────────────────────────────────┐
  │                                                         │
  │  TrackMeta ──→ [ExecutionJournal] ──→ JournalEntry      │
  │   (input)           (core)              (value)         │
  │  { accountIndex    ╱      ╲          { intentHash       │
  │    chainId      _hashIndex _statusIndex targetHash      │
  │    targetHash } Map<tgtHash Map<intent   status          │
  │                  ,intentH>   ,status>    txHash? }       │
  │                                                         │
  │  JournalListOptions ──→ list() ──→ JournalEntry[]       │
  │   (input)                                               │
  │  { status?, chainId?, limit? }                          │
  │                                                         │
  │  JournalStatus ── enum (from guarded-wdk)               │
  │   = 'received' | 'settled' | 'signed'                   │
  │   | 'failed'   | 'rejected'                             │
  │                                                         │
  │  핵심 메서드:                                             │
  │   isDuplicate(hash) → boolean  (O(1) hashIndex 조회)    │
  │   track(hash, meta) → received                          │
  │   updateStatus(hash, status) → 상태 전이                 │
  │   recover() → 부팅 시 store에서 인메모리 복원             │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
```

- **ExecutionJournal** — 두 개의 인메모리 인덱스: `_hashIndex`(targetHash→intentHash, 중복 감지), `_statusIndex`(intentHash→status, 상태 조회). 터미널 상태 도달 시 hashIndex에서 제거
- **TrackMeta** — track() 호출 시 전달. accountIndex/chainId/targetHash로 저널 항목 생성
- **JournalStatus** — guarded-wdk에서 import. received가 유일한 비터미널 상태

---

### 크론 (Cron)

> "주기적으로 AI 프롬프트를 자동 실행하는 예약 작업. duration 문자열로 간격 지정"

Aggregate Root: `CronScheduler` — core (`cron-scheduler.ts:54`)
생애주기: **registered → ticking (매 intervalMs) → removed**

```
  ┌─────────────────────────────────────────────────────────┐
  │                                                         │
  │  CronRegistration ──→ [CronScheduler] ──→ CronListItem  │
  │    (input)                (core)            (output)    │
  │   = CronBase         Map<cronId, CronEntry>  CronBase   │
  │                            │                + lastRunAt  │
  │                            │                             │
  │                            ▼                             │
  │                        CronEntry                        │
  │                         (value)                          │
  │                        CronBase                          │
  │                      + intervalMs (파싱됨)                │
  │                      + lastRunAt                         │
  │                            │                             │
  │                       tick() 매 60s                      │
  │                       elapsed >= intervalMs?             │
  │                            │ yes                         │
  │                            ▼                             │
  │                       CronDispatch                       │
  │                         (port)                           │
  │                 (cronId, sessionId, userId,              │
  │                  prompt, chainId) => void                │
  │                                                         │
  │  CronBase ── (value)                                     │
  │  { id, sessionId, interval, prompt, chainId, acctIdx }  │
  │                                                         │
  │  CronSchedulerConfig ─config─→ { tickIntervalMs: 60s }  │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
```

- **CronScheduler** — `start()`로 store에서 활성 크론 로드 → 인메모리 Map 캐시 → `setInterval`로 tick. `parseInterval("5m")`→300000ms
- **CronEntry** — CronBase에 `intervalMs`(파싱된 밀리초)와 `lastRunAt` 추가. 인메모리 전용
- **CronDispatch** — 콜백 타입. index.ts에서 `queueManager.enqueue(source:'cron')`으로 연결

---

### 릴레이 (Relay)

> "앱과 데몬 사이의 WebSocket 전송 채널. JWT 인증, 자동 재연결, E2E 암호화, 멀티플렉스"

Aggregate Root: `RelayClient` — core (`relay-client.ts:46`)
생애주기: **disconnected → connecting → authenticated → connected ⇄ disconnected**

```
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │  RelayClientOptions ─config─→ [RelayClient]              │
  │  { reconnectBaseMs              (core)                   │
  │    reconnectMaxMs           extends EventEmitter         │
  │    heartbeatIntervalMs }         │                       │
  │                         ┌────────┼────────┐              │
  │                         │        │        │              │
  │                    connect()  send()  onMessage()         │
  │                    JWT auth   encrypt?  decrypt?          │
  │                         │        │        │              │
  │                         ▼        ▼        ▼              │
  │                    WebSocket   EncryptedPayload  MessageHandler │
  │                   (external)     (value)           (port) │
  │                              { nonce: b64     (type,payload│
  │                                ciphertext:b64}  ,raw)=>void│
  │                                                          │
  │  PairingSession ── (value, control-handler에서 사용)       │
  │  { pairingToken, expectedSAS,                            │
  │    daemonEncryptionPubKey/SecretKey }                     │
  │                                                          │
  │  DaemonConfig ─config─→ 환경변수 전체                     │
  │  { relayUrl, daemonId, daemonSecret,                     │
  │    openclawBaseUrl, toolCallMaxIterations, ... }          │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

- **RelayClient** — exponential backoff 재연결 (1s~30s), heartbeat ping/pong (30s), NaCl secretbox E2E 암호화, `_lastControlIds`로 per-user 커서 추적 (재연결 시 resume)
- **EncryptedPayload** — pairing 후 E2E 암호화된 메시지. nacl.secretbox으로 암/복호화
- **PairingSession** — 데몬↔앱 최초 페어링 시 생성. SAS(Short Authentication String) 매칭으로 MITM 방지, ECDH로 세션키 교환

---

## Section 3 — 도메인 관계 맵

```
  ┌────────┐                   ┌────────┐
  │  Tool  │──creates────────→│ Intent │
  │        │  (executeToolCall │        │
  │        │   → journal.track)│        │
  └───┬────┘                   └────────┘
      │                             ▲
      │ consumes                    │ triggers (status update)
      ▼                             │
  ┌────────┐──contains (큐에서──→┌────────┐
  │Message │  drain 시 Tool루프) │  Cron  │
  │        │←─enqueue───────────│        │
  └───┬────┘                    └────────┘
      │
      │ sends/receives via
      ▼
  ┌────────┐
  │ Relay  │
  │        │
  └────────┘
```

| 관계 | 설명 |
|------|------|
| **Tool → Intent** | `executeToolCall`이 tx 실행 전 `journal.track(intentHash)`으로 Intent를 생성. 완료 시 `journal.updateStatus(settled/rejected/failed)` |
| **Message → Tool** | `MessageQueue.drain` → `_processChatDirect` → `processChat`(Tool 루프) 실행 |
| **Cron → Message** | `CronScheduler.tick()` → `cronDispatch` → `queueManager.enqueue(source:'cron')` |
| **Relay → Message** | `onMessage(type='chat')` → `handleChatMessage` → `queueManager.enqueue(source:'user')` |
| **Relay ← Tool** | Tool 루프 중 `relayClient.send('chat', { type:'stream'/'tool_start'/'done' })` |
| **Relay → Relay(control)** | `onMessage(type='control')` → `handleControlMessage` → `broker.submitApproval` |

---

## Section 4 — 기능 축 다이어그램

```
                        3개의 큰 축:

  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
  │  A. AI 도구 루프  │   │ B. 메시지 라우팅  │   │ C. 자율 스케줄링  │
  │ "자연어→온체인    │   │ "앱↔데몬 양방향   │   │ "주기적 프롬프트  │
  │  행동 변환"       │   │  메시지 전달"      │   │  자동 실행"       │
  │ [Tool+Intent]    │   │ [Message+Relay]   │   │ [Cron+Message]   │
  └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
           │                      │                      │
           ▼                      ▼                      ▼
```

---

## Section 5 — 축별 상세 설명

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                            ┃
┃  A. AI 도구 루프 (Tool Loop)                                               ┃
┃  ────────────────────────────                                              ┃
┃  "사용자의 자연어 요청을 어떤 온체인 행동으로 변환하고, 결과는 무엇인가?"    ┃
┃  관여 도메인: Tool, Intent                                                  ┃
┃                                                                            ┃
┃  userMessage ──→ OpenClaw(LLM) ──→ tool_calls? ──→ executeToolCall ──→     ┃
┃       │              ▲                                    │                ┃
┃   Tool.input     Tool.port              Tool.core ──→ Intent.core          ┃
┃  (ChatMessage)  (OpenClawClient)     (ToolExecCtx)   (journal.track)       ┃
┃                      │              ┌────────────────────┐│                ┃
┃                      └──────────────│ tool results (JSON) │┘                ┃
┃                      (반복, max 10) └────────────────────┘                 ┃
┃                                          │ Tool.output                     ┃
┃                            (AnyToolResult → ToolResultEntry)               ┃
┃                                          │                                 ┃
┃                           ProcessChatResult { content, toolResults[] }     ┃
┃                                                                            ┃
┃  결과 상태:                                                                 ┃
┃    executed  — tx 브로드캐스트 성공 (Intent: received→settled)              ┃
┃    signed    — 서명만 완료 (Intent: received→signed)                        ┃
┃    rejected  — 정책 거부 (Intent: received→rejected, rejection 기록)        ┃
┃    duplicate — intentHash 중복 (Intent: 이미 존재)                          ┃
┃    pending   — 정책 변경 승인 대기 (ApprovalRequest 생성)                    ┃
┃    error     — 실행 오류 (Intent: received→failed)                          ┃
┃                                                                            ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
```

| 컴포넌트 | 위치 | 도메인 | 타입역할 | 설명 | 의존 |
|----------|------|--------|----------|------|------|
| `ToolExecutionContext` | `tool-surface.ts:12` | Tool | core | wdk+broker+store+logger+journal 번들 | WDKInstance, ToolStorePort, ApprovalBrokerPort, ExecutionJournal |
| `executeToolCall()` | `tool-surface.ts:245` | Tool | core fn | name+args switch → 12개 도구 실행 | ToolExecutionContext |
| `processChat()` | `tool-call-loop.ts:56` | Tool | core fn | OpenClaw↔Tool 반복 루프 (max 10회) | OpenClawClient, executeToolCall, TOOL_DEFINITIONS |
| `OpenClawClient` | `openclaw-client.ts:40` | Tool | port | OpenAI SDK 래퍼. chat() + chatStream() | ToolDefinition, ChatMessage |
| `TOOL_DEFINITIONS` | `ai-tool-schema.ts:19` | Tool | config | 12개 도구 스키마 배열 | ToolDefinition |
| `AnyToolResult` | `tool-surface.ts:167` | Tool | output | 12개 per-tool result union | 각 *Result 타입 |
| `ToolResultEntry` | `tool-call-loop.ts:17` | Tool | output | name으로 discriminated. 루프 결과 누적 | AnyToolResult 하위 |
| `ExecutionJournal` | `execution-journal.ts:55` | Intent | core | 인메모리 dedup index + 상태 추적 | JournalEntry, TrackMeta |
| `ToolStorePort` | `ports.ts:23` | Tool | port | store 10개 메서드 인터페이스 | leaf (guarded-wdk 타입) |
| `ApprovalBrokerPort` | `ports.ts:50` | Tool | port | broker.createRequest() 1개 메서드 | leaf |

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                            ┃
┃  B. 메시지 라우팅 (Message Routing)                                        ┃
┃  ──────────────────────────────────                                        ┃
┃  "앱에서 보낸 메시지를 어떻게 받아서, 순서를 보장하며 처리하고,              ┃
┃   결과를 실시간으로 돌려보내는가?"                                           ┃
┃  관여 도메인: Message, Relay                                                ┃
┃                                                                            ┃
┃  [App] ──WS──→ [Relay.core: RelayClient] ──onMessage──→ type 분기          ┃
┃                                                │                           ┃
┃                           ┌────────────────────┼──────────────┐            ┃
┃                           ▼                    ▼              ▼            ┃
┃                     type='chat'          type='control'     기타           ┃
┃                           │                    │                           ┃
┃                           ▼                    ▼                           ┃
┃                  handleChatMessage    handleControlMessage                 ┃
┃                           │              │                                 ┃
┃                           ▼              ├→ tx_approval                    ┃
┃                  Message.core:           ├→ policy_approval/reject         ┃
┃                  queueManager.enqueue    ├→ device_revoke                  ┃
┃                  (Message: enqueued)     ├→ wallet_create/delete           ┃
┃                           │              ├→ pairing_confirm                ┃
┃                           ▼              └→ cancel_queued/active           ┃
┃                  Message.core:                                             ┃
┃                  SessionQueue.drain                                        ┃
┃                  (Message: started)                                        ┃
┃                           │                                                ┃
┃                           ▼                                                ┃
┃                  _processChatDirect → [축A: Tool Loop]                     ┃
┃                           │                                                ┃
┃                           ▼                                                ┃
┃                  Relay.send('chat', done/stream/error)                     ┃
┃                  (Message: done)                                           ┃
┃                                                                            ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
```

| 컴포넌트 | 위치 | 도메인 | 타입역할 | 설명 | 의존 |
|----------|------|--------|----------|------|------|
| `RelayClient` | `relay-client.ts:46` | Relay | core | WS + JWT 인증 + 자동 재연결 + heartbeat + E2E NaCl | WebSocket, nacl |
| `handleChatMessage()` | `chat-handler.ts:24` | Message | core fn | chat 진입점. queue enqueue + `message_queued` 알림 | MessageQueueManager |
| `_processChatDirect()` | `chat-handler.ts:68` | Message | core fn | typing → processChat → relay로 stream/done/error | processChat, RelayClient |
| `handleControlMessage()` | `control-handler.ts:58` | Relay | core fn | 8가지 제어 메시지 디스패치. broker.submitApproval() | SignedApprovalBroker |
| `MessageQueueManager` | `message-queue.ts:120` | Message | core | `userId:sessionId` 복합키로 SessionQueue 관리 | SessionMessageQueue |
| `SessionMessageQueue` | `message-queue.ts:30` | Message | core | 세션별 FIFO. drain 순차처리, cancelQueued/cancelActive | QueuedMessage |
| `QueuedMessage` | `message-queue.ts:3` | Message | value | { messageId(UUID), source, userId, text, abortController } | leaf |
| `PairingSession` | `control-handler.ts:14` | Relay | value | { pairingToken, expectedSAS, ECDH 키쌍 }. MITM 방지 | leaf |

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                            ┃
┃  C. 자율 스케줄링 (Autonomous Scheduling)                                  ┃
┃  ─────────────────────────────────────────                                 ┃
┃  "등록된 크론 작업을 주기적으로 실행하고, 결과를 앱에 알리는가?"             ┃
┃  관여 도메인: Cron, Message, (Intent)                                       ┃
┃                                                                            ┃
┃  store.listCrons() ──→ 인메모리 Map<cronId, CronEntry>                     ┃
┃         │                     │                                            ┃
┃    Cron.core              tick() (매 60s)                                   ┃
┃   (CronScheduler)             │                                            ┃
┃                          elapsed >= intervalMs ?                            ┃
┃                                │ yes                                       ┃
┃                                ▼                                           ┃
┃                  Cron.port: dispatch(cronId, sessionId, userId, prompt)     ┃
┃                                │                                           ┃
┃                                ▼                                           ┃
┃                  relay.send('control', cron_session_created)                ┃
┃                                │                                           ┃
┃                                ▼                                           ┃
┃                  Message.core: queueManager.enqueue(source:'cron')          ┃
┃                  (Message: enqueued → [축B] → [축A])                        ┃
┃                                                                            ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
```

| 컴포넌트 | 위치 | 도메인 | 타입역할 | 설명 | 의존 |
|----------|------|--------|----------|------|------|
| `CronScheduler` | `cron-scheduler.ts:54` | Cron | core | 인메모리 Map + setInterval tick. start/stop/register/remove | CronEntry, CronDispatch |
| `CronEntry` | `cron-scheduler.ts:16` | Cron | value | CronBase + intervalMs(파싱) + lastRunAt | CronBase |
| `CronDispatch` | `cron-scheduler.ts:27` | Cron | port | 콜백. index.ts에서 queueManager.enqueue로 연결 | leaf |
| `CronSchedulerConfig` | `cron-scheduler.ts:41` | Cron | config | { tickIntervalMs } 기본 60초 | leaf |
| `AdminServer` | `admin-server.ts:57` | (운영) | core | Unix socket. status/journal_list/signer_list/cron_list/wallet_list | ExecutionJournal, CronScheduler, RelayClient |

---

## Section 6 — 시나리오

```
                      3개 축의 연결:

  [App 사용자] ──→ [B. 메시지 라우팅] ──→ [A. AI 도구 루프] ──→ [App으로 응답]
                                                    │
                                              Intent 기록
  [CronScheduler] ──→ [C. 자율 스케줄링] ──→ [B] ──→ [A] ──→ [App으로 알림]

  [App 소유자] ──→ [B. control 채널] ──→ broker.submitApproval ──→ WDK 이벤트
```

### 시나리오 1: Happy Path — "Send 1 ETH to 0x..."

```
사용자가 채팅 전송
  → [축B] RelayClient 수신 (type='chat')
    → handleChatMessage → queueManager.enqueue (Message: enqueued)
    → SessionQueue.drain 시작 (Message: started)
  → [축A] _processChatDirect → processChat
    → OpenClaw에 메시지 전송 (Tool.port: OpenClawClient.chatStream)
    → OpenClaw이 sendTransaction tool_call 반환
    → executeToolCall (Tool.core)
      → journal.track(intentHash) (Intent: →received)
      → wdk.getAccount().sendTransaction()
      → journal.updateStatus(settled) (Intent: received→settled)
      → 반환: { status: 'executed', hash, fee }
    → OpenClaw에 tool result 전송 → 최종 텍스트 응답
  → [축B] relay.send('chat', { type: 'done', content, toolResults })
    (Message: started→done)
```

### 시나리오 2: 정책 거부 → 정책 변경 요청 → 소유자 승인

```
사용자가 허용 범위 초과 tx 요청
  → [축B→축A] processChat → executeToolCall('sendTransaction')
    → wdk.sendTransaction() throws PolicyRejectionError
    → journal.updateStatus(rejected) (Intent: received→rejected)
    → store.saveRejection() 기록
    → 반환: { status: 'rejected', reason, intentHash }
  → [축A 2회차] OpenClaw이 거부 사유 인지 → policyRequest tool_call 결정
    → executeToolCall('policyRequest')
    → broker.createRequest('policy', { chainId, targetHash, ... })
    → 반환: { status: 'pending', policyHash }
  → [축B] relay로 done 전송 (앱에 "정책 변경 요청됨" 표시)

  (시간 경과: 소유자가 앱에서 승인)

  → [축B control] RelayClient 수신 (type='control', msg.type='policy_approval')
    → handleControlMessage
    → broker.submitApproval(signedApproval, context)
    → store.savePolicy() 적용
    → relay.send('control', { ok: true, type: 'policy_approval' })
```

### 시나리오 3: Cron 자율 실행

```
CronScheduler.tick() — 5분 간격 cron 감지
  → [축C] elapsed >= intervalMs → dispatch 콜백 호출
    → relay.send('control', { type: 'cron_session_created' })
    → queueManager.enqueue(source: 'cron') (Message: enqueued)
  → [축B] SessionQueue.drain (Message: started)
    → _processChatDirect(source='cron') — typing 생략
  → [축A] processChat → OpenClaw → tool_calls → executeToolCall
    → (Intent: received→settled)
  → [축B] relay.send('chat', { type: 'done', source: 'cron' })
    (Message: started→done)
```

---

**작성일**: 2026-03-21 23:50 KST
