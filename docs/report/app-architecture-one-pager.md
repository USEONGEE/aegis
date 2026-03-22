# App 패키지 아키텍처 One-Pager

> Relay를 통해 daemon과 실시간 통신하면서, 사용자 메시지를 AI에게 전달하고, daemon이 요청한 tx/policy 승인을 Ed25519로 서명하여 돌려보내고, WDK 이벤트를 타임라인으로 표시한다

---

## Section 1 — 한줄 정의

```
┌─────────────────────────────────────────────────────────────────┐
│                         app 전체 구조                            │
│                                                                 │
│  "Relay를 통해 daemon과 실시간 통신하면서, 사용자 메시지를         │
│   AI에게 전달하고, daemon이 요청한 tx/policy 승인을 Ed25519로     │
│   서명하여 돌려보내고, WDK 이벤트를 타임라인으로 표시한다"         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section 2 — 도메인 Aggregate

### 2-1. 승인 (Approval)

> "daemon이 보낸 승인 요청을 받아, 사용자 확인 후 Ed25519로 서명하여 돌려보낸다"

Aggregate Root: `SignedApprovalBuilder` — class (core/approval)
생애주기: idle → pending → signing → success | error

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │   ApprovalRequest ──→ TxApprovalState ──→ [SignedApprovalBuilder]│
  │     (input)              (output/DU)          (core, depth 2)    │
  │                              │                      │            │
  │                              │                      ├──→ SignedApproval (output, depth 1)
  │                              │                      ├──→ SignedApprovalPayload (value, depth 1)
  │                              │                      └──→ IdentityKeyPair (config, depth 0)
  │                              │                                   │
  │   ApprovalRequest.type : ApprovalType (enum, depth 0)            │
  │                                                                  │
  │   TxApprovalState = { idle } | { pending; request }              │
  │                   | { signing } | { success; txHash }            │
  │                   | { error; message }                           │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

| 타입 | 역할 | 위치 | 설명 |
|------|------|------|------|
| `ApprovalType` | literal union | `core/approval/types.ts:15` | `'tx' \| 'policy' \| 'policy_reject' \| 'device_revoke' \| 'wallet_create' \| 'wallet_delete'` |
| `ApprovalRequest` | input | `core/approval/types.ts:59` | daemon이 보내는 승인 요청. requestId, type, chainId, targetHash, accountIndex, expiresAt, content, policyVersion, createdAt. variant별: policies (policy), targetPublicKey (device_revoke) |
| `SignedApproval` | output | `core/approval/types.ts:33` | 서명된 승인 봉투 (flat envelope). 모든 필드가 최상위 + `sig` (Ed25519 hex). `SignedApprovalPayload`는 서명 입력용 별도 타입 |
| `SignedApprovalPayload` | value | `core/approval/types.ts:78` | sig 제외 전체 필드. canonical JSON 직렬화 → SHA-256 → Ed25519 서명 |
| `SignedApprovalBuilder` | core | `core/approval/SignedApprovalBuilder.ts:100` | type별 빌더 메서드 (forTx, forPolicy, forPolicyReject, forDeviceRevoke, forWallet). nonce 자동 증가. forDeviceRevoke는 targetPublicKey → SHA-256 → targetHash 파생 |
| `TxApprovalState` | output (DU) | `shared/tx/TxApprovalContext.tsx:19` | 상태 머신 DU. idle→pending→signing→success\|error |
| `TxApprovalContextValue` | port | `shared/tx/TxApprovalContext.tsx:32` | React Context. `requestApproval(req) → Promise<{txHash}>`, `reject()` |

### 2-2. 채팅 (Chat)

> "사용자/cron 메시지를 세션 단위로 관리하고, AI 스트리밍 응답을 실시간 버퍼링한다"

Aggregate Root: `ChatMessage` — type (stores/useChatStore)
생애주기: user input → queued → active → done (streaming 상태 없음, messageState는 idle/queued/active 3종)

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │   [ChatMessage] = TextChatMessage | ToolChatMessage              │
  │    (core, DU)     | StatusChatMessage                            │
  │      depth 1          (depth 0)       (depth 0)    (depth 0)     │
  │                                                                  │
  │   ChatSession ──→ { id, title, lastMessageAt, source, messageCount }│
  │    (value, depth 0)                                              │
  │                                                                  │
  │   messageState: 'idle' | 'queued' | 'active' (transient enum)   │
  │   streamCursors: Record<sessionId, entryId>  (cursor tracking)   │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

| 타입 | 역할 | 위치 | 설명 |
|------|------|------|------|
| `TextChatMessage` | variant | `useChatStore.ts:26` | kind='text', role='user'\|'assistant'. 사용자 입력과 AI 응답 |
| `ToolChatMessage` | variant | `useChatStore.ts:31` | kind='tool', role='system'. 도구 실행 상태 (running→done\|error) |
| `StatusChatMessage` | variant | `useChatStore.ts:38` | kind='status'. 취소/에러 등 시스템 이벤트 |
| `ChatMessage` | core (DU) | `useChatStore.ts:44` | 3-variant discriminated union. kind 필드로 구분 |
| `ChatSession` | value | `useChatStore.ts:48` | 세션 메타데이터. source='user'\|'cron', title 자동 추출 |

### 2-3. 신원 & 암호 (Identity & Crypto)

> "Ed25519 서명 키를 SecureStore에 관리하고, Curve25519 ECDH로 E2E 세션 암호화를 제공한다"

Aggregate Root: `IdentityKeyManager` — class (core/identity)
생애주기: (없음) → generate → load → sign → (delete)

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │   [IdentityKeyManager] ──→ IdentityKeyPair                      │
  │     (core, depth 1)         (value, depth 0)                     │
  │      singleton               { publicKey, secretKey } Uint8Array │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

| 타입 | 역할 | 위치 | 설명 |
|------|------|------|------|
| `IdentityKeyPair` | value | `IdentityKeyManager.ts:9` | Ed25519 keypair. publicKey=승인자 식별, secretKey=서명 |
| `IdentityKeyManager` | core | `IdentityKeyManager.ts:24` | Singleton. SecureStore CRUD + sign/verify. 앱당 하나의 신원 |

v0.4.7에서 `E2ECrypto.ts` 파일 전체 삭제 (v0.3.4 pairing 제거 후 dead code).

### 2-4. 릴레이 (Relay Transport)

> "WebSocket으로 Relay 서버에 연결하고, 채팅/제어 메시지를 E2E 암호화하여 양방향 전송한다"

Aggregate Root: `RelayClient` — class (core/relay)
생애주기: disconnect → connecting → authenticated → (reconnecting)

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │   [RelayClient] ──→ ControlEnvelope  ──→ EncryptedPayload        │
  │    (core, depth 3)    (value, depth 0)     (value, depth 0)      │
  │     singleton          { type, payload,     { nonce,             │
  │     WebSocket           messageId, ts }      ciphertext }        │
  │                                                                  │
  │   RelayMessage = { channel, messageId, timestamp, payload,       │
  │                    sessionId }   (output, not in graph)           │
  │                                                                  │
  │   채널: 'control' | 'chat' | 'event_stream' | 'query'            │
  │         | 'query_result'  (RelayChannel from @wdk-app/protocol)  │
  │                                                                  │
  │   v0.4.8 추가:                                                    │
  │   pendingQueries: Map<requestId, {resolve,reject}>               │
  │   query<T>(type, params, timeout?) → Promise<T>                  │
  │                                                                  │
  │   v0.5.0 변경:                                                    │
  │   sendChat(sessionId, text) — RelayChatInput 프로토콜 타입 사용   │
  │   subscribedSessions: Set<string> — 중복 subscribe_chat 방지     │
  │   (sendChat 시 자동으로 subscribe_chat 전송, 이미 구독 중이면 skip)│
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

| 타입 | 역할 | 위치 | 설명 |
|------|------|------|------|
| `RelayClient` | core | `RelayClient.ts:49` | Singleton. WebSocket + exponential backoff + heartbeat. sendChat/sendControl/sendApproval/query(). v0.4.8: pendingQueries(requestId→Promise), query_result 수신 핸들러. v0.5.0: sendChat(sessionId, text) — `RelayChatInput` 프로토콜 타입 사용, subscribedSessions Set으로 중복 subscribe_chat 방지 |
| `ControlEnvelope` | value | `RelayClient.ts:29` | 제어 메시지 래퍼. type으로 메시지 종류 구분 |
| `EncryptedPayload` | value | `RelayClient.ts:36` | E2E 암호화된 payload. sessionKey 설정 시 자동 적용 |
| `RelayMessage` | output | `RelayClient.ts:21` | 수신 메시지 정규화. channel + payload + cursor 메타 |

### 2-5. 정책 (Policy)

> "체인별 활성 정책을 표시하고, AI가 요청한 신규 정책을 사용자가 승인/거부한다"

Aggregate Root: `PolicyGroup` — interface (stores/usePolicyStore)
생애주기: (AI 요청) → pending → approved | rejected → active

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │   [PolicyGroup] ──→ Policy                                       │
  │    (core, depth 1)    (value, depth 0)                           │
  │     chainId별 그룹     { target, selector, decision, constraints }│
  │                                                                  │
  │   PendingPolicyRequest ──→ Policy[]                              │
  │    (input, depth 1)         AI가 요청한 정책 목록                  │
  │     { requestId, reason, requestedBy, expiresAt }                │
  │                                                                  │
  │   Policy.decision = 'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'      │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

| 타입 | 역할 | 위치 | 설명 |
|------|------|------|------|
| `Policy` | value | `usePolicyStore.ts:9` | 개별 정책 규칙. target(컨트랙트) + selector(함수) + decision |
| `PolicyGroup` | core | `usePolicyStore.ts:19` | 체인별 정책 묶음. policyVersion으로 버전 관리 |
| `PendingPolicyRequest` | input | `usePolicyStore.ts:26` | AI의 정책 요청. reason + policies[] + expiresAt |

---

## Section 3 — 도메인 관계 맵

```
                ┌──────────┐
                │ Identity │
                │ & Crypto │
                └────┬─────┘
                     │ signs
                     ▼
  ┌────────┐    ┌──────────┐    ┌────────┐
  │  Chat  │───→│  Relay   │←───│ Policy │
  │        │    │Transport │    │        │
  └────────┘    └────┬─────┘    └───┬────┘
                     │ ▲            │
               sends │ │ receives   │ reuses approval
                     ▼ │            ▼
                ┌──────────┐
                │ Approval │
                └──────────┘
