# daemon 아키텍처 One-Pager

> 사용자 메시지가 들어오면 AI와 tool call을 반복하여 온체인 작업을 실행하고, app의 서명된 승인을 WDK facade로 중계하는 오케스트레이션 호스트

---

## 개요

daemon은 WDK-APP 모노레포의 오케스트레이션 계층으로, AI(OpenClaw) ↔ WDK(서명 엔진) ↔ Relay(앱 통신) 사이에서 메시지를 중계한다.
타입 의존성 그래프 기준 41 nodes, 50 edges, 17개 소스 파일로 구성.

v0.4.6에서 store 경계 분리 (WDK facade 경유 + DaemonStore 자체 소유), v0.4.7에서 dead export 정리, v0.4.8에서 WS 채널 재설계 (control 단방향화 + event_stream 승격 + query 채널 추가 + protocol 타입 강제).

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

**v0.4.6 변경 — store 접근 패턴:**

| 도구 | 접근 경로 | v0.4.6 이전 | v0.4.6 이후 |
|------|----------|------------|------------|
| sendTransaction, transfer, signTransaction | WDK | GuardedAccount 직접 | 동일 (변경 없음) |
| policyList, policyPending, policyRequest | WDK | store 직접 | **facade** (loadPolicy, getPendingApprovals, createApprovalRequest) |
| listRejections, listPolicyVersions | WDK | store 직접 | **facade** (listRejections, listPolicyVersions) |
| registerCron, listCrons, removeCron | daemon 자체 | store 직접 | **DaemonStore** 직접 |
| getBalance | WDK | GuardedAccount | 동일 |

**ToolExecutionContext (v0.4.6):**
```ts
{
  facade: WDKInstance & ToolFacadePort  // WDK facade 경유
  daemonStore: DaemonStore             // cron만 직접 접근
  logger: Logger
}
```

### 2. 메시지 (Message)

> "세션별 FIFO 큐로 사용자/cron 메시지를 순차 처리하는 구조"

Aggregate Root: `MessageQueueManager` — `message-queue.ts`
생애주기: queued → processing → done | cancelled | aborted

```
  handleChatMessage() ──→ [MessageQueueManager]
   (chat-handler.ts)              │
                                  ├──→ SessionMessageQueue (세션별 FIFO)
                                  │        └──→ QueuedMessage (value)
                                  │
                                  └──→ CancelResult (output)
```

### 3. 중계 (Relay)

> "Relay 서버와 WebSocket으로 연결하여 app ↔ daemon 메시지를 양방향 전달"

Aggregate Root: `RelayClient` — `relay-client.ts`
생애주기: disconnected → connected → sending/receiving → disconnected

### 4. 반복 (Cron)

> "등록된 프롬프트를 주기적으로 AI에게 전달하여 자동 실행"

Aggregate Root: `CronScheduler` — `cron-scheduler.ts`
생애주기: registered → tick 도래 → dispatched → (반복)

**v0.4.6 변경**: cron 데이터가 **DaemonStore**에 영속. WdkStore에서 완전 분리.

```
  DaemonStore ──→ [CronScheduler] ──→ CronDispatch(callback)
   (cron CRUD)         │                   │
                       ├──→ CronEntry      └──→ _processChatDirect()
                       └──→ tick()
```

**DaemonStore** (v0.4.6 신규):
- 인터페이스: `daemon-store.ts`
- 구현: `sqlite-daemon-store.ts` (SQLite, `~/.wdk/daemon-store/daemon.db`)
- 메서드: `listCrons()`, `saveCron()`, `removeCron()`, `updateCronLastRun()`, `init()`, `dispose()`
- **cron만 담당** — WDK 데이터는 facade 경유

### 5. (삭제됨) 저널 (Journal)

v0.4.6에서 **guarded-wdk로 이동**. daemon의 `execution-journal.ts` 삭제.
이유: journal은 tx 중복 방지 기능이고, middleware가 tx를 실행하므로 WDK가 소유하는 게 맞음.
daemon은 journal에 직접 접근하지 않음. WDK middleware가 내부에서 관리.

