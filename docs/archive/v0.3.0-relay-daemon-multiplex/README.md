# Relay Daemon Multiplex + Bootstrap Auth — v0.3.0

## 문제 정의

### 현상

#### A. Relay 1:1 바인딩

Relay 서버가 daemon과 user를 1:1로 바인딩한다.

- WebSocket 연결이 `userId` 단위: `ConnectionBucket = { daemon: WebSocket | null, apps: Set<WebSocket> }`
- daemon이 authenticate하면 단일 `userId`에 묶임 (`userId = payload.sub`)
- 스트림 키가 `control:{userId}`, `online:{userId}`로 user 단위
- DB `devices` 테이블에서 device가 단일 user에 속함 (`user_id REFERENCES users(id)`)

결과적으로, 1개의 daemon이 100명의 user를 서빙하려면 **100개의 WebSocket 연결**을 열어야 한다.

#### B. 부트스트랩 인증 미완성

Daemon↔Relay 연결의 부트스트랩이 완전히 수동이다.

1. **수동 토큰 설정**: curl로 register → JWT 복사 → Daemon env에 붙여넣기 → Daemon 시작
2. **토큰 갱신 불가**: JWT 7일 만료 후 Daemon이 자체 재인증 수단 없음
3. **인증 성공 확인 누락**: App/Daemon 모두 WS `open` 이벤트만으로 연결 성공 처리. `authenticated` 응답을 기다리지 않음 → 토큰 만료 시 "연결된 것처럼 보이지만 인증 안 된 상태" (ws.ts:121, relay-client.ts:244, RelayClient.ts:143)
4. **Pairing 미완성**: `PairingService`가 auth token 없이 연결 시도하는데 Relay는 토큰 요구 → 실제로 동작하지 않는 코드 (PairingService.ts:120, index.ts:63 pairing session이 항상 null)

### 원인

Relay 설계 시 guarded-wdk/daemon의 다대일 모델을 반영하지 않았고, 부트스트랩 인증을 수동 프로세스로 남겨두었다.

- **guarded-wdk**: `trustedApprovers: string[]`로 N개의 signer가 1개의 daemon에 등록
- **daemon**: `ChatMessage.userId`로 여러 user의 메시지를 처리하는 구조
- **relay**: user:daemon = 1:1로 설계됨. daemon 자체 identity 없음
- **인증**: App과 Daemon이 동일한 `{ sub: userId }` JWT를 사용하여 역할 구분 불가

### 영향

1. **확장 불가**: daemon이 user 수만큼 WS 연결을 유지해야 함
2. **인증 모델 불일치**: daemon은 user의 JWT로 인증해야 함 — daemon 자체의 identity가 없음
3. **수동 개입 필수**: daemon 시작마다 토큰 수동 복사. 7일마다 재설정 필요
4. **연결 신뢰 불가**: 인증 실패해도 소켓이 열려 있어 메시지 유실 가능
5. **pairing 불가**: App↔Daemon pairing이 실제로 동작하지 않음
6. **guarded-wdk/daemon과의 아키텍처 불일치**: 다른 레이어는 N:1을 전제하는데 relay만 1:1

### 목표

1. **daemon 엔티티 도입**: relay에 daemon을 독립 엔티티로 등록하고, daemon ↔ user 매핑을 별도 테이블(`daemon_users`)로 관리
2. **단일 WS로 멀티플렉싱**: 1개의 daemon WS 연결로 N명의 user 메시지를 송수신. 메시지에 `userId`를 명시적으로 포함
3. **Device Enrollment Flow**: daemon 첫 실행 시 QR/device code 표시 → App에서 스캔/승인 → daemon_users 바인딩 + credential 발급. 수동 토큰 복사 제거
4. **App Google OAuth (PKCE) 로그인**: App에서 Google OAuth로 인증 → relay user 자동 생성/로그인
5. **JWT 역할 분리**: App JWT(`role: 'app'`, sub: userId), Daemon JWT(`role: 'daemon'`, sub: daemonId)로 구분
6. **Refresh token 기반 자동 갱신**: daemon이 자체적으로 access token 갱신. 수동 개입 없이 영구 연결
7. **WS 인증 확인 수정**: `authenticated` 응답 대기 후 연결 성공 처리. 인증 실패 시 소켓 강제 종료

### 비목표 (Out of Scope)

- **guarded-wdk 변경**: guarded-wdk의 signer/trustedApprovers 모델은 이미 N:1을 지원하므로 변경 불필요
- **daemon 내부 비즈니스 로직 변경**: daemon의 chat-handler, tool-surface 등 내부 로직은 변경하지 않음
- **1 user : N daemon**: 한 user가 여러 daemon에 귀속되는 구조는 다루지 않음
- **Redis/PG 마이그레이션 자동화**: 스키마 변경은 하되, 기존 데이터 마이그레이션 스크립트는 범위 밖
- **E2E 암호화 키 교환**: App↔Daemon E2E 신뢰 수립은 기존 QR/SAS 페어링 용도로 유지. Relay 인증과 분리

### 범위 내 (In Scope) — 명시

- **relay 서버**: 핵심 변경 대상. DB 스키마, 인증 엔드포인트, WS 라우팅, stream polling, enrollment flow
- **daemon relay-client**: relay WS 프로토콜 변경에 맞춰 연결/인증/메시지 로직 조정
- **relay ↔ daemon 메시지에 userId 명시**: 양방향 멀티플렉스 메시지에 userId 명시적 포함
- **App 인증**: Google OAuth (PKCE) 로그인 + relay user 자동 생성
- **App RelayClient**: WS 인증 확인 로직 수정 (authenticated 응답 대기)

### daemon-user 매핑 규칙

1. **Source of truth**: 별도 `daemon_users` 관계 테이블
2. **카디널리티**: 1 user는 정확히 1 daemon에만 귀속 (N users : 1 daemon)
3. **바인딩 방법**: Device Enrollment Flow — user가 App에서 QR 스캔/승인 시 relay가 daemon_users 생성. daemon이 일방적으로 user를 claim 불가
4. **재연결**: 동일 daemon이 재연결하면 기존 매핑 유지. 다른 daemon이 동일 user를 claim하면 거부
5. **해제**: daemon disconnect 시 매핑은 유지 (영속). 명시적 해제(revoke) 시에만 삭제. 해제 권한: daemon 자신 또는 운영자

### QR/SAS 페어링 역할 분리

- **Relay 인증**: Device Enrollment Flow가 담당 (daemon ↔ relay 연결 수립)
- **E2E 암호화**: 기존 QR/SAS 페어링은 App↔Daemon E2E 신뢰 수립 용도로만 유지
- 두 관심사를 혼합하지 않음

## 제약사항

- Relay의 외부 의존성 (Fastify, Redis, PostgreSQL, Expo) 변경 없음
- Breaking change 허용 (프로젝트 원칙)
- "Google OAuth + token 복사" 방식은 기각됨 — 대안 불가