```

| 관계 | 유형 | 설명 |
|------|------|------|
| Chat → Relay | 소비 | ChatDetailScreen이 `RelayClient.sendChat()`으로 사용자 메시지 전송 |
| Relay → Chat | 생성 | 수신된 streaming 이벤트(typing/stream/done)로 ChatMessage 생성 |
| Relay → Approval | 생성 | 제어 채널의 REQUIRE_APPROVAL 이벤트가 ApprovalRequest 생성 |
| Approval → Relay | 소비 | SignedApproval을 `RelayClient.sendApproval()`로 전송 |
| Identity → Approval | 소비 | `SignedApprovalBuilder`가 `IdentityKeyPair`로 서명 |
| Policy → Approval | 소비 | 정책 승인/거부가 `TxApprovalContext.requestApproval()`을 재사용 |
| Relay → Policy | 전이 | 제어 채널의 정책 이벤트가 PolicyStore를 업데이트 |

---

## Section 4 — 기능 축 다이어그램

```
                       3개의 큰 축:

  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
  │     AI 대화         │  │     서명 승인        │  │    실시간 동기화     │
  │ "사용자↔AI 스트리밍" │  │ "요청→서명→전송"     │  │ "이벤트→화면 갱신"   │
  │ [Chat+Relay]       │  │ [Approval+Identity  │  │ [Relay+Activity    │
  │                    │  │  +Relay+Policy]     │  │  +Chat+Policy]     │
  └────────┬───────────┘  └────────┬───────────┘  └────────┬───────────┘
           │                       │                       │
           ▼                       ▼                       ▼
