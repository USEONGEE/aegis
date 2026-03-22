# Chat Poller 전용 Blocking Redis 연결

## 현재 상태
`pollChatForApp()`이 `readRange()` + `sleep(200ms)` non-blocking polling 사용.
control poller와 blocking Redis 연결 공유 시 head-of-line blocking 발생하므로 우회한 것.

## 문제
- 최악 200ms 지연 (실시간 streaming delta에는 충분하지만 최적은 아님)
- CPU 낭비: 메시지 없어도 200ms마다 Redis 호출

## 개선안
`RedisQueue`에 chat 전용 blocking Redis 연결을 추가하여 `XREAD BLOCK` 사용.

```
현재:
  blockingRedis (1개) ← control poller + chat poller 경쟁
  → chat은 non-blocking으로 우회

개선:
  blockingRedis     ← control poller 전용
  chatBlockingRedis ← chat poller 전용 (새로 추가)
  → 둘 다 XREAD BLOCK 사용, 0ms 지연 + CPU 낭비 없음
```

## 구현 범위
- `packages/relay/src/queue/redis-queue.ts` — `chatBlockingRedis` 연결 추가 + `consumeChat()` 메서드
- `packages/relay/src/routes/ws.ts` — `pollChatForApp()`에서 `consumeChat()` 사용으로 변경

## 우선순위
낮음 — 현재 200ms polling으로 데모/운영 충분. 스케일 필요 시 적용.
