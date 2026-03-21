# 설계 - v0.3.3

## 변경 규모
**규모**: 일반 기능
**근거**: relay WS 계약에 `chatCursors`(authenticate 확장) + `subscribe_chat`(신규 메시지 타입) 추가. QueueAdapter에 non-blocking `readRange` 메서드 추가.

---

## 문제 요약
v0.3.0이 relay ws.ts를 multiplex 아키텍처로 전면 재작성하면서, v0.3.1이 추가했던 오프라인 cron 복구 기능이 누락됨. App/Daemon은 이미 구현 완료.

> 상세: [README.md](README.md) 참조

## 접근법
1. QueueAdapter에 `readRange(stream, start, end, count)` non-blocking 메서드 추가 (XRANGE 기반)
2. relay ws.ts에 `backfillChatStream` one-shot 함수 추가 (readRange 사용)
3. `handleAppConnection`의 authenticate에서 chatCursors → per-session backfill
4. `subscribe_chat` 메시지 핸들러 → backfill 실행

**핵심 결정: authenticate와 subscribe_chat 모두 one-shot backfill 사용. long-running poller 없음.**

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: 기존 consume(XREAD BLOCK) 재사용 | 코드 변경 최소 | 빈 stream에서 5초 블로킹. one-shot 불가 | ❌ |
| B: XRANGE 기반 non-blocking readRange 추가 | 진정한 one-shot. 블로킹 없음 | QueueAdapter 인터페이스 확장 필요 | ✅ |
| C: REST API 추가 | WS 코드 미변경 | 새 엔드포인트 구현 필요. 과도 | ❌ |

**선택 이유**: XRANGE는 non-blocking이고 범위 지정 가능. one-shot backfill에 정확히 맞음. QueueAdapter 확장은 1개 메서드 추가로 최소.

## 기술 결정

### QueueAdapter.readRange
```typescript
async readRange(stream: string, start: string, end: string, count?: number): Promise<StreamEntry[]>
```
- RedisQueue: `redis.xrange(stream, start, end, 'COUNT', count ?? 1000)`
- non-blocking — 결과 즉시 반환
- start='0', end='+' → 전체 스트림 읽기
- start=cursor, end='+' → cursor 이후 전체 읽기

### backfillChatStream (one-shot, startId 파라미터)
```
async function backfillChatStream(userId, sessionId, startId, socket):
  entries = queue.readRange(`chat:${userId}:${sessionId}`, startId, '+', 1000)
  for entry in entries:
    if sender === 'app': continue  // echo 방지
    send(socket, { type: 'chat', id: entry.id, sessionId, payload })
```
- `startId` 파라미터로 시작 위치 지정
- authenticate 경로: `startId = cursor` (이미 수신한 메시지 포함 — idempotent)
- subscribe_chat 경로: `startId = '0'` (전체 히스토리)
- loop 없음. 1회 실행 후 종료.

### cursor 경계 규칙
**inclusive-start + idempotent**: XRANGE의 start는 inclusive (해당 ID 포함). 따라서 authenticate backfill은 마지막으로 받은 cursor의 메시지를 한 번 더 받을 수 있음. App의 addMessage가 같은 entry.id를 덮어쓰기(idempotent)하므로 데이터 무결성 유지. strict-after 보장이 불필요 — 중복 1건은 안전하게 흡수됨.

### authenticate 시 chatCursors 처리
```
chatCursors = msg.payload?.chatCursors ?? {}
for [sessionId, cursor] in chatCursors:
  backfillChatStream(userId, sessionId, cursor, socket)
```
- authenticate 경로도 one-shot backfill (long-running poller 아님)

### subscribe_chat 호출
```
backfillChatStream(userId, sessionId, '0', socket)
```
- 전체 히스토리를 one-shot으로 전달

### subscribe_chat 재호출 정책
**idempotent**: 같은 sessionId로 재호출해도 relay는 '0'부터 다시 읽어 보냄. App의 addMessage가 entry.id 기반으로 덮어쓰기하므로 데이터 무결성 유지. relay 측 중복 방지 불필요 — app 측 `backfilledSessions` Set이 이미 중복 호출을 방지.

### backfill 상한: 1000건
의도된 제품 제한. 오프라인 복구는 최근 1000건까지만 지원. relay의 streamMaxLen(10000)보다 작으므로 대부분의 실사용 시나리오를 커버. 1000건 초과 시 가장 오래된 메시지가 조용히 잘리며, 이는 허용 가능한 동작.

### XRANGE stale cursor 안전성
XRANGE는 존재하지 않는 ID를 start로 줘도 에러 없이 해당 ID 이후의 entries만 반환. trim된 구간도 안전.

## 범위 / 비범위

**범위(In Scope)**:
- packages/relay/src/queue/queue-adapter.ts — readRange 메서드 추가
- packages/relay/src/queue/redis-queue.ts — readRange XRANGE 구현
- packages/relay/src/routes/ws.ts — backfillChatStream + authenticate chatCursors + subscribe_chat 핸들러

**비범위(Out of Scope)**:
- App 코드 변경 없음 (이미 구현)
- Daemon 코드 변경 없음 (이미 구현)
- IncomingMessage 타입 변경 (chatCursors는 payload 내부이므로 any로 접근 가능)

## API/인터페이스 계약

### App → Relay (authenticate 확장)
| 필드 | 기존 | 추가 |
|------|------|------|
| lastStreamId | control cursor | — |
| **chatCursors** (신규) | — | `Record<sessionId, streamEntryId>` |

### App → Relay (subscribe_chat 신규)
```json
{ "type": "subscribe_chat", "payload": { "sessionId": "..." } }
```

## 테스트 전략
| 대상 | 레벨 | 방법 |
|------|------|------|
| QueueAdapter.readRange | unit | redis-queue.test.ts에 XRANGE 호출 확인 |
| backfillChatStream | 코드 검사 | readRange 1회 호출 + send loop + 함수 종료 |
| chatCursors 파싱 | 코드 검사 | authenticate에서 msg.payload.chatCursors 읽기 |
| subscribe_chat 핸들러 | 코드 검사 | msg.type === 'subscribe_chat' 분기 존재 |
| relay ws.ts tsc | CI | ws.ts 관련 에러 0 |