---

## 도메인 관계 맵

```
  ┌────────┐    enqueue     ┌─────────┐    tool_call    ┌────────┐
  │ Relay  │──────────────→│ Message │───────────────→│  Tool  │
  │  중계   │←── send ──────│  메시지  │                 │  도구   │
  └────────┘               └─────────┘                 └───┬────┘
       │                        ▲                          │
       │ control_message        │ dispatch          ┌──────┴──────┐
       │                   ┌────┴───┐               │             │
       └──→ WDK facade     │  Cron  │        WDK facade    DaemonStore
            (승인 처리)     │  반복   │        (tx/정책)     (cron CRUD)
                           └────┬───┘
                                │
                           DaemonStore
                           (cron 영속)
```

- **Relay → Message**: app 메시지 수신 → 큐에 enqueue
- **Message → Tool**: 큐에서 dequeue → AI tool-call 루프 → executeToolCall()
- **Tool → WDK facade**: tx 실행, 정책 조회, 승인 요청 (store 직접 접근 없음)
- **Tool → DaemonStore**: cron CRUD만 직접 접근
- **Cron → DaemonStore**: 영속 + tick 관리
- **Relay → WDK facade**: control_message → facade.submitApproval()

---

## 기능 축

```
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │ 1. AI 대화 루프   │  │ 2. 제어 채널      │  │ 3. 자동화 인프라  │
  │"메시지→AI→도구    │  │"서명된 승인을     │  │"cron 실행 +      │
  │ 반복→최종 답변"   │  │ facade로 위임"    │  │ admin 상태 노출"  │
  │[Tool+Message     │  │[Relay+WDK facade]│  │[Cron+DaemonStore]│
  │    +Relay]        │  │                  │  │                  │
  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
           │                     │                      │
           ▼                     ▼                      ▼
     최종 답변 + 결과       WDK 이벤트 emit        주기적 자동 실행
```

### 축 2. 제어 채널 — v0.4.8 변경

```
  app ──→ Relay ──→ ControlMessage 수신
                         │
                    handleControlMessage(msg, deps)
                         │
      ┌──────────────────┼──────────────────┐
      │ 승인 6종          │ 취소 2종          │
      ▼                  ▼                  │
  wire format 변환       cancelQueued()      │
      │                 cancelActive()      │
      ▼                  │                  │
  facade.submitApproval()│                  │
      → return null      ▼                  │
  (WDK 이벤트가          CancelEventPayload │
   event_stream으로       (CancelCompleted   │
   app에 전달)            | CancelFailed)    │
                              │             │
                              ▼             │
                         return payload     │
                         → index.ts가       │
                           event_stream으로  │
                           relay 전송        │
```

**v0.4.8 변경**:
- ControlResult **삭제**. cancel 결과도 CancelCompleted/CancelFailed 이벤트로 event_stream 경유.
- ControlEvent **삭제**. message_queued/message_started/cron_session_created가 events.ts로 이동, event_stream으로 전달.
- control 채널은 **app→daemon 단방향**으로 통일.

### 축 2-1. query 채널 — v0.4.8 신규

```
  app ──→ Relay ──→ query 수신 (WS 직접 전달, Redis 미경유)
                         │
                    handleQueryMessage(msg, deps)
                         │
      ┌──────────────────┼──────────────────┐
      │ policyList        │ signerList       │
      │ pendingApprovals  │ walletList       │
      ▼                  ▼                  │
  facade.loadPolicy()   facade.listSigners()│
  facade.getApprovals() facade.listWallets()│
      │                                     │
      └──→ QueryResult (ok|error) ──────────┘
              → relay 전송 (WS 직접 전달)
```

**Port 인터페이스 (v0.4.8):**

