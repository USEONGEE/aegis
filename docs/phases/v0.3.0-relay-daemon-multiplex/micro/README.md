# 작업 티켓 - v0.3.0

## 전체 현황

| # | Step | 난이도 | 롤백 | 개발 | 완료일 |
|---|------|--------|------|------|--------|
| 01 | DB 스키마 | 🟢 | ✅ | ⏳ | - |
| 02 | RegistryAdapter 확장 | 🟡 | ✅ | ⏳ | - |
| 03 | JWT 역할 분리 + Refresh Token | 🟡 | ✅ | ⏳ | - |
| 04 | Daemon 인증 API | 🟡 | ✅ | ⏳ | - |
| 05 | Device Enrollment API | 🟠 | ✅ | ⏳ | - |
| 06 | App Google OAuth API | 🟠 | ✅ | ⏳ | - |
| 07 | WS 연결 구조 변경 | 🔴 | ✅ | ⏳ | - |
| 08 | WS Stream Polling + Events | 🔴 | ✅ | ⏳ | - |
| 09 | Daemon relay-client 수정 | 🟠 | ✅ | ⏳ | - |
| 10 | App 인증 + Enrollment UX | 🟠 | ✅ | ⏳ | - |

## 의존성

```
01 → 02 → 03 → 04 → 05
                03 → 06
          03 + 04 → 07 → 08
                07 + 08 → 09
     05 + 06 + 07 → 10
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 1. daemon 엔티티 도입 + daemon_users | 01, 02, 05 | ✅ |
| 2. 단일 WS 멀티플렉싱 | 07, 08, 09 | ✅ |
| 3. Device Enrollment Flow | 05, 10 | ✅ |
| 4. App Google OAuth | 06, 10 | ✅ |
| 5. JWT 역할 분리 | 03 | ✅ |
| 6. Refresh token 자동 갱신 | 03, 04, 09, 10 | ✅ |
| 7. WS 인증 확인 수정 | 07, 09, 10 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1 daemon register | 04 | ✅ |
| F2 daemon login | 04 | ✅ |
| F3 daemon JWT role | 03 | ✅ |
| F4 daemon refresh | 03, 04 | ✅ |
| F5 Google OAuth | 06 | ✅ |
| F6 App JWT deviceId | 03, 06 | ✅ |
| F7 공용 refresh | 03 | ✅ |
| F8 enrollment code | 05 | ✅ |
| F9 enrollment confirm | 05 | ✅ |
| F10 만료 code | 05 | ✅ |
| F11 중복 bind | 05 | ✅ |
| F12 unbind | 05 | ✅ |
| F13 UNIQUE(user_id) | 01 | ✅ |
| F14 daemon WS auth | 07 | ✅ |
| F15 daemon→app forward | 07 | ✅ |
| F16 unauthorized userId | 07 | ✅ |
| F17 app→daemon forward | 07 | ✅ |
| F18 2+ user 멀티플렉싱 | 07 | ✅ |
| F19 heartbeat per-daemon | 07 | ✅ |
| F20 control reconnect | 08 | ✅ |
| F21 chat ephemeral | 08 | ✅ |
| F22 WS 인증 실패 소켓 종료 | 07 | ✅ |
| F23 daemon authenticated 대기 | 09 | ✅ |
| F24 user_bound 이벤트 | 08 | ✅ |
| F25 user_unbound 이벤트 | 08 | ✅ |
| F26 App OAuth SecureStore | 10 | ✅ |
| F27 App auto refresh | 10 | ✅ |
| F28 App authenticated 대기 | 10 | ✅ |
| F29 daemon QR 표시 | 10 | ✅ |
| F30 app enrollment UI | 10 | ✅ |
| N1 tsc 통과 | 전체 | ✅ |
| N2 기존 테스트 | 전체 | ✅ |
| N3 DB 마이그레이션 | 01 | ✅ |
| N4 (userId,sessionId) 복합키 | 09 | ✅ |
| E1 daemon 재연결 | 07 | ✅ |
| E2 enrollment 만료 | 05 | ✅ |
| E3 미등록 daemon WS | 07 | ✅ |
| E4 daemon 미연결 chat | 08 | ✅ |
| E5 runtime bind | 08 | ✅ |
| E6 runtime unbind | 08 | ✅ |
| E7 refresh token replay | 03 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| daemons 테이블 | 01, 02 | ✅ |
| daemon_users UNIQUE | 01 | ✅ |
| Device Enrollment | 05 | ✅ |
| App Google OAuth | 06, 10 | ✅ |
| JWT role 분리 | 03 | ✅ |
| Refresh token | 03, 04 | ✅ |
| wire: userId 필수 | 07, 09 | ✅ |
| heartbeat per-daemon | 07 | ✅ |
| multi-stream XREAD | 08 | ✅ |
| control durable / chat ephemeral | 08 | ✅ |
| (userId, sessionId) 복합키 | 09 | ✅ |
| authenticated 대기 | 07, 09, 10 | ✅ |

## Step 상세
- [Step 01: DB 스키마](step-01-db-schema.md)
- [Step 02: RegistryAdapter 확장](step-02-registry-adapter.md)
- [Step 03: JWT 역할 분리 + Refresh Token](step-03-jwt-roles.md)
- [Step 04: Daemon 인증 API](step-04-daemon-auth-api.md)
- [Step 05: Device Enrollment API](step-05-enrollment-api.md)
- [Step 06: App Google OAuth API](step-06-google-oauth.md)
- [Step 07: WS 연결 구조 변경](step-07-ws-connection.md)
- [Step 08: WS Stream Polling + Events](step-08-ws-polling.md)
- [Step 09: Daemon relay-client 수정](step-09-daemon-client.md)
- [Step 10: App 인증 + Enrollment UX](step-10-app-auth.md)
