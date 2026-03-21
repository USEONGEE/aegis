# DoD (Definition of Done) - v0.3.3

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | QueueAdapter에 `readRange(stream, start, end, count)` 메서드 존재 | 코드 검사: queue-adapter.ts에 메서드 시그니처 존재 |
| F2 | RedisQueue에 XRANGE 기반 readRange 구현 | 코드 검사: redis-queue.ts에 `redis.xrange()` 호출 존재 |
| F3 | ws.ts에 `backfillChatStream(userId, sessionId, startId, socket)` 함수 존재 | 코드 검사: 함수 시그니처 + readRange 호출 + sender echo 방지 |
| F4 | handleAppConnection authenticate에서 `msg.payload.chatCursors` 파싱 | 코드 검사: chatCursors 변수 할당 존재 |
| F5 | authenticate 시 chatCursors의 각 세션에 대해 `backfillChatStream(userId, sid, cursor, socket)` 호출 | 코드 검사: for..of 루프 + backfillChatStream 호출 |
| F6 | handleAppConnection에 `subscribe_chat` 메시지 핸들러 존재 | 코드 검사: `msg.type === 'subscribe_chat'` 분기 존재 |
| F7 | subscribe_chat 핸들러에서 `backfillChatStream(userId, sessionId, '0', socket)` 호출 | 코드 검사: 호출부 확인 |
| F8 | backfillChatStream이 one-shot (loop 없음, readRange 1회 후 종료) | 코드 검사: while/for-loop 없이 readRange 1회 + entries 순회만 |
| F9a | readRange가 XRANGE로 올바른 entries를 반환 | unit test: chat-backfill.test.ts — mock redis.xrange → readRange 결과 검증 (3 tests pass) |
| F9b | backfillChatStream이 readRange를 호출하고 socket으로 전달하는 경로가 코드상 연결됨 | 코드 검사: ws.ts backfillChatStream → queue.readRange 호출 + send(socket, ...) 확인 |
| F9c | authenticate에서 chatCursors → backfillChatStream, subscribe_chat → backfillChatStream 호출 체인 | 코드 검사: ws.ts authenticate 블록 + subscribe_chat 블록에서 backfillChatStream 호출 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | relay tsc에서 이번 변경으로 인한 신규 에러 미도입 | baseline 스냅샷: `relay-tsc-baseline.txt` (16개 에러, redis-queue 4 + pg-registry.test 12). 변경 후 `cd packages/relay && npx tsc --noEmit 2>&1 \| grep "error TS"` 실행 → baseline과 diff. 새 에러 라인이 없으면 통과 |
| N2 | 기존 pollControlForApp / handleDaemonConnection 동작 미변경 | 코드 검사: 기존 함수 수정 없음 (추가만) |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | chatCursors가 빈 객체 | authenticate 시 backfill 미실행, 정상 진행 | 코드 검사: for..of가 빈 객체에서 skip |
| E2 | subscribe_chat에 존재하지 않는 sessionId | readRange가 빈 배열 반환, 에러 없음 | 코드 검사: entries.length === 0이면 send 미호출 |
| E3 | stale cursor (trim된 ID) | XRANGE가 해당 ID 이후 entries만 반환, 에러 없음 | 코드 검사: backfillChatStream 내 별도 에러 핸들링 불필요 (XRANGE 기본 동작) |

## PRD 목표 ↔ DoD 커버리지

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| chatCursors 파싱 + per-session backfill | F4, F5 | ✅ |
| subscribe_chat 핸들러 + backfill | F6, F7 | ✅ |
| end-to-end 오프라인 cron 복구 | F9 | ✅ |

## 설계 결정 ↔ DoD 반영

| 설계 결정 | DoD 항목 | 커버 |
|----------|---------|------|
| XRANGE 기반 readRange | F1, F2 | ✅ |
| backfillChatStream(startId) | F3, F8 | ✅ |
| inclusive-start + idempotent | E3 | ✅ |
| one-shot (no loop) | F8 | ✅ |
