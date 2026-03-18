# Step 28: relay - Redis Streams Queue

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 26

---

## 1. 구현 내용 (design.md 기반)

Redis Streams 기반 QueueAdapter 추상 인터페이스 + RedisQueue 구현.

- `src/queue/queue-adapter.js`: QueueAdapter 추상 인터페이스 (publish, subscribe, ack, getFromCursor)
- `src/queue/redis-queue.js`: Redis Streams 구현 (ioredis)

**두 가지 큐**:
1. `control_channel` — user 스코프. SignedApproval 등 typed envelope 전달. 키: `control:{userId}`
2. `chat_queue` — session 스코프. 사용자 ↔ OpenClaw 대화. 키: `chat:{userId}:{sessionId}`

**Redis Streams 사용 패턴**:
- `XADD`: 메시지 추가
- `XREAD BLOCK`: 실시간 수신 (consumer)
- `XACK`: 메시지 확인 (consumer group)
- `XRANGE`: cursor 이후 메시지 조회 (재연결 시)
- `XTRIM MAXLEN ~`: TTL 관리 (24시간)

**온라인 상태 관리**:
- `SET user:{userId}:online EX 30` + heartbeat

## 2. 완료 조건
- [ ] `src/queue/queue-adapter.js`에서 QueueAdapter 추상 인터페이스 정의 (publish, subscribe, ack, getFromCursor, setOnline, isOnline)
- [ ] `src/queue/redis-queue.js`에서 RedisQueue가 QueueAdapter를 구현
- [ ] `publish(channel, message)` → XADD로 메시지 추가, Stream ID 반환
- [ ] `subscribe(channel, callback, fromId?)` → XREAD BLOCK으로 실시간 수신
- [ ] `ack(channel, group, messageId)` → XACK로 메시지 확인
- [ ] `getFromCursor(channel, cursorId)` → XRANGE로 cursor 이후 메시지 조회
- [ ] control_channel 키 패턴: `control:{userId}`
- [ ] chat_queue 키 패턴: `chat:{userId}:{sessionId}`
- [ ] `setOnline(userId)` → `SET user:{userId}:online EX 30`
- [ ] `isOnline(userId)` → 온라인 여부 boolean 반환
- [ ] TTL 관리: XTRIM으로 최대 보관량 제한
- [ ] `npm test -- packages/relay` 통과 (RedisQueue 통합 테스트)

## 3. 롤백 방법
- `src/queue/` 디렉토리 삭제

---

## Scope

### 신규 생성 파일
```
packages/relay/
  src/queue/
    queue-adapter.js               # 추상 인터페이스
    redis-queue.js                 # Redis Streams 구현
  tests/
    redis-queue.test.js            # RedisQueue 통합 테스트
```

### 수정 대상 파일
```
없음
```

### Side Effect 위험
- Redis 연결 필요 (docker-compose의 redis 서비스)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| queue-adapter.js | 추상 인터페이스 | ✅ OK |
| redis-queue.js | Redis Streams 구현 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| XADD/XREAD/XACK 구현 | ✅ redis-queue.js | OK |
| control_channel 패턴 | ✅ redis-queue.js | OK |
| chat_queue 패턴 | ✅ redis-queue.js | OK |
| 온라인 상태 관리 | ✅ redis-queue.js | OK |
| TTL/XTRIM | ✅ redis-queue.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 29: relay - WebSocket 서버](step-29-ws-server.md)
