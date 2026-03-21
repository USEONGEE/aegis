# DoD (Definition of Done) - v0.3.0

## 기능 완료 조건

### Daemon 엔티티 + 인증

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `POST /api/auth/daemon/register { daemonId, secret }` → 201 `{ daemonId }`. 중복 daemonId → 409 | integration test: Fastify inject |
| F2 | `POST /api/auth/daemon/login { daemonId, secret }` → 200 `{ daemonId, token, refreshToken }`. 잘못된 secret → 401 | integration test |
| F3 | daemon JWT에 `{ sub: daemonId, role: 'daemon' }` 포함. `verifyToken(token)` 결과에 role 반환 | unit test: verifyToken |
| F4 | `POST /api/auth/refresh { refreshToken }` → 200 `{ token, refreshToken }` (daemon/app 공용). 만료/revoke된 token → 401 | integration test |

### App 인증 (Google OAuth)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F5 | `POST /api/auth/google { idToken }` → 200 `{ userId, token, refreshToken }`. user가 없으면 자동 생성 | integration test (Google idToken mock) |
| F6 | App JWT에 `{ sub: userId, role: 'app', deviceId }` 포함 | unit test: verifyToken |
| F7 | `POST /api/auth/refresh { refreshToken }` → app/daemon 공용. role에 맞는 JWT 반환 | integration test |

### Device Enrollment

| # | 조건 | 검증 방법 |
|---|------|----------|
| F8 | `POST /api/auth/daemon/enroll` (daemon JWT) → 200 `{ enrollmentCode, expiresIn: 300 }` | integration test |
| F9 | `POST /api/auth/enroll/confirm` (app JWT + enrollmentCode) → 200 `{ daemonId, userId, bound: true }`. `daemon_users` 행 생성됨 | integration test + DB 확인 |
| F10 | 만료된 enrollmentCode → 404. 이미 사용된 code → 404 | integration test |
| F11 | userId가 이미 다른 daemon에 바인딩 → 409 Conflict | integration test |
| F29 | daemon: enrollment 성공 시 enrollmentCode를 터미널에 QR 코드 또는 텍스트로 표시 | manual test: daemon 실행 → 터미널 출력 확인 |
| F30 | app: enrollmentCode 입력 UI 제공 (QR 스캔 또는 수동 입력) → confirm API 호출 → 성공 시 바인딩 완료 표시 | manual test: app에서 코드 입력 → 결과 확인 |

### Daemon-User 매핑

| # | 조건 | 검증 방법 |
|---|------|----------|
| F12 | `POST /api/auth/daemon/unbind { userIds }` (daemon JWT) → 200 `{ unbound }`. `daemon_users` 행 삭제됨 | integration test + DB 확인 |
| F13 | `daemon_users` 테이블에 `UNIQUE(user_id)` 제약. 다른 daemon이 동일 user bind → DB 에러 | SQL 제약 조건 확인 |

### WS 멀티플렉싱

| # | 조건 | 검증 방법 |
|---|------|----------|
| F14 | daemon이 `/ws/daemon`에 daemon JWT로 authenticate → `{ type: 'authenticated', daemonId, userIds }` 수신 | WS integration test |
| F15 | daemon이 `{ type: 'chat', userId: 'alice', sessionId, payload }` 전송 → relay가 `appBuckets['alice']`로 forward | WS integration test |
| F16 | daemon이 소유하지 않은 userId로 메시지 전송 → `{ type: 'error', message: 'Unauthorized userId' }` | WS integration test |
| F17 | app이 `{ type: 'chat', sessionId, payload }` 전송 → relay가 daemon 소켓에 `userId` 포함하여 forward | WS integration test |
| F18 | daemon 단일 WS 연결로 2명 이상의 user 메시지를 동시에 송수신 가능 | WS integration test (2+ user 시나리오) |

### Heartbeat

| # | 조건 | 검증 방법 |
|---|------|----------|
| F19 | daemon `{ type: 'heartbeat' }` → `online:daemon:{daemonId}` 키 설정 (per-daemon, not per-user) | Redis 키 확인 |

### Control Reconnect (Durable)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F20 | daemon 재연결 시 `lastControlIds`에 per-user control 커서 전송 → 놓친 control 메시지 수신 | WS integration test (disconnect → 메시지 발행 → reconnect → 수신 확인) |

### Chat Ephemeral 정책

| # | 조건 | 검증 방법 |
|---|------|----------|
| F21 | daemon offline 시 app이 보낸 chat → Redis stream에 기록되지만, daemon 재연결 시 replay 안 됨 | WS integration test (disconnect → chat 발행 → reconnect → 해당 chat 미수신 확인) |