| Port | 소비자 | 메서드 |
|------|--------|--------|
| `ToolFacadePort` | tool-surface.ts | loadPolicy, getPendingApprovals, listRejections, listPolicyVersions, createApprovalRequest |
| `AdminFacadePort` | admin-server.ts | listSigners, listWallets |
| `ControlFacadePort` | control-handler.ts | submitApproval |
| `QueryFacadePort` | query-handler.ts | loadPolicy, getPendingApprovals, listSigners, listWallets |

각 handler는 자기에게 필요한 최소 인터페이스만 받음.

---

## 통신 채널 전체 맵

App ↔ Daemon은 직접 연결되지 않는다. Relay가 중간에서 WS로 양쪽과 연결하고, 영속 채널은 Redis Streams 단일 경로로 전달한다.

v0.4.8: 직접 forward 제거 (이중 전달 해소). query/query_result는 WS 직접 전달 (Redis 미경유).

```
영속 채널 (chat, control, event_stream):
App ──WS──→ Relay ──→ Redis XADD ──→ Poller XREAD ──→ Relay ──WS──→ Daemon
App ←──WS── Relay ←── Redis XADD ←── Poller XREAD ←── Relay ←──WS── Daemon

비영속 채널 (query, query_result):
App ──WS('query')──→ Relay ──직접 forward──→ Daemon
App ←──WS('query_result')── Relay ←──직접 forward── Daemon
```

#### 메시지 타입별 방향과 전달 경로

| 타입 | 방향 | 전달 경로 | Redis 스트림 키 | 용도 |
|------|------|----------|----------------|------|
| `chat` | 양방향 | Redis 단일 경로 | `chat:{userId}:{sessionId}` | AI 대화 (세션별 분리) |
| `control` | app → daemon 단방향 | Redis 단일 경로 | `control:{userId}` | 승인 6종 + 취소 2종 (요청만) |
| `event_stream` | daemon → app 단방향 | Redis 단일 경로 | `control:{userId}` | WDK 이벤트 14종 + cancel 결과 + MQ/MS/CSC 알림 |
| `query` | app → daemon 단방향 | WS 직접 전달 | (없음) | 데이터 조회 요청 (4종) |
| `query_result` | daemon → app 단방향 | WS 직접 전달 | (없음) | 조회 응답 (ok\|error) |

#### chat 하위 타입 상세

| chat 하위 타입 | 내용 | 주요 데이터 |
|---|---|---|
| `typing` | 처리 시작 표시 | userId, sessionId |
| `stream` | AI 응답 실시간 delta | delta(토큰), source(user/cron) |
| `tool_start` | tool 실행 시작 | toolName, toolCallId |
| `tool_done` | tool 실행 완료 | toolName, toolCallId, status |
| `done` | 최종 완료 | content, toolResults[], iterations |

#### event_stream 이벤트 (v0.4.8: AnyStreamEvent)

| 이벤트 | 트리거 | 분류 |
|--------|--------|------|
| IntentProposed, PolicyEvaluated, ExecutionBroadcasted, ExecutionSettled, ExecutionFailed, TransactionSigned | AI tool call | WDK 이벤트 |
| PendingPolicyRequested | AI tool call (policyRequest) | WDK 이벤트 |
| ApprovalVerified, ApprovalFailed, ApprovalRejected, PolicyApplied, SignerRevoked, WalletCreated, WalletDeleted | app control (승인) | WDK 이벤트 |
| CancelCompleted, CancelFailed | app control (취소) | Daemon 이벤트 (v0.4.8) |
| message_queued, message_started, cron_session_created | daemon 내부 | Daemon 알림 (v0.4.8, control.ts에서 이동) |

#### control 메시지 8종 (app→daemon 단방향)

| 타입 | 결과 수신 |
|------|----------|
| tx/policy/device/wallet 승인 6종 | event_stream (WDK 이벤트) |
| cancel_queued, cancel_active | event_stream (CancelCompleted/CancelFailed) |

#### query 4종 (v0.4.8 신규)

