# Daemon 패키지 아키텍처 One-Pager

> AI 에이전트와 WDK 서명 엔진 사이에서, 앱의 채팅/제어 메시지를 받아 도구를 실행하고, 정책이 허용한 범위 안에서만 서명하여 결과를 돌려보내는 orchestration host.

---

## 한줄 정의

```
┌─────────────────────────────────────────────────────────────────────┐
│                        daemon 전체 구조                              │
│                                                                     │
│  "앱에서 채팅/제어 메시지가 들어오면, AI에게 도구를 쥐어주고          │
│   실행 결과를 돌려보내되, 정책이 허용한 범위 안에서만 서명한다"       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4개의 큰 축

```
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │  AI 대화 루프  │  │  도구 실행    │  │  제어 채널    │  │  인프라       │
  │ "AI와 대화를  │  │ "체인과 정책  │  │ "앱의 서명된  │  │ "예약 실행,  │
  │  주고받는다"  │  │  을 조작한다" │  │  명령을 처리" │  │  큐, 모니터" │
  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
         │                 │                 │                 │
         ▼                 ▼                 ▼                 ▼
   openclaw-client    tool-surface      control-handler    cron-scheduler
   tool-call-loop     ports.ts          (relay-client)     message-queue
   chat-handler                                            admin-server
