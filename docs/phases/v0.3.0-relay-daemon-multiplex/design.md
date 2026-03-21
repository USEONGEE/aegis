# 설계 - v0.3.0

## 변경 규모
**규모**: 운영 리스크
**근거**: DB 스키마 변경 (daemons + daemon_users + refresh_tokens 테이블), 인증 모델 변경 (daemon JWT + Google OAuth + refresh token), 3개 패키지 수정 (relay + daemon + app), wire protocol 변경

---

## 문제 요약
relay가 user:daemon = 1:1 바인딩 + 부트스트랩 인증이 수동/미완성. daemon 멀티플렉싱과 자동화된 인증 흐름이 필요.

> 상세: [README.md](README.md) 참조

## 접근법

**Daemon-Centric ConnectionBucket + Device Enrollment Flow**:

1. daemon을 독립 엔티티로 도입, 단일 WS에서 N명의 user 메시지를 멀티플렉싱
2. Device Enrollment Flow로 daemon↔user 바인딩 (user 승인 기반)
3. App은 Google OAuth (PKCE)로 로그인
4. Refresh token 기반 daemon/app 자동 갱신

## 대안 검토

### 멀티플렉싱 방식

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: Daemon-Centric ConnectionBucket | daemon이 1급 엔티티, 단일 WS/heartbeat, DB 기반 매핑, 감사 가능 | 새 테이블 + 인증 엔드포인트 추가 | ✅ |
| B: JWT 기반 Virtual Channel | DB 변경 없음 | JWT 크기 증가, 영속 매핑 없음, PRD 결정 위반 | ❌ |
| C: Sidecar Proxy | relay 변경 0 | N개 연결 유지 (목적 불달성), Primitive First 위반 | ❌ |

### Daemon 등록 방식 (bind 권한)

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: daemon self-bind (daemon JWT만으로) | 단순 | daemon이 아무 user 선점 가능. 보안 결함 | ❌ |
| B: Device Enrollment (user 승인 필수) | user 동의 기반, UX 자연스러움 (QR 스캔) | enrollment flow 구현 필요 | ✅ |
| C: 운영자 전용 API | 강력한 통제 | self-service 불가, 확장 불가 | ❌ |

**선택 이유**: B — user가 App에서 QR 스캔/승인 시에만 바인딩 생성. daemon이 일방적으로 user를 claim 불가. Google OAuth 기각 이유: UX 과다 (웹 로그인→토큰 복사→env 수정→재시작), clipboard 보안 노출.

## 기술 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| daemon identity | `daemons` 테이블 (id, secret_hash, created_at) | daemon은 user와 별개의 1급 엔티티 |
| daemon-user 매핑 | `daemon_users(daemon_id, user_id)` + `UNIQUE(user_id)` | 1 user : 1 daemon을 DB 레벨에서 강제 |
| bind 메커니즘 | Device Enrollment Flow — user 승인 필수 | daemon 일방 claim 방지 |
| App 인증 | Google OAuth (PKCE) → relay user 자동 생성/로그인 | 기존 수동 register/login 대체 |
| JWT 역할 분리 | App: `{ sub: userId, role: 'app', deviceId }`, Daemon: `{ sub: daemonId, role: 'daemon' }` | 역할 구분. App JWT에 deviceId 포함 (device-scoped) |
| Refresh token | daemon/app 모두 refresh token 기반 access JWT 갱신 | 수동 토큰 재설정 제거 |
| wire: daemon↔relay | 모든 메시지에 `userId` 필드 필수. relay가 daemon_users로 소유권 검증 | 암묵적 바인딩 제거 |
| wire: app→relay | 변경 없음 (userId는 소켓 인증에서 추출) | app WS 프로토콜 호환 |
| heartbeat | `online:daemon:{daemonId}` 단일 키 | user별 heartbeat 제거 |
| stream 키 | 변경 없음: `control:{userId}`, `chat:{userId}:{sessionId}` | 데이터 마이그레이션 불필요 |
| stream polling | **multi-stream XREAD**: 하나의 blocking call로 daemon의 모든 **control** stream을 동시에 읽음. chat stream은 resume하지 않음 (아래 reconnect 정책 참조) | per-user blocking connection 불필요 |
| reconnect 정책 | daemon 재연결 시 **control stream만 resume**. chat backlog는 replay하지 않음. chat stream은 해당 session에 새 메시지가 도착할 때 자연스럽게 재개 | chat 대화 맥락은 daemon 메모리에 있어서 재시작 시 새 대화. control(approval/policy)은 critical이므로 반드시 replay |
| sessionId 유일성 | daemon 내부 message queue key를 `(userId, sessionId)` 복합키로 변경 | sessionId 전역 유일성에 의존하지 않음. 현재 app이 timestamp 기반 문자열 사용하므로 복합키가 안전 |
| E2E 암호화 | daemon에서 `Map<userId, Uint8Array>` per-user 세션키 관리. Relay 인증과 분리 | 각 user의 E2E pairing은 독립 |
| WS 인증 확인 | `authenticated` 응답 대기 후 연결 성공 처리. 인증 실패 시 소켓 강제 종료 | 기존 버그 수정 |

