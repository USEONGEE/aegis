# 설계 - v0.3.3

## 변경 규모
**규모**: 작은 변경
**근거**: 단일 파일(relay ws.ts) 내 3개 코드 블록 추가. 기존 패턴(pollControlForApp) 재사용. 새 모듈/의존성 없음.

---

## 문제 요약
v0.3.0이 relay ws.ts를 multiplex 아키텍처로 전면 재작성하면서, v0.3.1이 추가했던 오프라인 cron 복구 기능(chatCursors 파싱, subscribe_chat 핸들러, backfillChatStream)이 누락됨. App/Daemon은 이미 구현 완료.

> 상세: [README.md](README.md) 참조

## 접근법
relay ws.ts의 `handleAppConnection` 내에 3개 코드 블록을 추가:
1. authenticate에서 `chatCursors` 파싱 → per-session chat stream polling 시작
2. `subscribe_chat` 메시지 핸들러 → one-shot backfill 실행
3. `backfillChatStream` 함수 → Redis XREAD 1회 실행 후 종료

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: pollControlForApp 패턴 재사용 (long-running poller) | 기존 패턴. 실시간 갱신 | 즉시 forward와 중복 전달 | ❌ |
| B: one-shot backfill (XREAD 1회) | 중복 없음. 캐치업 후 종료 | 실시간 갱신 없음 (불필요 — 즉시 forward로 커버) | ✅ |
| C: REST API 추가 (GET /chat/history) | WS 코드 미변경 | 새 엔드포인트 + Redis XRANGE 구현 필요 | ❌ |

**선택 이유**: 앱이 연결된 상태에서는 daemon→relay→app 즉시 forward로 실시간 메시지를 받음. 오프라인 복구는 재접속 시 놓친 메시지를 한 번 당겨오면 되므로 one-shot backfill이 적합.

## 기술 결정

### subscribe_chat 재호출 정책
**idempotent + 무해**: 같은 sessionId로 재호출해도 relay는 '0'부터 다시 읽어 보냄. App의 addMessage가 같은 id를 덮어쓰기(idempotent)하므로 데이터 무결성 유지. 별도 중복 방지 로직 불필요 — app 측 `backfilledSessions` Set이 이미 중복 호출을 방지함.

### backfillChatStream 구현
- `queue.consume(stream, '0', 1000)` — blocking 없이 현재 존재하는 전체 entries 읽기
- sender === 'app'인 entry는 skip (echo 방지)
- sessionId가 있으면 type='chat', 없으면 type='control'로 전송
- 함수 종료 후 poller loop 없음 (one-shot)

### XREAD stale cursor 안전성
Redis XREAD는 trim된 ID 이후의 엔트리만 반환. stale cursor는 에러 없이 안전. relay pollControlForApp과 동일한 보장.

## 테스트 전략

| 대상 | 레벨 | 방법 |
|------|------|------|
| chatCursors 파싱 | 코드 검사 | authenticate 핸들러에서 msg.payload.chatCursors 읽기 확인 |
| subscribe_chat 핸들러 | 코드 검사 | msg.type === 'subscribe_chat' 분기 존재 확인 |
| backfillChatStream | 코드 검사 | queue.consume 1회 호출 + send loop + 함수 종료 확인 |
| relay ws.ts tsc | CI | `grep "ws.ts" <<< $(cd packages/relay && npx tsc --noEmit 2>&1)` — 에러 0 |
| end-to-end | 수동 | 앱 종료 → cron 실행 → 앱 재시작 → cron 세션 + AI 응답 확인 |