### WS 인증 확인 수정

| # | 조건 | 검증 방법 |
|---|------|----------|
| F22 | WS 인증 실패 시 relay가 소켓 강제 종료 (기존: 에러만 보내고 소켓 유지) | WS test: 잘못된 토큰 → 소켓 close 이벤트 수신 |
| F23 | daemon relay-client: `authenticated` 응답 대기 후 연결 성공 처리. 타임아웃 시 reconnect | unit test: relay-client |

### App-side 인증 라이프사이클

| # | 조건 | 검증 방법 |
|---|------|----------|
| F26 | App: 로그인 성공 후 `{ token, refreshToken }` 을 SecureStore에 저장. Google OAuth는 SDK 설치 후 교체 예정, 현재 dev login으로 동일 flow 동작 | unit test: auth store mock |
| F27 | App: access token 만료 시 refreshToken으로 자동 갱신. 갱신 실패 시 로그인 화면으로 이동 | unit test: RelayClient token refresh flow |
| F28 | App RelayClient: `authenticated` 응답 수신 전까지 `connected = false` 유지. 타임아웃 시 reconnect | unit test: RelayClient auth flow |

### User Bound/Unbound 이벤트

| # | 조건 | 검증 방법 |
|---|------|----------|
| F24 | enrollment confirm 후 daemon WS에 `{ type: 'user_bound', userId }` 수신 | WS integration test |
| F25 | unbind 후 daemon WS에 `{ type: 'user_unbound', userId }` 수신 | WS integration test |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | TypeScript strict 모드 에러 0 (relay, daemon) | `npx tsc --noEmit` |
| N2 | 기존 테스트 통과 (regression 없음) | `npm test` |
| N3 | DB 스키마 마이그레이션 성공 (daemons, daemon_users, refresh_tokens, enrollment_codes) | `registry.migrate()` 실행 후 테이블 존재 확인 |
| N4 | daemon message queue key가 `(userId, sessionId)` 복합키 | `grep` 확인: message-queue.ts에서 queue key가 userId를 포함하는지 검증 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | 동일 daemon이 재연결 (기존 소켓 아직 열림) | 기존 소켓 강제 종료, 새 소켓으로 교체 | WS test |
| E2 | enrollment code 5분 만료 후 confirm 시도 | 404 에러 | integration test |
| E3 | daemon 등록 없이 /ws/daemon 연결 시도 | 인증 실패 → 소켓 종료 | WS test |
| E4 | app이 daemon 미연결 상태에서 chat 전송 | chat이 Redis stream에 기록됨. daemon 연결 후 새 chat은 즉시 forward되지만, E4 시점의 chat은 replay 안 됨 (F21과 동일 정책) | `npm test -- relay/ws` |
| E5 | runtime bind (daemon 연결 중 새 user enrollment) | `user_bound` 이벤트 → poller에 새 user stream 추가 | WS test |
| E6 | runtime unbind (daemon 연결 중 user unbind) | `user_unbound` 이벤트 → poller에서 해당 user stream 제거 | WS test |
| E7 | refresh token 이중 사용 (replay attack) | 두 번째 사용 시 401 + 해당 subject의 모든 refresh token revoke | integration test |

## PRD 목표 ↔ DoD 커버리지

| PRD 목표 | DoD 항목 |
|----------|---------|
| 1. daemon 엔티티 도입 + daemon_users 매핑 | F1, F2, F9, F12, F13, N3 |
| 2. 단일 WS 멀티플렉싱 | F14, F15, F16, F17, F18 |
| 3. Device Enrollment Flow | F8, F9, F10, F11, F24 |
| 4. App Google OAuth | F5, F6, F26 |
| 5. JWT 역할 분리 | F3, F6 |
| 6. Refresh token 자동 갱신 | F4, F7, F27, E7 |
| 7. WS 인증 확인 수정 | F22, F23, F28 |

## 설계 결정 ↔ DoD 반영

| 설계 결정 | DoD 반영 |
|----------|---------|
| daemon_users UNIQUE(user_id) | F13 |
| Device Enrollment (user 승인) | F8, F9, F10, F11 |
| wire: userId 필수 | F15, F16, F17 |
| heartbeat per-daemon | F19 |
| control durable, chat ephemeral | F20, F21 |
| multi-stream XREAD (control only) | F20 |
| (userId, sessionId) 복합키 | N4 |
| App JWT deviceId | F6 |
| WS 인증 실패 시 소켓 종료 | F22 |
| user_bound/unbound 이벤트 | F24, F25, E5, E6 |