---

## 아키텍처 개요

```
  ┌──────────────────────────────────────────────────────────┐
  │                       Relay Server                        │
  │                                                          │
  │  ┌─────────────┐   ┌───────────────┐   ┌──────────────┐ │
  │  │ Auth Routes  │   │  WS Routes    │   │  Push Routes │ │
  │  │             │   │              │   │              │ │
  │  │ POST /oauth │   │ /ws/daemon   │   │ POST /push   │ │
  │  │ POST /enroll│   │ /ws/app      │   │              │ │
  │  │ POST /d/login│  │              │   │              │ │
  │  └──────┬──────┘   └──────┬───────┘   └──────────────┘ │
  │         │                 │                              │
  │  ┌──────▼─────────────────▼───────────────────────────┐  │
  │  │              Registry (PostgreSQL)                  │  │
  │  │  users | daemons | daemon_users | devices | sessions│ │
  │  └───────────────────────────────────────────────────┘  │
  │                                                          │
  │  ┌────────────────────────────────────────────────────┐  │
  │  │              Queue (Redis Streams)                  │  │
  │  │  control:{userId} | chat:{userId}:{sessionId}      │  │
  │  │  online:daemon:{daemonId}                          │  │
  │  └────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────┘

  연결 자료구조:
    daemonSockets: Map<daemonId, { socket, userIds: Set<string>, pollerAbort: AbortController }>
    userToDaemon:  Map<userId, daemonId>
    appBuckets:    Map<userId, Set<WebSocket>>
```

## 데이터 흐름

### Device Enrollment Flow (daemon ↔ user 바인딩)

```
1. Daemon 첫 실행
   → POST /api/auth/daemon/register { daemonId, secret }
   → 201 { daemonId }

2. Daemon 인증
   → POST /api/auth/daemon/login { daemonId, secret }
   → 200 { token: <daemon JWT>, refreshToken }

3. Daemon이 enrollment 요청
   → POST /api/auth/daemon/enroll (daemon JWT)
   → 200 { enrollmentCode: "ABCD-1234", expiresIn: 300 }
   → Daemon이 터미널에 QR 코드 또는 device code 표시

4. User가 App에서 QR 스캔 / device code 입력
   → POST /api/auth/enroll/confirm (app JWT + enrollmentCode)
   → Relay: daemon_users INSERT (daemon_id, user_id)
   → 200 { daemonId, userId, bound: true }

5. Relay → Daemon WS: { type: 'user_bound', userId }
   → Daemon이 해당 user의 stream polling 시작
```

### App → Daemon (chat)
```
App(alice) → ws.send({ type:'chat', sessionId:'s1', payload:{...} })
  → relay: userId = 'alice' (from socket auth)
  → relay: daemonId = userToDaemon.get('alice')
  → relay: queue.publish('chat:alice:s1', { sender:'app', ... })
  → relay: forward to daemonSockets[daemonId].socket
           with { type:'chat', userId:'alice', sessionId:'s1', payload:{...} }
```

### Daemon → App (chat)
```
Daemon → ws.send({ type:'chat', userId:'alice', sessionId:'s1', payload:{...} })
  → relay: validate daemon owns 'alice' (daemon_users check)
  → relay: queue.publish('chat:alice:s1', { sender:'daemon', ... })
  → relay: forward to appBuckets['alice']
  → relay: if no apps online → push notification
```

