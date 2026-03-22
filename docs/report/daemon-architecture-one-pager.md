# daemon 아키텍처 One-Pager

> 사용자 메시지가 들어오면 AI와 tool call을 반복하여 온체인 작업을 실행하고, app의 서명된 승인을 WDK로 중계하는 오케스트레이션 호스트

---

## 개요

daemon은 WDK-APP 모노레포의 오케스트레이션 계층으로, AI(OpenClaw) ↔ WDK(서명 엔진) ↔ Relay(앱 통신) 사이에서 메시지를 중계한다.
타입 의존성 그래프 기준 71 nodes, 106 edges, 16개 소스 파일로 구성.

---

## 도메인 Aggregate

### 1. 도구 (Tool)

> "AI에게 노출되는 12개 function calling 도구와 그 실행 결과"

Aggregate Root: `executeToolCall()` — `tool-surface.ts`
생애주기: tool_call 수신 → args 파싱 → 실행 → result 반환

```
  ToolDefinition[] ──→ AI(OpenClaw) ──→ tool_call
   (schema)               │
                           ▼
                    executeToolCall(name, args, ctx)
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    sendTransaction    policyList      registerCron
    transfer           policyPending   listCrons
    getBalance         policyRequest   removeCron
    signTransaction    listRejections
                       listPolicyVersions

  AnyToolResult = SendTransactionResult | TransferResult | ... | ToolErrorResult
```

| 타입 | 역할 | 설명 |
|------|------|------|
| `ToolDefinition` | schema | OpenAI function calling 스키마 — name, description, parameters |
| `TOOL_DEFINITIONS` | config | 12개 도구 정의 배열 |
| `ToolExecutionContext` | config | 실행 맥락 — wdk, store, broker, journal, logger, chainId |
| `AnyToolResult` | output | 12개 도구별 결과 DU + ToolErrorResult |
| `executeToolCall()` | function | name으로 분기하여 도구 실행, 에러 시 ToolErrorResult 반환 |

**도구 분류:**

| 구분 | 도구 | WDK 경유 | Store 직접 접근 |
|------|------|----------|----------------|
| tx 실행 | sendTransaction, transfer, signTransaction | O (GuardedAccount) | O (journal, rejection) |
| 잔액 조회 | getBalance | O (GuardedAccount) | X |
| 정책 | policyList, policyPending, policyRequest | O (broker) | O (loadPolicy, loadPending) |
| cron | registerCron, listCrons, removeCron | X | O (saveCron, listCrons, removeCron) |
| 이력 | listRejections, listPolicyVersions | X | O (listRejections, listPolicyVersions) |

### 2. 메시지 (Message)

> "세션별 FIFO 큐로 사용자/cron 메시지를 순차 처리하는 구조"

Aggregate Root: `MessageQueueManager` — `message-queue.ts`
생애주기: queued → processing → done | cancelled | aborted

```
  handleChatMessage() ──→ [MessageQueueManager]
   (chat-handler.ts)              │
                                  ├──→ SessionMessageQueue (세션별 FIFO)
                                  │        │
                                  │        └──→ QueuedMessage (value)
                                  │               ├─ messageId, sessionId, userId
                                  │               ├─ text, chainId, source
                                  │               └─ abortController
                                  │
                                  └──→ CancelResult (output)
                                       = { ok: true, wasProcessing } | { ok: false, reason }
```

| 타입 | 역할 | 설명 |
|------|------|------|
| `MessageQueueManager` | core | 복수 세션 큐 관리 — `${userId}:${sessionId}` 키 |
| `SessionMessageQueue` | value | 단일 세션 FIFO — enqueue, dequeue, cancel |
| `QueuedMessage` | value | 큐 항목 — messageId, text, abortController 포함 |
| `CancelResult` | output | 취소 결과 DU — 대기 중 제거 vs 처리 중 abort vs 실패 |
| `ProcessResult` | output | 처리 결과 — ok + error |
| `MessageProcessor` | port | `(msg, signal) => Promise<ProcessResult>` 콜백 |

### 3. 중계 (Relay)

> "Relay 서버와 WebSocket으로 연결하여 app ↔ daemon 메시지를 양방향 전달"

Aggregate Root: `RelayClient` — `relay-client.ts`
생애주기: disconnected → connected → sending/receiving → disconnected

