# Relay 도메인 Aggregate 분석서

> relay 패키지의 5개 도메인 Aggregate를 타입 그래프(32 nodes, 57 edges) 기반으로 식별하고, 도메인 간 관계 → 기능 축 → 시나리오 순서로 풀어낸 아키텍처 원페이저

---

## Section 1 — 한줄 정의

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           relay 전체 구조                                │
│                                                                         │
│  "Daemon과 App 사이에서 JWT로 인증하고, Redis Streams로 메시지를 중계하며,│
│   PostgreSQL에 사용자/데몬 바인딩을 영속하는 멀티플렉스 게이트웨이"        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Section 2 — 도메인 Aggregate

### 레지스트리 (Registry)

> "사용자, 데몬, 디바이스, 세션, 바인딩, 인증 토큰을 PostgreSQL에 영속하는 ID 관리 계층"

Aggregate Root: `RegistryAdapter` — port (`registry-adapter.ts:94`)
생애주기: 정적 — 서버 부팅 시 migrate, 종료 시 close

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │  ── 타입 별칭 (actor-types.ts, v0.4.3) ──                        │
  │  DeviceType = 'daemon' | 'app'   (디바이스 종류)                  │
  │  SubjectRole = 'daemon' | 'app'  (인증 주체 역할)                 │
  │                                                                  │
  │  ── CreateParams (input, depth 0) ──                              │
  │  CreateUserParams ─────→ [RegistryAdapter] ──→ UserRecord         │
  │  CreateDaemonParams ───→     (port)        ──→ DaemonRecord       │
  │  CreateDeviceParams ───→       │           ──→ DeviceRecord       │
  │  CreateSessionParams ──→       │           ──→ SessionRecord      │
  │  CreateRefreshTokenParams →    │           ──→ RefreshTokenRecord  │
  │  CreateDaemonUserParams ──→    │           ──→ DaemonUserRecord    │
  │  CreateEnrollmentCodeParams →  │           ──→ EnrollmentCodeRecord│
  │                                │                                   │
  │  ── Record extends CreateParams (v0.4.3) ──                       │
  │  UserRecord extends CreateUserParams { createdAt }                │
  │  DeviceRecord extends CreateDeviceParams { lastSeenAt, createdAt }│
  │  DaemonRecord extends CreateDaemonParams { createdAt }            │
  │  ... (7쌍 전부 extends 관계)                                      │
  │                                                                  │
  │  ── ListItem = Pick<Record> (v0.4.3) ──                           │
  │  DeviceListItem = Pick<DeviceRecord, 'id'|'type'|'pushToken'|    │
  │                                       'lastSeenAt'>              │
  │  SessionListItem = Pick<SessionRecord, 'id'|'metadata'|         │
  │                                         'createdAt'>             │
  │                                                                  │
  │  PgRegistry ── (core, extends RegistryAdapter)                   │
  │    Pool(PostgreSQL) 기반 구현                                      │
  │                                                                  │
  │  PgRegistryOptions ── config ── { databaseUrl }                  │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

- **DeviceType / SubjectRole** — v0.4.3에서 `actor-types.ts`로 추출. 이전에 10곳에 인라인 `'daemon' | 'app'`으로 반복되던 것을 타입 별칭으로 통일. 의미 구분: DeviceType은 디바이스 종류, SubjectRole은 인증 주체 역할 (현재 같은 값이지만 도메인이 다름)
- **Record extends CreateParams** — v0.4.3에서 7쌍 전부 extends 관계 적용 (v0.2.1 "Stored extends Input" 패턴). 이전에는 독립 정의로 필드가 중복
- **ListItem = Pick\<Record\>** — v0.4.3에서 Pick 파생으로 전환. DeviceListItem.type이 `string`에서 `DeviceType`으로 좁혀짐 (**버그 수정**)
- **RegistryAdapter** — 추상 클래스. 7개 엔티티(User, Daemon, Device, Session, DaemonUser, RefreshToken, EnrollmentCode) CRUD 메서드 정의. 구현은 PgRegistry
- **UserRecord** — CreateUserParams(`id, passwordHash`) + `createdAt`. Google OAuth 시 passwordHash=null
- **DaemonRecord** — CreateDaemonParams(`id, secretHash`) + `createdAt`. daemon self-register로 생성
- **DaemonUserRecord** — CreateDaemonUserParams(`daemonId, userId`) + `boundAt`. **UNIQUE(userId)** — 1 user : 1 daemon 강제
- **EnrollmentCodeRecord** — CreateEnrollmentCodeParams(`code, daemonId, expiresAt`) + `usedAt`. 5분 TTL, 1회 사용
- **RefreshTokenRecord** — CreateRefreshTokenParams(`id, subjectId, role, deviceId, expiresAt`) + `createdAt, revokedAt`. daemon/app 공용