| query 타입 | 반환 데이터 | facade 메서드 |
|-----------|-----------|--------------|
| policyList | StoredPolicy[] | loadPolicy() |
| pendingApprovals | PendingApprovalRequest[] | getPendingApprovals() |
| signerList | StoredSigner[] | listSigners() |
| walletList | StoredWallet[] | listWallets() |

#### v0.4.8에서 해결된 이슈

1. ~~**채널 방향 비일관성**~~: **해결** — cancel도 event_stream으로 전환. control은 app→daemon 단방향 통일.
2. ~~**메시지 중복 수신**~~: **해결** — relay 직접 forward 제거. Redis 단일 경로로 통일.
3. ~~**데이터 조회 경로 부재**~~: **해결** — query/query_result 채널 추가 (4종).

---

## 시나리오

**시나리오 1: 사용자가 tx 실행 요청 (happy path)**

app이 채팅 메시지 전송
  → [AI 대화 루프] Relay 수신 → MessageQueue enqueue → dequeue
  → OpenClaw에 메시지 전달 → AI가 `sendTransaction` tool_call 반환
  → [Tool] GuardedAccount.sendTransaction() → WDK 내부에서 journal dedup + 정책 ALLOW → tx broadcast
  → OpenClaw에 tool result 전달 → AI가 최종 답변 생성
  → Relay로 "done" + tool results 전송

**시나리오 2: AI가 새 정책을 요청하고 사용자가 승인**

AI가 `policyRequest` tool_call → facade.createApprovalRequest('policy')
  → PendingPolicyRequested 이벤트 → Relay로 app에 전달
  → app이 정책 내용 확인 → 사용자가 Ed25519로 서명
  → [제어 채널] policy_approval ControlMessage 수신
  → handleControlMessage() → wire format 변환 → facade.submitApproval()
  → WDK 6-step 검증 → savePolicy() + removePending() + appendHistory()
  → emit ApprovalVerified → PolicyApplied → Relay로 app에 전달

**시나리오 3: cron이 자동으로 포지션 체크**

CronScheduler.tick() (DaemonStore에서 cron 로드)
  → "check my AAVE positions" cron이 due
  → CronDispatch callback → _processChatDirect()
  → [AI 대화 루프] OpenClaw에 프롬프트 전달 → AI가 getBalance tool_call
  → GuardedAccount로 잔액 조회 → AI가 분석 결과 생성
  → Relay로 결과 전송 (source: 'cron')

---

## 설계 분석 메모

### v0.4.6 Store 경계 분리 결과 (해결됨)

이전에 daemon이 `getApprovalStore()`로 store를 직접 CRUD하던 23건이 전부 해소:

| 항목 | Before | After |
|------|--------|-------|
| store 접근 | `getApprovalStore()` 직접 | facade 메서드 경유 |
| broker 접근 | `getApprovalBroker()` 직접 | `facade.submitApproval()` |
| cron 영속 | WdkStore (WDK가 cron을 앎) | DaemonStore (WDK는 cron을 모름) |
| journal | daemon 소유 | WDK 내부 (daemon은 직접 접근하지 않음) |
| rejection 기록 | daemon이 직접 saveRejection() | WDK middleware가 자동 기록 |

### Port 패턴

각 handler가 필요한 최소 인터페이스만 받는 구조 (`ports.ts`):
- `ToolFacadePort` — tool-surface.ts 전용
- `AdminFacadePort` — admin-server.ts 전용
- `ControlFacadePort` — control-handler.ts 전용

facade 전체를 넘기지 않고 port로 좁힘 → 의존 범위 명확.

---

**작성일**: 2026-03-22 KST
**갱신일**: 2026-03-22 KST — v0.4.6 store 경계 분리 + v0.4.7 dead export 정리 반영
**갱신일**: 2026-03-22 KST — v0.4.8 WS 채널 재설계 반영. control 단방향화, ControlResult/ControlEvent 삭제, event_stream top-level 승격, query 채널 4종 추가, QueryFacadePort 추가, 직접 forward 제거(Redis 단일 경로), 통신 채널 맵 전면 갱신, 알려진 문제 3건 "해결됨"