```
  RelayClient (extends EventEmitter)
      │
      ├──→ connect(url, token) — WebSocket 연결 + JWT 인증
      ├──→ send(type, payload, userId) — 메시지 전송 (optional E2E 암호화)
      ├──→ onMessage(handler) — 수신 핸들러 등록
      ├──→ setSessionKey(key) — NaCl secretbox E2E 암호화 설정
      └──→ disconnect() — 정상 종료

  EncryptedPayload (value) = { nonce, ciphertext }
```

| 타입 | 역할 | 설명 |
|------|------|------|
| `RelayClient` | core | WebSocket 클라이언트 — 재연결, 하트비트, E2E 암호화 |
| `RelayClientOptions` | config | reconnectBaseMs, reconnectMaxMs, heartbeatIntervalMs |
| `EncryptedPayload` | value | NaCl secretbox 암호문 — nonce + ciphertext |
| `MessageHandler` | port | `(type, payload, raw) => void` 수신 콜백 |
| `authenticateWithRelay()` | function | DAEMON_ID/SECRET → JWT 발급 (자동 등록 포함) |

### 4. 반복 (Cron)

> "등록된 프롬프트를 주기적으로 AI에게 전달하여 자동 실행"

Aggregate Root: `CronScheduler` — `cron-scheduler.ts`
생애주기: registered → tick 도래 → dispatched → (반복)

```
  CronInput ──→ [CronScheduler] ──→ CronDispatch(callback)
   (from store)       │                   │
                      ├──→ CronEntry      └──→ _processChatDirect()
                      │     = CronBase         (chat-handler.ts)
                      │     + intervalMs
                      │     + lastRunAt
                      │
                      └──→ tick(): due 체크 → dispatch
```

| 타입 | 역할 | 설명 |
|------|------|------|
| `CronScheduler` | core | 메모리 캐시 + 주기적 tick — start, stop, register, remove |
| `CronBase` | value | id, sessionId, interval, prompt, chainId, accountIndex |
| `CronEntry` | value | CronBase + intervalMs(파싱됨) + lastRunAt |
| `CronDispatch` | port | `(cronId, sessionId, userId, prompt, chainId) => Promise<void>` |
| `CronSchedulerConfig` | config | tickIntervalMs (기본 60000) |

### 5. 저널 (Journal)

> "tx 실행 의도를 추적하고 중복 실행을 방지하는 인메모리 인덱스"

Aggregate Root: `ExecutionJournal` — `execution-journal.ts`
생애주기: received → settled | signed | failed | rejected

```
  TrackMeta ──→ [ExecutionJournal] ──→ JournalEntry
   (input)           │                    │
                     ├──→ _hashIndex      ├─ intentHash
                     │    (Map)           ├─ targetHash
                     │                    ├─ status
                     └──→ isDuplicate()   └─ txHash
                          (중복 체크)
```

| 타입 | 역할 | 설명 |
|------|------|------|
| `ExecutionJournal` | core | 인메모리 인덱스 + store 위임 — track, updateStatus, isDuplicate |
| `JournalEntry` | value | intentHash, targetHash, status, accountIndex, chainId, txHash |
| `TrackMeta` | input | accountIndex, chainId, targetHash |
| `JournalListOptions` | input | status, chainId, limit, accountIndex 필터 |

---

## 도메인 관계 맵

```
  ┌────────┐    enqueue     ┌─────────┐    tool_call    ┌────────┐
  │ Relay  │──────────────→│ Message │───────────────→│  Tool  │
  │  중계   │←── send ──────│  메시지  │                 │  도구   │
  └────────┘               └─────────┘                 └───┬────┘
       │                        ▲                          │
       │ control_message        │ dispatch                 │ track/dedup
       │                   ┌────┴───┐                 ┌────▼────┐
       └──→ WDK broker     │  Cron  │                 │ Journal │
            (guarded-wdk)  │  반복   │                 │  저널    │
                           └────────┘                 └─────────┘
```

