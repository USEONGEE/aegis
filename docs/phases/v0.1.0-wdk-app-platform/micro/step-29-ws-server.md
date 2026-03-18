# Step 29: relay - WebSocket 서버

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 27 (PgRegistry), Step 28 (RedisQueue)

---

## 1. 구현 내용 (design.md 기반)

@fastify/websocket을 사용한 WebSocket 서버. daemon 연결과 app 연결을 처리하고, 메시지를 올바른 대상에게 라우팅한다.

- `src/routes/ws.js`: WebSocket 업그레이드 핸들러 (daemon + app)
- 연결 관리: userId별 활성 연결 Map 유지
- 메시지 라우팅: control_channel → user 스코프, chat_queue → session 스코프

**daemon 연결** (`/ws/daemon`):
- outbound WebSocket. authenticate 메시지로 인증 후 연결 유지
- control_channel + chat_queue 메시지 수신
- heartbeat (30초 간격)

**app 연결** (`/ws/app`):
- RN App의 WebSocket 연결. 인증 후 실시간 메시지 수신
- control_channel + chat_queue 메시지 송수신

**메시지 라우팅 규칙**:
- control 메시지: user 스코프 → 해당 userId의 daemon에 전달
- chat 메시지: session 스코프 → RedisQueue를 통해 daemon이 polling

## 2. 완료 조건
- [ ] `@fastify/websocket` 플러그인 등록
- [ ] `/ws/daemon` 엔드포인트: daemon WebSocket 연결 수락
- [ ] `/ws/app` 엔드포인트: app WebSocket 연결 수락
- [ ] authenticate 메시지 수신 시 JWT 검증 후 연결을 userId에 매핑
- [ ] 연결별 userId + deviceId + type 추적 (활성 연결 Map)
- [ ] app → control 메시지 → RedisQueue publish (control:{userId}) → daemon WS로 전달
- [ ] app → chat 메시지 → RedisQueue publish (chat:{userId}:{sessionId}) → daemon WS로 전달
- [ ] daemon → chat 응답 → RedisQueue → app WS로 전달
- [ ] daemon → control 응답 (승인 요청 등) → app WS로 전달
- [ ] 연결 종료 시 활성 연결 Map에서 제거
- [ ] heartbeat 미수신 시 연결 정리 (ping/pong)
- [ ] daemon 오프라인 시 메시지는 RedisQueue에 보관 (오프라인 큐)
- [ ] `npm test -- packages/relay` 통과 (WebSocket 라우팅 테스트)

## 3. 롤백 방법
- `src/routes/ws.js` 삭제
- `src/index.js`에서 @fastify/websocket 플러그인 등록 제거

---

## Scope

### 신규 생성 파일
```
packages/relay/
  src/routes/
    ws.js                          # WebSocket 핸들러 (daemon + app)
  tests/
    ws-server.test.js              # WebSocket 라우팅 테스트
```

### 수정 대상 파일
```
packages/relay/src/index.js        # @fastify/websocket 플러그인 등록 + ws 라우트 등록
packages/relay/package.json        # @fastify/websocket 의존성 추가 (이미 Step 26에서 추가했을 수 있음)
```

### Side Effect 위험
- index.js 수정 — 기존 health check에 영향 없음
- Redis + PostgreSQL 연결 필요

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| routes/ws.js | daemon + app WebSocket 핸들러 | ✅ OK |
| index.js 수정 | 플러그인 + 라우트 등록 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| daemon 연결 (/ws/daemon) | ✅ ws.js | OK |
| app 연결 (/ws/app) | ✅ ws.js | OK |
| 메시지 라우팅 | ✅ ws.js | OK |
| 활성 연결 관리 | ✅ ws.js | OK |
| 오프라인 큐 | ✅ ws.js + RedisQueue | OK |
| heartbeat/ping-pong | ✅ ws.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 30: relay - 인증 + 라우팅](step-30-auth-routing.md)