---

### 큐 (Queue)

> "Redis Streams 기반으로 control/chat 메시지를 영속적으로 publish/consume하고, heartbeat TTL을 관리하는 전송 계층"

Aggregate Root: `QueueAdapter` — port (`queue-adapter.ts:19`)
생애주기: 정적 — 서버 부팅 시 생성, 종료 시 close

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │  stream key ─input─→ [QueueAdapter] ──→ StreamEntry              │
  │  "control:{userId}"      (port)         (output)                 │
  │  "chat:{userId}:{sessId}"  │          { id: Redis stream ID      │
  │                            │            data: Record<str,str> }   │
  │                            │                                     │
  │                     publish(stream, msg) → id                    │
  │                     consume(stream, cursor) → StreamEntry[]      │
  │                     readRange(stream, start, end) → StreamEntry[]│
  │                     setWithTtl(key, ttl) → heartbeat             │
  │                     exists(key) → online 체크                     │
  │                                                                  │
  │  RedisQueue ── (core, extends QueueAdapter)                      │
  │    redis: ioredis (쓰기 전용)                                     │
  │    blockingRedis: ioredis (XREAD BLOCK 전용, 별도 연결)            │
  │                                                                  │
  │  RedisQueueOptions ── config ── { url }                          │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

- **QueueAdapter** — 추상 클래스. publish/consume/readRange/setWithTtl/exists/trim/close. 스트림 키 규약: `control:{userId}`, `chat:{userId}:{sessionId}`
- **StreamEntry** — `{ id, data }`. id는 Redis stream entry ID (timestamp 기반), data는 `{ sender, payload, timestamp, sessionId?, encrypted? }`
- **RedisQueue** — 2개 ioredis 연결 사용. blockingRedis는 XREAD BLOCK 전용 (head-of-line blocking 방지)

---

### 인증 (Auth)

> "JWT 발급/검증, 비밀번호 해싱, Google OAuth ID token 검증, refresh token 관리를 담당하는 인증 계층"

Aggregate Root: 함수 집합 (auth.ts — 진입점이 여러 라우트)
생애주기: **register → login → JWT 발급 → refresh → (revoke)**

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │  ── Daemon 인증 ──                                               │
  │  POST /daemon/register { daemonId, secret }                      │
  │    → hashPassword → registry.createDaemon                        │
  │                                                                  │
  │  POST /daemon/login { daemonId, secret }                         │
  │    → verifyPassword → signDaemonToken → issueRefreshToken        │
  │                                                                  │
  │  ── App 인증 ──                                                   │
  │  POST /google { idToken }                                        │
  │    → verifyGoogleIdToken → registry.createUser (auto)            │
  │    → signAppToken → issueRefreshToken                            │
  │                                                                  │
  │  ── 공용 ──                                                       │
  │  POST /refresh { refreshToken }                                  │
  │    → registry.getRefreshToken → rotation + replay detection      │
  │    → signToken(role) → issueRefreshToken (new)                   │
  │                                                                  │
  │  ── Enrollment ──                                                 │
  │  POST /daemon/enroll (daemon JWT)                                │
  │    → generateEnrollmentCode → registry.createEnrollmentCode      │
  │                                                                  │
  │  POST /enroll/confirm (app JWT)                                  │
  │    → registry.claimEnrollmentCode (atomic)                       │
  │    → registry.bindUser → queue.publish(user_bound)               │
  │                                                                  │
  │  JwtPayload ── value ── { sub, role: SubjectRole, deviceId? }    │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

- **signDaemonToken / signAppToken** — JWT 생성. role 필드로 daemon/app 구분
- **verifyToken** — JWT 검증 + JwtPayload 반환. WS 핸드셰이크에서도 사용
- **verifyGoogleIdToken** — Google 공개키로 ID token 서명 검증 (issuer, expiry, audience)
- **hashPassword / verifyPassword** — SHA-256 + salt + timingSafeEqual
- **issueRefreshToken** — DB에 저장, rotation 시 이전 토큰 revoke, replay 감지

---

### 소켓 (Socket)

> "Daemon과 App의 WebSocket 연결을 관리하고, 메시지를 양방향으로 라우팅하는 실시간 중계 계층"