```

---

## Section 5 — 축별 상세 설명

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                    ┃
┃  1. AI 대화 (Chat Flow)                                            ┃
┃  ─────────────────────                                             ┃
┃  "사용자가 보낸 메시지에 AI가 스트리밍으로 응답하는가?"               ┃
┃  관여 도메인: Chat, Relay                                          ┃
┃                                                                    ┃
┃  User Input ──→ RelayClient.sendChat(sessionId, text) ──→ daemon   ┃
┃      │         (auto subscribe_chat + RelayChatInput)  │           ┃
┃      │                                        ▼                    ┃
┃      │         ChatDetailScreen.handler ←── streaming events       ┃
┃      │              │                                              ┃
┃      │              ├─ typing   → isTyping=true (UI only, 메시지 미생성)┃
┃      │              ├─ stream   → buffer 누적 → addMessage()       ┃
┃      │              ├─ tool_start/done → ToolChatMessage           ┃
┃      │              ├─ error    → StatusChatMessage                ┃
┃      │              └─ done     → 완료, 상태 idle (UI only, 메시지 미생성)┃
┃      │                                                             ┃
┃  sendMessage():                                                    ┃
┃    로컬에 사용자 메시지 먼저 추가 (optimistic update)                ┃
┃    → sendChat() 실패 시 StatusChatMessage 추가                      ┃
┃      │                                                             ┃
┃  messageState = 'idle' | 'queued' | 'active'                       ┃
┃                                                                    ┃
┃  cancelQueued() / cancelActive() → 'idle'                          ┃
┃                                                                    ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
```