- **Relay → Message**: app 메시지 수신 → 큐에 enqueue
- **Message → Tool**: 큐에서 dequeue → AI tool-call 루프 → executeToolCall()
- **Message ← Relay**: tool 결과/스트림 → relay로 app에 전송
- **Relay → WDK**: control_message(승인) → handleControlMessage() → broker.submitApproval()
- **Cron → Message**: tick 도래 → _processChatDirect()로 직접 처리 (큐 경유)
- **Tool → Journal**: tx 실행 전 isDuplicate() 체크, 실행 후 track() + updateStatus()

---

## 기능 축

```
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │ 1. AI 대화 루프   │  │ 2. 제어 채널      │  │ 3. 자동화 인프라  │
  │"메시지→AI→도구    │  │"서명된 승인을     │  │"cron 실행 +      │
  │ 반복→최종 답변"   │  │ 검증하고 처리"    │  │ 저널 추적"        │
  │[Tool+Message     │  │[Relay+Message]   │  │[Cron+Journal]    │
  │    +Relay]        │  │                  │  │                  │
  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
           │                     │                      │
           ▼                     ▼                      ▼
     최종 답변 + 결과       WDK 이벤트 emit        주기적 자동 실행
```

---

### 축 1. AI 대화 루프 (Chat Loop)

> "사용자 메시지가 들어오면 AI와 tool call을 반복하여 최종 답변을 만드는가?"

```
  app 메시지 ──→ Relay 수신 ──→ MessageQueue enqueue
      │
      ▼
  _processChatDirect()
      │
      ├─ "typing" 표시 전송 (relay)
      │
      ▼
  processChat() ── AI tool-call 루프 (최대 10회) ──
      │
      ├─ OpenClaw.chat(messages, TOOL_DEFINITIONS)
      │     │
      │     ├─ tool_calls 있음 → executeToolCall() 각각 실행
      │     │     ├─ onToolStart / onToolDone 콜백
      │     │     └─ 결과를 follow-up message로 수집
      │     │
      │     └─ tool_calls 없음 → 최종 답변 (break)
      │
      ├─ 첫 응답만 streaming (onDelta → relay "stream" 전송)
      │
      ▼
  최종 답변 + toolResults → relay "done" 전송
```

| 컴포넌트 | 위치 | 도메인 | 역할 | 설명 |
|----------|------|--------|------|------|
| `handleChatMessage()` | `chat-handler.ts:33` | Message | function | 메시지 enqueue + "message_queued" 알림 |
| `_processChatDirect()` | `chat-handler.ts:58` | Message+Tool | function | 큐에서 꺼낸 메시지 처리 — typing → loop → done |
| `processChat()` | `tool-call-loop.ts:56` | Tool | function | AI ↔ tool-call 반복 루프 (max 10 iterations) |
| `executeToolCall()` | `tool-surface.ts` | Tool | function | 12개 도구 분기 실행 |
| `createOpenClawClient()` | `openclaw-client.ts` | Tool | function | OpenAI SDK 래퍼 — session keying + streaming |

### 축 2. 제어 채널 (Control Channel)

> "app의 서명된 승인/취소 메시지를 어떻게 처리하는가?"

```
  app ──→ Relay ──→ ControlMessage 수신
                         │
                    handleControlMessage(msg, deps)
                         │
      ┌──────────────────┼──────────────────┐
      │ 승인 6종          │ 취소 2종          │
      ▼                  ▼                  │
  wire format 변환       cancelQueued()      │
  (signature→sig,       cancelActive()      │
   approverPubKey→      → CancelResult      │
   approver)                                │
      │                                     │
      ▼                                     │
  broker.submitApproval()                   │
      → return null                         │
  (WDK 이벤트가 app에 전달)                  │
                                            ▼
                                     return ControlResult
                                  (cancel만 직접 응답)
```

| 컴포넌트 | 위치 | 도메인 | 역할 | 설명 |
|----------|------|--------|------|------|
| `handleControlMessage()` | `control-handler.ts:42` | Relay | function | 8종 control message 분기 처리 |
| `ControlHandlerDeps` | `control-handler.ts:39` | Relay | config | broker + logger + queueManager 의존성 |

**승인 타입별 처리:**