Aggregate Root: `wsRoutes` 함수 내부 상태 (`ws.ts:49-59`)
생애주기: **connecting → authenticated → active ⇄ disconnected**

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │  ── 연결 상태 (인메모리) ──                                       │
  │                                                                  │
  │  daemonSockets: Map<daemonId, DaemonSocket>                      │
  │    DaemonSocket = { socket, daemonId, userIds: Set,              │
  │                     pollerAbort, userPollerAborts: Map }          │
  │                                                                  │
  │  userToDaemon: Map<userId, daemonId>                             │
  │    → "이 사용자의 메시지를 어느 daemon에게 보낼까?"                 │
  │                                                                  │
  │  appBuckets: Map<userId, Set<WebSocket>>                         │
  │    → "이 사용자의 앱 소켓들" (다중 디바이스 가능)                   │
  │                                                                  │
  │  ── /ws/daemon 핸들러 ──                                          │
  │  authenticate → load bound userIds → per-user control poller     │
  │  → daemon-events poller (user_bound/unbound 실시간 반영)          │
  │  → daemon→app: ownership 검증 후 Redis XADD (v0.4.8: 직접 forward 제거)
  │  → query_result: WS 직접 전달 (Redis 미경유)                      │
  │                                                                  │
  │  ── /ws/app 핸들러 ──                                             │
  │  authenticate → control poller + chat backfill (cursor 기반)     │
  │  → app→daemon: Redis XADD (v0.4.8: 직접 forward 제거)            │
  │  → query: WS 직접 전달 (Redis 미경유, daemon offline 시 에러 응답) │
  │  → subscribe_chat: 새 세션 발견 시 one-shot backfill              │
  │                                                                  │
  │  ── 보조 함수 ──                                                   │
  │  pollControlForDaemon — per-user XREAD 루프 (sender≠daemon skip) │
  │  pollControlForApp — single-user XREAD 루프 (sender≠app skip)    │
  │    v0.4.8: sender=daemon → WS type='event_stream'으로 변환       │
  │  backfillChatStream — one-shot XRANGE (오프라인 cron 복구)         │
  │  pollDaemonEvents — user_bound/unbound 실시간 반영                │
  │  pushToOfflineApps — 앱 오프라인 시 Expo push notification        │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

- **DaemonSocket** — daemon 연결 상태. `userIds`로 소유 사용자 추적, `userPollerAborts`로 per-user poller 개별 제어
- **userToDaemon** — 라우팅 핵심 맵. app→daemon 메시지 전달 시 이 맵으로 대상 daemon 결정
- **appBuckets** — 사용자별 앱 소켓 집합. 다중 디바이스 동시 접속 지원
- **echo 방지** — poller가 sender 필드를 확인해서 자기가 보낸 메시지 skip

---

### 방어 (RateLimit)

> "IP 기반 sliding-window 속도 제한으로 HTTP 라우트를 보호하는 미들웨어"

Aggregate Root: `RateLimiter` — core (`rate-limit.ts:30`)
생애주기: 정적 — 서버 부팅 시 생성

```
  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │  FastifyRequest ──→ [RateLimiter] ──→ RateLimitCheckResult   │
  │    (input)            (core)           (output)              │
  │    req.ip          인메모리 Map       { allowed, remaining,  │
  │                    <IP, timestamps[]>   retryAfterMs }       │
  │                                                              │
  │  RateLimitOptions ── config ── { max:100, windowMs:60s }     │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

---

## Section 3 — 도메인 관계 맵

```
  ┌──────────┐                    ┌────────┐
  │ Registry │←──reads/writes────│  Auth  │
  │(PG 영속) │                    │(JWT+PW)│
  └────┬─────┘                    └───┬────┘
       │                              │
       │ bindUser                     │ verifyToken
       │ getUsersByDaemon             │
       ▼                              ▼
  ┌──────────┐──publish/consume──→┌────────┐
  │  Queue   │                    │ Socket │
  │(Redis)   │←──XREAD poll──────│ (WS)   │
  └──────────┘                    └───┬────┘
                                      │
                                      │ preHandler
                                      ▼
                                 ┌──────────┐
                                 │RateLimit │
                                 │(인메모리) │
                                 └──────────┘