| 컴포넌트 | 위치 | 도메인 | 타입역할 | 설명 | 의존 |
|----------|------|--------|----------|------|------|
| `ChatMessage` | `useChatStore.ts:44` | Chat | core (DU) | Text\|Tool\|Status 3-variant union. kind로 구분 | Text,Tool,Status |
| `ChatSession` | `useChatStore.ts:48` | Chat | value | 세션 메타. source='user'\|'cron', 자동 title | leaf |
| `useChatStore` | `useChatStore.ts:85` | Chat | port | zustand persist. sessions, cursors, messageState. AsyncStorage 영속화 | ChatMessage, ChatSession |
| `ChatDetailScreen` | `domains/chat/screens/ChatDetailScreen.tsx:42` | Chat | — | 대화 UI. relay handler 등록, 스트림 버퍼링, 전송/취소 | useChatStore, RelayClient |
| `ChatListScreen` | `domains/chat/screens/ChatListScreen.tsx:11` | Chat | — | 세션 목록. source=cron 뱃지. 세션 생성/선택 | useChatStore |
| `ChatNavigator` | `app/RootNavigator.tsx:32` | Chat | — | 앱 레벨 sync handler. 커서 추적, cron 세션 발견, 비활성 세션 메시지 저장 | useChatStore, RelayClient |

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                    ┃
┃  2. 서명 승인 (Approval Flow)                                      ┃
┃  ─────────────────────────                                         ┃
┃  "daemon이 보낸 tx/policy 요청을 사용자가 검토하고 서명하는가?"       ┃
┃  관여 도메인: Approval, Identity, Relay, Policy                    ┃
┃                                                                    ┃
┃  ApprovalRequest ──→ TxApprovalProvider ──→ SignedApprovalBuilder   ┃
┃   (from daemon)       (state machine)        (sign with Ed25519)   ┃
┃       │                    │                       │               ┃
┃       │                    ├─ idle                  │               ┃
┃       │                    ├─ pending → Sheet 표시   │               ┃
┃       │                    ├─ signing → 서명 중      │               ┃
┃       │                    ├─ success → txHash      ▼               ┃
┃       │                    └─ error → retry/skip   RelayClient      ┃
┃       │                                           .sendApproval()  ┃
┃       │                                                │           ┃
┃       └─ type별 분기:                                   ▼           ┃
┃          tx       → builder.forTx()              daemon → WDK      ┃
┃          policy   → builder.forPolicy()                            ┃
┃          policy_reject → builder.forPolicyReject()                  ┃
┃          device_revoke → builder.forDeviceRevoke()                  ┃
┃          wallet_*      → builder.forWallet()                       ┃
┃                                                                    ┃
┃  결과 판정: event_stream에서 WDK 이벤트로 수신                      ┃
┃    성공: ExecutionBroadcasted, PolicyApplied, SignerRevoked 등      ┃
┃    실패: ApprovalFailed                                            ┃
┃                                                                    ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
```

| 컴포넌트 | 위치 | 도메인 | 타입역할 | 설명 | 의존 |
|----------|------|--------|----------|------|------|
| `ApprovalRequest` | `core/approval/types.ts:59` | Approval | input | daemon이 보내는 승인 요청. type으로 6종 구분 | ApprovalType |
| `SignedApproval` | `core/approval/types.ts:33` | Approval | output | 서명된 봉투. payload + sig(Ed25519 hex). expiresAt으로 시효 | ApprovalType |
| `SignedApprovalBuilder` | `core/approval/SignedApprovalBuilder.ts:100` | Approval | core | type별 빌더. canonical JSON → SHA-256 → Ed25519 sign. nonce 자동 증가 | IdentityKeyPair, SignedApproval |
| `TxApprovalProvider` | `shared/tx/TxApprovalContext.tsx:70` | Approval | — | React Context 상태 머신. 큐 관리 + auto-advance. executor 주입 | ApprovalRequest |
| `TxApprovalSheet` | `shared/tx/TxApprovalSheet.tsx:26` | Approval | — | Modal UI. pending/signing/success/error 4상태 렌더링 | TxApprovalContext |
| `AppProviders.approvalExecutor` | `app/providers/AppProviders.tsx:20` | Approval | — | request.type별 switch → builder 메서드 호출 → relay.sendApproval() | Builder, RelayClient |
| `ApprovalScreen` | `domains/approval/screens/ApprovalScreen.tsx:21` | Approval | — | 대기 중 승인 목록. 카드 탭 → TxApprovalSheet 열기 | useApprovalStore, TxApproval |
| `IdentityKeyManager` | `core/identity/IdentityKeyManager.ts:24` | Identity | core | Singleton. SecureStore에 Ed25519 키 영속화. sign/verify | IdentityKeyPair |

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                    ┃
┃  3. 실시간 동기화 (Real-time Sync)                                  ┃
┃  ─────────────────────────────                                     ┃
┃  "daemon에서 발생한 이벤트가 앱 화면에 실시간 반영되는가?"            ┃
┃  관여 도메인: Relay, Activity, Chat, Policy                        ┃
┃                                                                    ┃
┃  v0.4.8: event_stream은 가상 채널 — Relay가 control 스트림의         ┃
┃  sender=daemon 메시지를 WS type='event_stream'으로 변환하여 전달     ┃
┃                                                                    ┃
┃  daemon ──→ Relay ──→ RelayClient ──→ handler 분기                  ┃
┃                    (event_stream ch)    │                           ┃
┃                                        ├─ WDK 이벤트 (15종)        ┃
┃                                        │    ├─ ActivityStore 적재   ┃
┃                                        │    ├─ Dashboard 갱신       ┃
┃                                        │    └─ Settings 갱신        ┃
┃                                        │                           ┃
┃                                        ├─ CancelCompleted/Failed   ┃
┃                                        │    └─ messageState→idle   ┃
┃                                        │                           ┃
┃                                        ├─ cron_session_created     ┃
┃                                        │    └─ registerSession     ┃
┃                                        │       + subscribeChatStream┃
┃                                        │                           ┃
┃                                        ├─ message_queued/started   ┃
┃                                        │    └─ messageState 전이    ┃
┃                                        │                           ┃
┃                                        └─ chat cursor tracking     ┃
┃                                             └─ streamCursors       ┃
┃                                                controlCursor       ┃
┃                                                                    ┃
┃  ActivityEventType (15종):                                         ┃
┃    IntentProposed → PolicyEvaluated → ApprovalRequested            ┃
┃    → ApprovalVerified → ExecutionBroadcasted → ExecutionSettled     ┃
┃                                                                    ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
```