| 타입 | wire → wdk 변환 | broker 호출 | 응답 |
|------|-----------------|-------------|------|
| tx_approval | signature→sig, approverPubKey→approver | submitApproval({ kind: 'tx' }) | null (WDK 이벤트) |
| policy_approval | 동일 + policies 전달 | submitApproval({ kind: 'policy_approval' }) | null |
| policy_reject | 동일 | submitApproval({ kind: 'policy_reject' }) | null |
| device_revoke | 동일 + SHA-256(pubkey) 계산 | submitApproval({ kind: 'device_revoke' }) | null |
| wallet_create | 동일 | submitApproval({ kind: 'wallet_create' }) | null |
| wallet_delete | 동일 | submitApproval({ kind: 'wallet_delete' }) | null |
| cancel_queued | — | queueManager.cancelQueued() | ControlResult |
| cancel_active | — | queueManager.cancelActive() | ControlResult |

### 축 3. 자동화 인프라 (Automation Infrastructure)

> "cron으로 자동 실행하고, journal로 중복을 방지하며, admin으로 상태를 노출하는가?"

```
  CronScheduler.tick()
      │
      ├─ due 체크 (now - lastRunAt >= intervalMs)
      │
      ▼
  CronDispatch callback
      │
      └──→ _processChatDirect(cron.prompt)
           (source: 'cron', cronId 포함)

  ExecutionJournal
      │
      ├─ track(intentHash, meta) → status: 'received'
      ├─ isDuplicate(targetHash) → 인메모리 인덱스 체크
      └─ updateStatus(hash, 'settled', txHash) → 인덱스 제거

  AdminServer (Unix socket ~/.wdk/daemon.sock)
      │
      ├─ status → uptime, relay 연결, journal active, cron count
      ├─ journal_list → 저널 필터 조회
      ├─ signer_list → 서명자 목록 (store 직접)
      ├─ cron_list → cron 목록
      └─ wallet_list → 월렛 목록 (store 직접)
```

| 컴포넌트 | 위치 | 도메인 | 역할 | 설명 |
|----------|------|--------|------|------|
| `CronScheduler` | `cron-scheduler.ts` | Cron | core | 메모리 캐시 + tick 타이머 — register, remove, tick |
| `ExecutionJournal` | `execution-journal.ts` | Journal | core | 인메모리 인덱스 + store 위임 — track, isDuplicate, recover |
| `AdminServer` | `admin-server.ts` | Infra | core | Unix socket JSON-line 프로토콜 — 5개 명령 |

---

## 시나리오

```
  app 메시지 → [AI 대화 루프] → tool 실행 → 결과
                                    │
  app 승인 → [제어 채널] → WDK 이벤트  │
                                    ▼
  cron tick → [자동화 인프라] → AI 대화 루프 (재진입)
                                    │
                               Journal 추적
```

**시나리오 1: 사용자가 "ETH를 USDT로 swap해줘" 요청 (happy path)**

app이 채팅 메시지 전송
  → [AI 대화 루프] Relay 수신 → MessageQueue enqueue → dequeue
  → OpenClaw에 메시지 전달 → AI가 `sendTransaction` tool_call 반환
  → [Journal] isDuplicate() 체크 → 신규 (Journal: → received)
  → [Tool] GuardedAccount.sendTransaction() → 정책 ALLOW → tx broadcast
  → [Journal] updateStatus('settled', txHash) (Journal: received → settled)
  → OpenClaw에 tool result 전달 → AI가 최종 답변 생성
  → Relay로 "done" + tool results 전송

**시나리오 2: AI가 새 정책을 요청하고 사용자가 승인**

AI가 `policyRequest` tool_call → broker.createRequest('policy')
  → [AI 대화 루프] PendingPolicyRequested 이벤트 → Relay로 app에 전달
  → app이 정책 내용 확인 → 사용자가 Ed25519로 서명
  → [제어 채널] policy_approval ControlMessage 수신
  → handleControlMessage() → wire format 변환 → broker.submitApproval()
  → WDK 6-step 검증 통과 → savePolicy() + removePending() + appendHistory()
  → emit ApprovalVerified → PolicyApplied → Relay로 app에 전달

**시나리오 3: cron이 자동으로 포지션 체크**

CronScheduler.tick() → "check my AAVE positions" cron이 due
  → [자동화 인프라] CronDispatch callback → _processChatDirect()
  → [AI 대화 루프] OpenClaw에 프롬프트 전달 → AI가 getBalance tool_call
  → GuardedAccount로 잔액 조회 → AI가 분석 결과 생성
  → Relay로 결과 전송 (source: 'cron')