```

| 관계 | 설명 |
|------|------|
| **Auth → Registry** | 사용자/데몬 생성, 로그인 검증, refresh token 관리, enrollment code claim + bindUser |
| **Auth → Queue** | enrollment confirm 시 `queue.publish(daemon-events:{daemonId}, user_bound)` |
| **Socket → Auth** | WS 인증 시 `verifyToken(JWT)`으로 역할+subject 확인 |
| **Socket → Registry** | daemon 인증 후 `registry.getUsersByDaemon(daemonId)`로 바인딩된 사용자 로드 |
| **Socket → Queue** | 영속 채널 메시지 중계: `queue.publish` → poller XREAD (v0.4.8: 직접 forward 제거, Redis 단일 경로). query/query_result는 Redis 미경유 WS 직접 전달 |
| **Socket ← Queue** | per-user control poller가 `queue.consume` (XREAD BLOCK)으로 수신 |
| **RateLimit → (전체)** | `preHandler` 훅으로 모든 HTTP 라우트에 적용 |

---

## Section 4 — 기능 축 다이어그램

```
                          3개의 큰 축:

  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
  │ A. 인증 & 바인딩    │  │ B. 메시지 중계      │  │ C. 오프라인 복구    │
  │ "누가 누구인가,     │  │ "App↔Daemon 메시지를 │  │ "재연결 시 놓친    │
  │  누구와 연결되는가?" │  │  실시간으로 전달"    │  │  메시지를 복원"     │
  │ [Auth+Registry]    │  │ [Socket+Queue]      │  │ [Queue+Socket]    │
  └────────┬───────────┘  └────────┬───────────┘  └────────┬───────────┘
           │                       │                       │
           ▼                       ▼                       ▼
```

---

## Section 5 — 축별 상세 설명

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                            ┃
┃  A. 인증 & 바인딩 (Auth & Binding)                                         ┃
┃  ──────────────────────────────────                                        ┃
┃  "이 연결이 누구(daemon/app)이고, 어떤 사용자와 연결되는가?"                ┃
┃  관여 도메인: Auth, Registry                                                ┃
┃                                                                            ┃
┃  Daemon 흐름:                                                               ┃
┃    login(id,secret) ──→ JWT(role:daemon) ──→ WS authenticate              ┃
┃    enroll() ──→ code(5min TTL) ──→ 터미널 출력                              ┃
┃                                                                            ┃
┃  App 흐름:                                                                  ┃
┃    google(idToken) ──→ JWT(role:app) ──→ WS authenticate                  ┃
┃    enroll/confirm(code) ──→ bindUser(daemonId,userId)                      ┃
┃                          ──→ publish(user_bound)                           ┃
┃                                                                            ┃
┃  바인딩 규칙:                                                               ┃
┃    daemon_users: UNIQUE(user_id) — 1 user : 1 daemon                      ┃
┃    userToDaemon: Map<userId, daemonId> — 인메모리 라우팅 맵                  ┃
┃                                                                            ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
```

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                            ┃
┃  B. 메시지 중계 (Message Relay)                                            ┃
┃  ──────────────────────────────                                            ┃
┃  "App과 Daemon 사이의 메시지를 어떻게 실시간으로 전달하는가?"               ┃
┃  관여 도메인: Socket, Queue                                                 ┃
┃                                                                            ┃
┃  영속 채널 (chat, control, event_stream):                                    ┃
┃    v0.4.8: Redis XADD → Poller XREAD가 유일한 전달 경로                     ┃
┃           (직접 forward 제거 — 이중 전달 해소)                                ┃
┃                                                                            ┃
┃  App→Daemon (control):                                                      ┃
┃    app WS ──→ Relay ──→ Redis XADD control:{userId} (sender=app)           ┃
┃    Daemon ←── pollControlForDaemon XREAD BLOCK (sender≠daemon만)            ┃
┃                                                                            ┃
┃  Daemon→App (event_stream):                                                 ┃
┃    daemon WS ──→ Relay ──→ ownership 검증 ──→ Redis XADD control:{userId}  ┃
┃    App ←── pollControlForApp XREAD BLOCK (sender≠app만)                     ┃
┃      v0.4.8: sender=daemon → WS type='event_stream'으로 변환               ┃
┃      앱 오프라인? push notification                                          ┃
┃                                                                            ┃
┃  비영속 채널 (query, query_result) — v0.4.8 신규:                            ┃
┃    app WS('query') ──→ Relay ──직접 forward──→ daemon                      ┃
┃    daemon WS('query_result') ──→ Relay ──직접 forward──→ app               ┃
┃    daemon 오프라인 시 relay가 error 응답 (평문)                               ┃
┃                                                                            ┃
┃  스트림 키:                                                                  ┃
┃    control:{userId}           — durable (reconnect resume)                 ┃
┃    chat:{userId}:{sessionId}  — backfill                                   ┃
┃    daemon-events:{daemonId}   — bind/unbind 이벤트                         ┃
┃                                                                            ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
```

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                            ┃
┃  C. 오프라인 복구 (Offline Recovery)                                       ┃
┃  ──────────────────────────────────                                        ┃
┃  "Daemon이나 App이 재연결했을 때 놓친 메시지를 어떻게 복원하는가?"          ┃
┃  관여 도메인: Queue, Socket                                                 ┃
┃                                                                            ┃
┃  Daemon 재연결:                                                             ┃
┃    authenticate({ lastControlIds: { alice:'1234-0', bob:'$' } })           ┃
┃    → per-user cursor 기반 control stream resume                            ┃
┃    → chat은 resume 안 함 (새 메시지 도착 시 자연 재개)                      ┃
┃                                                                            ┃
┃  App 재연결:                                                                ┃
┃    authenticate({ lastStreamId, chatCursors: { s1:'5678-0' } })            ┃
┃    → control stream: lastStreamId 이후 resume                              ┃
┃    → chat streams: chatCursors의 각 sessionId에 대해 backfill              ┃
┃      backfillChatStream() → XRANGE (one-shot, max 1000건)                  ┃
┃                                                                            ┃
┃  내구성 정책:                                                               ┃
┃    control = durable (반드시 replay)                                        ┃
┃    chat = backfill (요청 시에만, 주로 오프라인 cron 복구용)                  ┃
┃                                                                            ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
```