| 컴포넌트 | 위치 | 도메인 | 타입역할 | 설명 | 의존 |
|----------|------|--------|----------|------|------|
| `RelayClient` | `core/relay/RelayClient.ts:49` | Relay | core | Singleton. WS + backoff reconnect + heartbeat + E2E encrypt. 커서 기반 재연결 복구 | ControlEnvelope, EncryptedPayload |
| `ActivityEventType` | `useActivityStore.ts:8` | Activity | literal union | 15종 WDK 이벤트 string literal union | leaf |
| `ActivityEvent` | `useActivityStore.ts:25` | Activity | core | id, type, chainId, summary, details, timestamp | ActivityEventType |
| `ActivityFilter` | `useActivityStore.ts:34` | Activity | literal union | `ActivityEventType \| 'all'`. 스크린 필터 | ActivityEventType |
| `useActivityStore` | `useActivityStore.ts:53` | Activity | port | zustand. 최대 500개 이벤트. 타입별 필터링 | ActivityEvent |
| `ActivityScreen` | `domains/activity/screens/ActivityScreen.tsx:37` | Activity | — | 타임라인 UI. 필터 칩 + EventCard. 색상/아이콘 타입별 매핑 | useActivityStore |
| `DashboardScreen` | `domains/dashboard/screens/DashboardScreen.tsx:40` | Relay | — | 포트폴리오 뷰. event_stream에서 balance/position 갱신 | RelayClient |
| `PolicyScreen` | `domains/policy/screens/PolicyScreen.tsx:20` | Policy | — | 활성 정책 목록 + 대기 정책 승인/거부. TxApproval 재사용 | usePolicyStore, TxApproval |
| `SettingsScreen` | `domains/settings/screens/SettingsScreen.tsx:32` | Identity | — | 신원 키 관리 + 페어링 서명자 목록 + 서명자 해지 | IdentityKeyManager, RelayClient |