```

---

## 축 1. AI 대화 루프 (Chat Loop)

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                     ┃
┃  "사용자 메시지가 들어오면 AI에게 보내고, AI가 도구를 호출하면        ┃
┃   실행하고, 결과를 다시 AI에게 보내는 루프를 몇 번이든 반복한다"     ┃
┃                                                                     ┃
┃  사용자 메시지 ──→ OpenClaw chat ──→ tool_calls 응답?                ┃
┃       │                                    │                        ┃
┃       │              yes ←─────────────────┘                        ┃
┃       │               │                                             ┃
┃       │          executeToolCall() × N개                            ┃
┃       │               │                                             ┃
┃       │          tool results를 AI에게 재전송                        ┃
┃       │               │                                             ┃
┃       │              반복 (max 10회)                                 ┃
┃       │               │                                             ┃
┃       │              no ←──── 최종 텍스트 응답                       ┃
┃       │               │                                             ┃
┃       ▼               ▼                                             ┃
┃  ProcessChatResult { content, toolResults[], iterations }           ┃
┃       │                                                             ┃
┃       └──→ relay chat.done 으로 앱에 전달                            ┃
┃                                                                     ┃
┃  핵심 타입:                                                         ┃
┃    ChatMessage = { role, content, tool_calls?, tool_call_id? }      ┃
┃    ToolCall = { id, function: { name, arguments } }                 ┃
┃    ToolResultEntry = name별 13-variant discriminated union           ┃
┃    OpenClawClient = { chat(), chatStream() }                        ┃
┃                                                                     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

| 컴포넌트 | 위치 | 역할 | depth |
|----------|------|------|-------|
| `ToolCall` | openclaw-client.ts | AI가 호출하고 싶은 도구 1건 (id + function name + JSON args) | 0 |
| `ChatMessage` | openclaw-client.ts | 대화 한 턴 (system/user/assistant/tool 역할) | 1 |
| `ChatChoice` | openclaw-client.ts | AI 응답 1건 (message + finish_reason) | 1 |
| `ChatResponse` | openclaw-client.ts | AI 응답 전체 (choices[]) | 2 |
| `OpenClawClient` | openclaw-client.ts | OpenAI SDK 래핑. chat()과 chatStream() 제공 | 3 |
| `ToolResultEntry` | tool-call-loop.ts | 도구 실행 결과 1건. `name` literal로 12개 도구 + unknown fallback 구분 | 2 |
| `ProcessChatResult` | tool-call-loop.ts | 루프 최종 결과: AI 텍스트 + 실행된 도구 결과들 + 반복 횟수 | 3 |
| `processChat()` | tool-call-loop.ts | AI↔도구 루프 본체. max iterations까지 반복 | — |
| `handleChatMessage()` | chat-handler.ts | relay에서 온 chat 메시지를 큐에 넣거나 직접 처리 | — |

---

## 축 2. 도구 실행 (Tool Execution)

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                     ┃
┃  "AI가 호출한 도구를 WDK 서명 엔진 위에서 실행한다.                  ┃
┃   정책이 거부하면 거부 이력을 남기고, 허용하면 체인에 전송한다"      ┃
┃                                                                     ┃
┃  (name, args) ──→ switch(name) ──→ wdk.getAccount()                 ┃
┃                       │              .sendTransaction()             ┃
┃                       │              .signTransaction()             ┃
┃                       │              .getBalance()                  ┃
┃                       │                                             ┃
┃                       ├── 정책 도구: store.loadPolicy()              ┃
┃                       │              store.loadPendingApprovals()    ┃
┃                       │              broker.createRequest()         ┃
┃                       │                                             ┃
┃                       └── 운영 도구: store.saveCron/listCrons/...    ┃
┃                                                                     ┃
┃  결과 = 12개 per-tool result union (AnyToolResult)                  ┃
┃    ├─ 성공: SendTransactionExecuted { status:'executed', hash, fee } ┃
┃    ├─ 거부: IntentRejectedResult { status:'rejected', reason }      ┃
┃    ├─ 에러: ToolErrorResult { status:'error', error }               ┃
┃    └─ 중복: SendTransactionDuplicate { status:'duplicate' }         ┃
┃                                                                     ┃
┃  ToolExecutionContext = { wdk, broker, store, logger, journal }     ┃
┃    └─ broker: ApprovalBrokerPort (createRequest 1개)                ┃
┃    └─ store: ToolStorePort (9개 메서드)                              ┃
┃                                                                     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

| 컴포넌트 | 위치 | 역할 | depth |
|----------|------|------|-------|
| `ToolErrorResult` | tool-surface.ts | 모든 도구의 공통 에러 (`status:'error'`, `error`) | 0 |
| `IntentRejectedResult` | tool-surface.ts | 정책 거부 (`reason`, `intentHash`, `context`) | 0 |
| `ToolStorePort` | ports.ts | daemon이 store에서 쓰는 9개 메서드만 정의한 Port | 0 |
| `ApprovalBrokerPort` | ports.ts | daemon이 broker에서 쓰는 createRequest 1개만 정의 | 0 |
| `WDKInstance` | wdk-host.ts | GuardedWDK facade에서 getAccount/on/off/dispose만 Pick | 0 |
| `SendTransactionResult` | tool-surface.ts | executed \| duplicate \| rejected \| error | 1 |
| `AnyToolResult` | tool-surface.ts | 12개 per-tool result의 합집합 | 2 |
| `ToolExecutionContext` | tool-surface.ts | 도구 실행에 필요한 의존성 번들 (wdk+broker+store+logger+journal) | 2 |
| `ToolDefinition` | ai-tool-schema.ts | OpenAI function calling JSON Schema 1건 | 0 |
| `TOOL_DEFINITIONS` | ai-tool-schema.ts | 12개 도구의 schema 배열 | 1 |

---

## 축 3. 제어 채널 (Control Channel)

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                     ┃
┃  "앱에서 서명된 승인/거부 메시지가 오면 검증 후 WDK에 반영한다"     ┃
┃                                                                     ┃
┃  ControlMessage ──→ switch(msg.type) ──→ 결과                       ┃
┃    │                                                                ┃
┃    ├─ policy_approval  → broker.submitApproval() → 정책 적용         ┃
┃    ├─ policy_reject    → broker.submitApproval() → 요청 거부         ┃
┃    ├─ device_revoke    → broker.submitApproval() → 서명자 폐기       ┃
┃    ├─ wallet_create    → broker.submitApproval() → 지갑 생성         ┃
┃    ├─ wallet_delete    → broker.submitApproval() → 지갑 삭제         ┃
┃    ├─ pairing_confirm  → SAS+토큰 검증 → 서명자 등록 + E2E 키 교환  ┃
┃    └─ cancel_message   → queueManager.cancel() → 메시지 취소        ┃
┃                                                                     ┃
┃  ControlMessage = type별 7-variant discriminated union              ┃
┃    payload:                                                         ┃
┃    ├─ SignedApprovalFields (공통 11필드: sig, approver, nonce 등)    ┃
┃    ├─ PolicyApprovalPayload extends SignedApprovalFields + policies  ┃
┃    ├─ DeviceRevokePayload extends SignedApprovalFields + targetPubKey┃
┃    ├─ PairingConfirmPayload (signerId, pubKeys, token, SAS)         ┃
┃    └─ CancelMessagePayload (messageId)                              ┃
┃                                                                     ┃
┃  ControlResult = { ok, type?, error?, ... } (현재 wide bag 유지)    ┃
┃                                                                     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

| 컴포넌트 | 위치 | 역할 | depth |
|----------|------|------|-------|
| `SignedApprovalFields` | control-handler.ts | 서명 승인의 공통 필드 11개 (requestId, sig, approver, nonce 등) | 0 |
| `PairingConfirmPayload` | control-handler.ts | 디바이스 페어링 확인 (signerId, pubKeys, token, SAS) | 0 |
| `CancelMessagePayload` | control-handler.ts | 메시지 취소 (messageId) | 0 |
| `PolicyApprovalPayload` | control-handler.ts | 정책 승인 (SignedApprovalFields + policies[]) | 1 |
| `DeviceRevokePayload` | control-handler.ts | 서명자 폐기 (SignedApprovalFields + targetPublicKey) | 1 |
| `ControlMessage` | control-handler.ts | 7개 variant union. `type`으로 구분 | 2 |
| `PairingSession` | control-handler.ts | 페어링 중 daemon이 메모리에 유지하는 일시적 세션 | 0 |

---

## 축 4. 인프라 (Infrastructure)

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                     ┃
┃  "메시지 큐잉, 크론 예약 실행, 실행 저널, 어드민 모니터링을 제공"   ┃
┃                                                                     ┃
┃  ┌── MessageQueueManager ──┐                                        ┃
┃  │  세션별 FIFO 큐          │  enqueue → 순차 처리 → cancel 지원     ┃
┃  │  SessionMessageQueue[]  │                                        ┃
┃  └─────────────────────────┘                                        ┃
┃                                                                     ┃
┃  ┌── CronScheduler ────────┐                                        ┃
┃  │  주기적 프롬프트 실행    │  tick() → due 크론 → dispatch 콜백     ┃
┃  │  CronBase → Entry/Reg   │  dispatch = index.ts에서 주입           ┃
┃  └─────────────────────────┘                                        ┃
┃                                                                     ┃
┃  ┌── ExecutionJournal ──────┐                                       ┃
┃  │  intent 추적 + 중복 방지 │  track(hash) → isDuplicate() 검사     ┃
┃  │  received→settled/failed │  메모리 인덱스 + store 영속            ┃
┃  └─────────────────────────┘                                        ┃
┃                                                                     ┃
┃  ┌── AdminServer ───────────┐                                       ┃
┃  │  Unix 소켓 로컬 관리     │  status, journal_list, signer_list,   ┃
┃  │  AdminServerConfig+Deps  │  cron_list, wallet_list               ┃
┃  └─────────────────────────┘                                        ┃
┃                                                                     ┃
┃  ┌── RelayClient ───────────┐                                       ┃
┃  │  WebSocket + E2E 암호화  │  자동 재연결 + 하트비트 + NaCl 암호화  ┃
┃  │  extends EventEmitter    │  앱↔Daemon 간 메시지 전달              ┃
┃  └─────────────────────────┘                                        ┃
┃                                                                     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

| 컴포넌트 | 위치 | 역할 | depth |
|----------|------|------|-------|
| `QueuedMessage` | message-queue.ts | 큐에 들어간 메시지 (abortController로 취소 지원) | 0 |
| `PendingMessageRequest` | message-queue.ts | `Omit<QueuedMessage, 'userId'\|'abortController'>` 유도형 | 1 |
| `SessionMessageQueue` | message-queue.ts | 세션 단위 FIFO 큐. 한 번에 하나씩 처리 | 2 |
| `MessageQueueManager` | message-queue.ts | 전체 세션 큐 관리. enqueue/cancel | 3 |
| `CronBase` | cron-scheduler.ts | 크론 공통 필드 6개 (id, sessionId, interval, prompt, chainId, accountIndex) | 0 |
| `CronDispatch` | cron-scheduler.ts | 크론 실행 콜백 타입. index.ts에서 구현 주입 | 0 |
| `CronScheduler` | cron-scheduler.ts | tick마다 due 크론 찾아 dispatch 콜백 호출 | 2 |
| `JournalEntry` | execution-journal.ts | intent 추적 (intentHash, status, txHash) | 0 |
| `ExecutionJournal` | execution-journal.ts | 메모리 인덱스 + store 영속. 중복 실행 방지 | 1 |
| `RelayClient` | relay-client.ts | WebSocket + NaCl E2E 암호화 + 자동 재연결 + 하트비트 | 1 |
| `AdminServer` | admin-server.ts | Unix 소켓으로 status/journal/signer/cron/wallet 조회 | 3 |

---

## 축 간 연결

```
                   4개 축의 연결 (index.ts가 조립):

  앱 메시지 → [RelayClient] ─┬─ chat → [AI 대화 루프] → [도구 실행] → 결과 → relay
                             │
                             └─ control → [제어 채널] → broker/store → relay

  타이머 tick → [CronScheduler] → dispatch → [MessageQueue] → [AI 대화 루프] → ...

  로컬 CLI → [AdminServer] → store 조회 → JSON 응답