---

## 설계 분석 메모

### Store 경계 위반 현황

daemon이 `wdk.getApprovalStore()`로 store 참조를 획득하여 직접 CRUD하는 현황:

| 파일 | 직접 호출 메서드 | 건수 |
|------|-----------------|------|
| `tool-surface.ts` | saveRejection, loadPolicy, loadPendingApprovals, saveCron, listCrons, removeCron, listRejections, listPolicyVersions, getPolicyVersion | 12 |
| `execution-journal.ts` | saveJournalEntry, updateJournalStatus, listJournal | 4 |
| `cron-scheduler.ts` | listCrons, removeCron, updateCronLastRun | 3 |
| `admin-server.ts` | listSigners, listWallets | 2 |
| `wdk-host.ts` | getMasterSeed, listSigners | 2 |

`ports.ts`에 `ToolStorePort`, `ApprovalBrokerPort`, `AdminStorePort` 인터페이스가 정의되어 있어 **의도는 경계 분리**이나, 실제로는 store를 직접 참조하는 상태.

→ 개선 방향: `docs/handover/store-separation.md` 참조 (WdkStore / DaemonStore 물리적 분리)

### Cron은 daemon의 관심사

`CronInput`, `StoredCron` 타입이 guarded-wdk의 `ApprovalStore`에 정의되어 있지만, cron은 순수하게 daemon의 스케줄링 도메인. WDK는 cron에 대해 몰라야 한다.

→ store 분리 시 cron 관련 타입/메서드를 guarded-wdk에서 철저히 제거, daemon 자체 store로 이동

### WDK 이벤트 릴레이 (v0.4.2)

index.ts에서 14개 WDK 이벤트를 구독하여 Relay로 전달:
```
IntentProposed, PolicyEvaluated, ExecutionBroadcasted, ExecutionSettled,
ExecutionFailed, TransactionSigned, PendingPolicyRequested, ApprovalVerified,
ApprovalRejected, PolicyApplied, SignerRevoked, WalletCreated, WalletDeleted,
ApprovalFailed
```

승인 6종의 ControlResult 포워딩은 v0.4.2에서 제거됨. cancel만 ControlResult 반환.

### 통신 채널 전체 맵

App ↔ Daemon은 직접 연결되지 않는다. Relay가 중간에서 WS로 양쪽과 연결하고, Redis Streams로 메시지를 영속한다.

```
App ──WS──→ Relay ──→ Redis XADD ──→ Poller XREAD ──→ Relay ──WS──→ Daemon
App ←──WS── Relay ←── Redis XADD ←── Poller XREAD ←── Relay ←──WS── Daemon
```

App/Daemon은 Redis의 존재를 모른다. WS가 유일한 전송 수단이고, Redis는 Relay 내부의 영속 + 전달 인프라.

#### 메시지 타입별 방향과 Redis 스트림 키

| 타입 | 방향 | Redis 스트림 키 | 용도 |
|------|------|----------------|------|
| `chat` | 양방향 | `chat:{userId}:{sessionId}` | AI 대화 (세션별 분리) |
| `control` | app → daemon | `control:{userId}` | 서명된 승인 6종 + 취소 2종 (요청) |
| `event_stream` | daemon → app | `control:{userId}` | WDK 이벤트 14종 (결과) |

`control`과 `event_stream`은 같은 Redis 스트림을 공유한다 — 둘 다 세션에 종속되지 않는 사용자 레벨 메시지이기 때문.

#### chat 하위 타입 상세

AI 대화는 `chat` 타입 안에서 하위 타입으로 세분화된다:

```
사용자 메시지 수신
    │
    ▼
typing ──→ "처리 시작" 표시
    │
    ▼ (AI tool-call 루프, 최대 10회)
    │
    ├─ stream ──→ AI 응답 delta (토큰 단위 실시간 스트리밍)
    ├─ tool_start ──→ tool 실행 시작 (toolName, toolCallId)
    ├─ tool_done ──→ tool 실행 완료 (status: success/error)
    │   (루프 반복...)
    │
    ▼
done ──→ 최종 답변 + 전체 toolResults + iterations
```