---

## Section 6 — 시나리오

```
                      3개 축의 연결:

  [첫 실행] → [A. 인증&바인딩] → daemon+app 인증 + enrollment
                                       │
                                       ▼
  [정상 운영] → [B. 메시지 중계] → Redis 영속 + WS 실시간 forward
                                       │
                                       ▼ (연결 끊김 후)
  [재연결] → [C. 오프라인 복구] → cursor 기반 resume + backfill
```

### 시나리오 1: Enrollment — Daemon과 App 최초 바인딩

```
Daemon 부팅
  → [축A] POST /daemon/login → JWT 발급
  → [축A] POST /daemon/enroll → enrollment code "A7K9M2" (5분 TTL)
  → 터미널에 코드 출력

사용자가 앱에서 코드 입력
  → [축A] POST /enroll/confirm { code: "A7K9M2" } (app JWT)
    → registry.claimEnrollmentCode (EnrollmentCode: →used)
    → registry.bindUser (DaemonUser: created)
    → queue.publish(daemon-events, user_bound)
  → [축B] daemon의 pollDaemonEvents가 user_bound 수신
    → userIds.add(userId) + control poller 시작
    → 이제 양방향 통신 준비 완료
```

### 시나리오 2: App이 채팅 전송 → Daemon 응답

```
App이 채팅 전송
  → [축B] app WS → { type:'chat', sessionId:'s1', payload:{ text:'...' } }
    → Relay: Redis XADD chat:{userId}:s1
    → Daemon: pollControlForDaemon XREAD로 수신

Daemon이 응답 (stream delta)
  → [축B] daemon WS → { type:'chat', userId, sessionId:'s1', payload:{ type:'stream', delta:'...' } }
    → Relay: ownership 검증 (daemon_users)
    → Relay: Redis XADD chat:{userId}:s1
    → App: pollControlForApp XREAD로 수신
```

### 시나리오 3: App 오프라인 중 Cron 실행 → 재연결 시 복구

```
App 오프라인 상태에서 Daemon의 Cron이 실행
  → [축B] daemon → Relay → Redis XADD chat:{userId}:cron-session
    → appBuckets[userId] = 빈 Set → push notification 전송

App 재연결
  → [축C] WS authenticate({ chatCursors: { 'cron-session': '0' } })
    → backfillChatStream(userId, 'cron-session', '0', socket)
    → XRANGE chat:{userId}:cron-session '0' '+' COUNT 1000
    → 놓친 cron 결과 메시지를 한 번에 수신
```

---

**작성일**: 2026-03-22 00:30 KST
**갱신일**: 2026-03-22 KST — v0.4.3 반영 (DeviceType/SubjectRole 추출, Record extends CreateParams, ListItem = Pick\<Record\>)
**갱신일**: 2026-03-22 KST — v0.4.7 반영 (dead export 정리)
**갱신일**: 2026-03-22 KST — v0.4.8 반영. Socket 도메인: 직접 forward 제거(Redis 단일 경로), pollControlForApp event_stream 변환, query/query_result WS 직접 전달 추가. 축B 메시지 중계 전면 갱신.