### Daemon authenticate (WS)
```
Daemon → ws.send({ type:'authenticate', payload:{ token:<daemon JWT>, lastControlIds:{ alice:'$', bob:'1234-0' } } })
  → relay: verifyToken → { sub:'d1', role:'daemon' }
  → relay: load daemon_users WHERE daemon_id = 'd1' → ['alice', 'bob']
  → relay: register daemonSockets['d1'] = { socket, userIds }
  → relay: set userToDaemon['alice'] = 'd1', userToDaemon['bob'] = 'd1'
  → relay: start multi-stream XREAD poller (control streams only, per-user cursors)
  → relay: send { type:'authenticated', daemonId:'d1', userIds:['alice','bob'] }
```
Note: chat stream은 resume하지 않음. 새 chat 메시지가 도착하면 즉시 forward.

## API/인터페이스 계약

### App 인증

```
POST /api/auth/google
  Body: { idToken: string }  (Google OAuth PKCE로 얻은 ID token)
  Response: 200 { userId, token: <app JWT>, refreshToken }
  Note: user가 없으면 자동 생성

POST /api/auth/refresh
  Body: { refreshToken: string }
  Response: 200 { token: <new JWT>, refreshToken: <new refreshToken> }
```

### Daemon 인증

```
POST /api/auth/daemon/register
  Body: { daemonId: string, secret: string }
  Response: 201 { daemonId }

POST /api/auth/daemon/login
  Body: { daemonId: string, secret: string }
  Response: 200 { daemonId, token: <daemon JWT>, refreshToken }

POST /api/auth/refresh          (daemon/app 공용 — role 자동 판별)
  Body: { refreshToken: string }
  Response: 200 { token: <new JWT>, refreshToken }
```

### Device Enrollment

```
POST /api/auth/daemon/enroll   (daemon JWT)
  Response: 200 { enrollmentCode: "ABCD-1234", expiresIn: 300 }

POST /api/auth/enroll/confirm  (app JWT)
  Body: { enrollmentCode: string }
  Response: 200 { daemonId, userId, bound: true }
  Error: 409 if user already bound to another daemon

POST /api/auth/daemon/unbind   (daemon JWT)
  Body: { userIds: string[] }
  Response: 200 { unbound: string[] }
```

### WS 메시지 포맷 (daemon ↔ relay)

**모든 control/chat 메시지에 `userId` 필수:**
```json
{ "type": "chat", "userId": "alice", "sessionId": "s1", "payload": {...} }
{ "type": "control", "userId": "alice", "payload": {...} }
```

**authenticate:**
```json
{ "type": "authenticate", "payload": { "token": "<daemon JWT>", "lastControlIds": { "alice": "$", "bob": "1234-0" } } }
```
`lastControlIds`: user별 control stream 커서. chat stream은 resume하지 않으므로 커서 불필요.

**heartbeat (변경 없음):**
```json
{ "type": "heartbeat" }
```
→ `online:daemon:{daemonId}` (per-daemon, not per-user)

**서버 → daemon 이벤트:**
```json
{ "type": "user_bound", "userId": "charlie" }
{ "type": "user_unbound", "userId": "charlie" }
```

### WS 인증 확인 수정

daemon/app 모두: `ws.open` 이벤트 후 `authenticate` 전송 → `authenticated` 응답 대기 → 타임아웃 시 reconnect. 인증 실패 시 relay가 소켓 강제 종료 (기존: 에러만 보내고 소켓 유지 → 수정).

## 데이터 모델/스키마

```sql
-- Daemon entity
CREATE TABLE IF NOT EXISTS daemons (
  id            TEXT        PRIMARY KEY,
  secret_hash   TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daemon-User mapping (N users : 1 daemon)
CREATE TABLE IF NOT EXISTS daemon_users (
  daemon_id     TEXT        NOT NULL REFERENCES daemons(id) ON DELETE CASCADE,
  user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bound_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (daemon_id, user_id),
  UNIQUE (user_id)  -- 1 user : 1 daemon 강제
);

CREATE INDEX IF NOT EXISTS idx_daemon_users_daemon_id ON daemon_users(daemon_id);

-- Refresh tokens (daemon + app 공용)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            TEXT        PRIMARY KEY,
  subject_id    TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('daemon', 'app')),
  device_id     TEXT,       -- app: 디바이스별 토큰 관리. daemon: NULL
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_subject ON refresh_tokens(subject_id, role);

-- Enrollment codes (short-lived)
CREATE TABLE IF NOT EXISTS enrollment_codes (
  code          TEXT        PRIMARY KEY,
  daemon_id     TEXT        NOT NULL REFERENCES daemons(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ
);
```