```

### 시나리오 1: AI가 트랜잭션 전송 (happy path)

사용자가 "ETH 보내줘" 메시지 → **[AI 대화 루프]** OpenClaw가 `sendTransaction` tool_call 반환 → **[도구 실행]** WDK에 서명 요청 → 정책 통과 → 체인 전송 → `{ status:'executed', hash }` → **[AI 대화 루프]** 결과를 AI에 전달 → AI 최종 텍스트 생성 → relay chat.done

### 시나리오 2: 정책이 거부한 경우 (unhappy path)

사용자가 한도 초과 전송 요청 → **[AI 대화 루프]** `sendTransaction` tool_call → **[도구 실행]** PolicyRejectionError → `{ status:'rejected', reason }` + store에 거부 이력 저장 → **[AI 대화 루프]** AI가 거부 사유를 사용자에게 설명

### 시나리오 3: 앱에서 정책 승인

AI가 `policyRequest`로 정책 변경 요청 → store에 pending 저장 → 앱에서 사용자가 서명 → **[제어 채널]** `policy_approval` ControlMessage 수신 → broker.submitApproval() → 서명 검증 6단계 통과 → 정책 적용

### 시나리오 4: 크론 자동 실행

AI가 `registerCron` 도구로 "5분마다 잔고 확인" 등록 → **[CronScheduler]** 5분 tick → dispatch 콜백 → **[MessageQueue]** enqueue → **[AI 대화 루프]** 자동 실행 → 결과 로깅

---

## 타입 그래프 요약

| 지표 | 값 |
|------|-----|
| 소스 파일 | 15개 |
| 내부 노드 | 65개 |
| 엣지 | 109개 |
| max depth | **3** |
| 순환 의존 | **0** |

---

**작성일**: 2026-03-21
**근거 데이터**: `npx tsx scripts/type-dep-graph/index.ts --include=daemon --json` (75 nodes, 109 edges)
**기반 버전**: v0.2.9+v0.2.10+v0.2.11 리팩토링 완료 후
