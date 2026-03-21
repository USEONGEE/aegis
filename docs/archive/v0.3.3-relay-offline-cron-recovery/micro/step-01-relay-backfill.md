# Step 01: Relay 오프라인 Cron Backfill 통합

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (relay 3파일 revert)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

### QueueAdapter 확장
- queue-adapter.ts에 `readRange(stream, start, end, count)` 메서드 추가
- redis-queue.ts에 `redis.xrange(stream, start, end, 'COUNT', count)` 구현

### ws.ts backfillChatStream
- `backfillChatStream(userId, sessionId, startId, socket)` 함수 추가
- readRange로 entries 읽기 → sender === 'app' skip → send(socket, ...)
- one-shot: loop 없음, 1회 실행 후 종료

### ws.ts authenticate 확장
- `msg.payload?.chatCursors` 파싱
- 각 세션에 대해 `backfillChatStream(userId, sid, cursor, socket)` 호출

### ws.ts subscribe_chat 핸들러
- `msg.type === 'subscribe_chat'` 분기 추가
- `backfillChatStream(userId, sessionId, '0', socket)` 호출

## 2. 완료 조건
- [ ] queue-adapter.ts에 readRange 메서드 시그니처 존재
- [ ] redis-queue.ts에 redis.xrange 기반 readRange 구현
- [ ] ws.ts에 backfillChatStream(userId, sessionId, startId, socket) 함수 존재
- [ ] backfillChatStream이 readRange 1회 호출 후 종료 (loop 없음)
- [ ] authenticate에서 chatCursors 파싱 + per-session backfill
- [ ] subscribe_chat 핸들러에서 backfillChatStream('0') 호출
- [ ] relay tsc 스냅샷 diff: 변경 전후 비교하여 신규 에러 0
- [ ] 기존 pollControlForApp/handleDaemonConnection 미변경
- [ ] readRange unit test (chat-backfill.test.ts): XRANGE 동작 검증 3 tests pass
- [ ] ws.ts 코드 검사: authenticate chatCursors → backfillChatStream + subscribe_chat → backfillChatStream 호출 체인 존재

## 3. 롤백 방법
- `git checkout -- packages/relay/src/queue/queue-adapter.ts packages/relay/src/queue/redis-queue.ts packages/relay/src/routes/ws.ts`

---

## Scope

### 수정 대상 파일
```
packages/relay/
├── src/queue/queue-adapter.ts  # readRange 메서드 추가
├── src/queue/redis-queue.ts    # readRange XRANGE 구현
└── src/routes/ws.ts            # backfillChatStream + authenticate chatCursors + subscribe_chat
```

### 신규 생성 파일
```
packages/relay/
└── tests/chat-backfill.test.ts  # F9: authenticate chatCursors + subscribe_chat integration test
```

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| queue-adapter.ts | readRange 메서드 인터페이스 | ✅ OK |
| redis-queue.ts | readRange XRANGE 구현 | ✅ OK |
| ws.ts | backfillChatStream + authenticate chatCursors + subscribe_chat | ✅ OK |
| chat-backfill.test.ts | F9 integration test | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| readRange 인터페이스 | ✅ queue-adapter.ts | OK |
| readRange XRANGE 구현 | ✅ redis-queue.ts | OK |
| backfillChatStream 함수 | ✅ ws.ts | OK |
| authenticate chatCursors 파싱 | ✅ ws.ts | OK |
| subscribe_chat 핸들러 | ✅ ws.ts | OK |
| integration test (F9) | ✅ chat-backfill.test.ts | OK |

### 검증 통과: ✅