## 테스트 전략

| 레벨 | 범위 | 방법 |
|------|------|------|
| Unit | RegistryAdapter daemon CRUD, enrollment CRUD | Jest mock DB |
| Unit | JWT role discrimination, verifyToken | 단위 테스트 |
| Unit | multi-stream XREAD poller | Redis mock |
| Integration | daemon register/login/enroll/confirm API | Fastify inject |
| Integration | WS daemon auth + multi-user routing | WS client mock |
| Integration | refresh token 갱신 flow | Fastify inject |
| E2E | Device Enrollment: daemon enroll → app confirm → bound | 실제 WS + HTTP |

---

## 실패/에러 처리

| 시나리오 | 처리 |
|---------|------|
| daemon이 소유하지 않은 userId로 메시지 전송 | `{ type: 'error', message: 'Unauthorized userId' }` + 메시지 드롭 |
| enrollment code 만료 | 404 → daemon이 새 코드 요청 |
| bind 시 userId가 이미 다른 daemon에 귀속 | 409 Conflict |
| daemon disconnect | stream poller 중지, 매핑 유지 (영속) |
| daemon이 없는 상태에서 app이 control 전송 | Redis stream에 기록, daemon 재연결 시 control poll로 수신 (durable) |
| daemon이 없는 상태에서 app이 chat 전송 | Redis stream에 기록되지만 daemon 재연결 시 replay하지 않음 (ephemeral). app이 daemon offline 상태를 감지하고 재시도 UX 제공 |
| WS 인증 실패 | `{ type: 'error' }` + 소켓 강제 종료 (기존 버그 수정) |
| refresh token 만료/revoke | 401 → daemon은 재인증 필요 (enroll 재시작) |
| Google OAuth token 검증 실패 | 401 |

## 보안/권한

| 항목 | 설계 |
|------|------|
| daemon 인증 | secret 기반 (hashPassword/verifyPassword 재사용) |
| App 인증 | Google OAuth (PKCE) → ID token 검증 → relay user 생성/로그인 |
| JWT 구분 | `role` 필드: 'daemon' / 'app'. verifyToken이 role 반환 |
| bind 권한 | Device Enrollment: user가 App에서 승인해야만 바인딩 생성. daemon 단독 불가 |
| 메시지 소유권 | daemon 메시지의 userId를 daemon_users로 검증 |
| E2E | relay는 payload를 읽지 못함 (기존과 동일). Relay 인증과 E2E는 분리 |
| refresh token | DB 저장, revoke 가능, 만료 시간 설정 |
| enrollment code | 5분 만료, 1회 사용, 짧은 코드 (brute-force 어려움) |

## 성능/스케일

| 항목 | 현재 (1:1) | 이후 (N:1) | 비고 |
|------|-----------|-----------|------|
| WS 연결 수 | N daemon 연결 | 1 daemon 연결 | 대폭 감소 |
| Redis blocking conn | N (user별) | 1 (multi-stream XREAD) | 대폭 감소 |
| heartbeat | N keys | 1 key per daemon | 대폭 감소 |

**multi-stream XREAD**: Redis `XREAD BLOCK 5000 STREAMS control:alice control:bob $ $` — 하나의 blocking call로 daemon의 모든 **control** stream을 동시에 읽음. chat stream은 poller 대상이 아님 (즉시 forward만). user 추가/제거 시 poller 재시작.

**chat/control 내구성 정책**: control = durable (stream 기록 + reconnect resume), chat = ephemeral (stream 기록되지만 reconnect 시 replay 안 함, 즉시 forward만).

## 리스크/오픈 이슈

1. **Google OAuth 의존성**: App에 Google Sign-In SDK 추가 필요. Expo 환경에서 @react-native-google-signin 통합
2. **E2E 키 관리**: daemon이 user별 session key를 관리해야 함 — pairing flow 확장 필요
3. **기존 daemon 마이그레이션**: RELAY_TOKEN → DAEMON_ID + DAEMON_SECRET 전환 필수
4. **multi-stream XREAD 동적 업데이트**: user가 runtime에 bind/unbind되면 XREAD stream 목록 변경 필요 → poller 재시작

## 롤아웃/롤백 계획

N/A: 개발 단계. Breaking change 허용.

## 관측성

N/A: 개발 단계. Fastify 기본 로깅으로 충분. enrollment/bind/unbind 이벤트는 info 레벨.