| chat 하위 타입 | 내용 | 주요 데이터 |
|---|---|---|
| `typing` | 처리 시작 표시 | userId, sessionId |
| `stream` | AI 응답 실시간 delta | delta(토큰), source(user/cron) |
| `tool_start` | tool 실행 시작 | toolName, toolCallId |
| `tool_done` | tool 실행 완료 | toolName, toolCallId, status |
| `done` | 최종 완료 | content, toolResults[], iterations |

#### event_stream 이벤트 14종

전부 daemon → app 단방향. WDK 내부에서 emit → daemon 리스너가 수신 → relay로 전송.

| 이벤트 | 발생 시점 | 트리거 |
|--------|----------|--------|
| **tx 실행 흐름** | | |
| `IntentProposed` | AI가 tx 실행 요청 | AI tool call (sendTransaction) |
| `PolicyEvaluated` | 정책 평가 완료 | AI tool call |
| `ExecutionBroadcasted` | tx 브로드캐스트 성공 | AI tool call |
| `ExecutionSettled` | tx 온체인 확인 | pollReceipt |
| `ExecutionFailed` | tx 실행 실패 | AI tool call |
| `TransactionSigned` | tx 서명 완료 (브로드캐스트 없이) | AI tool call (signTransaction) |
| **승인 처리 흐름** | | |
| `PendingPolicyRequested` | 정책 승인 요청 생성 | AI tool call (policyRequest) |
| `ApprovalVerified` | 서명 검증 통과 | app control (승인) |
| `ApprovalFailed` | 승인 처리 실패 | app control (승인) |
| `ApprovalRejected` | 정책 거부 처리 완료 | app control (policy_reject) |
| **도메인 작업 결과** | | |
| `PolicyApplied` | 정책 반영 완료 | app control (policy_approval) |
| `SignerRevoked` | 서명자 해지 완료 | app control (device_revoke) |
| `WalletCreated` | 지갑 생성 완료 | app control (wallet_create) |
| `WalletDeleted` | 지갑 삭제 완료 | app control (wallet_delete) |

#### control 메시지 8종

전부 app → daemon 방향. 현재 cancel만 ControlResult로 직접 응답하지만, 단방향 통일 예정.

| 타입 | 내용 | 결과 수신 |
|------|------|----------|
| `tx_approval` | tx 승인 서명 제출 | event_stream (ApprovalVerified/Failed) |
| `policy_approval` | 정책 승인 서명 제출 | event_stream (PolicyApplied/Failed) |
| `policy_reject` | 정책 거부 서명 제출 | event_stream (ApprovalRejected/Failed) |
| `device_revoke` | 서명자 해지 서명 제출 | event_stream (SignerRevoked/Failed) |
| `wallet_create` | 지갑 생성 승인 제출 | event_stream (WalletCreated/Failed) |
| `wallet_delete` | 지갑 삭제 승인 제출 | event_stream (WalletDeleted/Failed) |
| `cancel_queued` | 대기 중 메시지 취소 | control 직접 응답 (→ event_stream 전환 예정) |
| `cancel_active` | 처리 중 메시지 중단 | control 직접 응답 (→ event_stream 전환 예정) |

#### App에서의 이벤트 소비 패턴

```
event_stream 수신 (항상 구독, 백그라운드 트래킹)
    │
    ├─ 전부 → useActivityStore에 기록 (이력 영속)
    │
    ├─ CancelCompleted, ApprovalFailed → 알림 (toast)
    ├─ PolicyApplied, SignerRevoked → 알림 + 설정 화면 갱신
    │
    └─ IntentProposed, ExecutionBroadcasted 등
         → 세션 화면 보고 있으면 표시, 아니면 store 기록만
```

#### 현재 알려진 문제

1. **채널 방향 비일관성**: cancel만 control로 직접 응답, 나머지는 event_stream → 단방향 통일 예정 (`docs/handover/control-channel-unidirection.md`)
2. **메시지 중복 수신**: relay가 직접 forward + Redis polling 이중 경로 → Redis 단일 경로로 통일 예정 (같은 handover)

---

**작성일**: 2026-03-22 KST
**갱신일**: 2026-03-22 KST — 통신 채널 전체 맵 추가 (메시지 타입, chat 하위 타입, event_stream 14종, control 8종, 이벤트 소비 패턴, 알려진 문제)