---

## Section 6 — 시나리오 (축 간 연결)

```
                 3개 축의 연결:

  사용자 메시지 → [AI 대화] → AI 판단 → [서명 승인] → daemon 실행
                                                    → [실시간 동기화] → 화면 갱신
```

### 시나리오 1: 사용자가 AI에게 토큰 스왑 요청 (happy path)

```
  사용자가 ChatDetailScreen에서 "Swap 100 USDC to ETH"
    → [AI 대화] sendChat(sessionId, text) → auto subscribe_chat → Relay → daemon → OpenClaw
      (Chat: idle → queued → active → streaming)
    → AI가 tool_call로 tx intent 생성
    → daemon 정책 평가 → REQUIRE_APPROVAL
    → [서명 승인] ApprovalRequest 수신 → TxApprovalSheet pending
      (Approval: idle → pending)
    → 사용자 Approve 탭
      (Approval: pending → signing → success)
    → SignedApprovalBuilder.forTx() → relay.sendApproval()
    → daemon → WDK 서명 → 온체인 브로드캐스트
    → [실시간 동기화] event_stream: ExecutionBroadcasted
      (Activity: event 추가, Dashboard: balance 갱신)
```

### 시나리오 2: AI가 정책 추가 요청 → 사용자 거부

```
  AI가 cron 세션에서 자동 실행 중 새 정책 필요 판단
    → [실시간 동기화] cron_session_created → Chat registerSession()
    → [AI 대화] 대화 스트리밍 (cron 세션)
    → daemon → PendingPolicyRequest 전달
    → PolicyScreen에 대기 정책 표시
    → 사용자 Reject 탭
    → [서명 승인] requestApproval(type='policy_reject')
      (Approval: idle → pending → signing → success)
    → relay.sendApproval() → daemon → 정책 거부 기록
    → [실시간 동기화] event_stream: ApprovalRejected
```

### 시나리오 3: 오프라인 복구 (reconnect)

```
  앱이 백그라운드에서 WebSocket 끊김
    → RelayClient: exponential backoff 재연결
    → tokenRefresher() 호출 → 토큰 갱신
    → authenticate 시 controlCursor + chatCursors 전송
    → Relay가 마지막 커서 이후 누적 이벤트 재전송
    → [실시간 동기화] 누적 cron_session_created 처리
      → subscribeChatStream()으로 채팅 히스토리 복구
    → [AI 대화] 비활성 세션 메시지 앱 레벨에서 저장
```

---

## 타입 그래프 데이터

- 패키지: app (31 nodes, 27 edges)
- 그래프 생성: `npx tsx scripts/type-dep-graph/index.ts --include=app --json`
- DDD 4레이어: app → domains → shared → core
- 영속화: zustand persist (AsyncStorage) + SecureStore (Ed25519 키)

---

**작성일**: 2026-03-22 KST
**갱신일**: 2026-03-22 KST — v0.4.8 반영. RelayChannel 5종 확장, query() 메서드 + pendingQueries, event_stream top-level 채널 분리, CancelCompleted/CancelFailed 수신, cancel_queued/cancel_active→event_stream 채널 전환
**갱신일**: 2026-03-23 KST — v0.5.0 반영. sendChat 시그니처 변경, subscribedSessions Set 추가, 축1/시나리오1 갱신
**갱신일**: 2026-03-23 KST — Codex 검수 기반 수정. (1) ApprovalType/ActivityEventType/ActivityFilter enum→literal union, (2) SignedApproval flat envelope 명시, (3) ChatSession count→messageCount, (4) typing/done UI only 명시, (5) event_stream=가상 채널 (control 변환) 명확화, (6) WDK 이벤트 14→15종, (7) ApprovalRequest 누락 필드 추가 (content/policyVersion/createdAt/policies/targetPublicKey), (8) forPolicyReject 빌더 추가, (9) forDeviceRevoke targetHash 파생 규칙, (10) sendMessage optimistic update 추가
