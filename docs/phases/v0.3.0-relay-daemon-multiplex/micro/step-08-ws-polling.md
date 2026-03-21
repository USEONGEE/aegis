# Step 08: WS Stream Polling + Events

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 07

---

## 1. 구현 내용 (design.md 기반)
- multi-stream XREAD: daemon의 모든 user control stream을 하나의 blocking call로 polling
- `lastControlIds` per-user 커서 → reconnect resume (control only)
- chat: stream에 기록하되 reconnect 시 replay 안 함 (ephemeral). 즉시 forward만
- `user_bound` 이벤트: enrollment confirm 시 daemon WS에 전송 + poller에 stream 추가
- `user_unbound` 이벤트: unbind 시 daemon WS에 전송 + poller에서 stream 제거
- RedisQueue에 multi-stream XREAD 메서드 추가 (또는 기존 consume 확장)

## 2. 완료 조건
- [ ] daemon 재연결 시 `lastControlIds`로 놓친 control 메시지 수신
- [ ] daemon offline 시 app이 보낸 chat → reconnect 후 replay 안 됨
- [ ] enrollment confirm → daemon에 `{ type: 'user_bound', userId }` 수신
- [ ] unbind → daemon에 `{ type: 'user_unbound', userId }` 수신
- [ ] runtime bind 후 새 user의 control stream이 polling에 추가됨
- [ ] WS integration test 통과

## 3. 롤백 방법
- git revert

---

## Scope

### 수정 대상 파일
```
packages/relay/src/
├── routes/ws.ts          # 수정 - polling 로직 + bound/unbound 이벤트
├── queue/redis-queue.ts  # 수정 - multi-stream XREAD 메서드 추가
├── queue/queue-adapter.ts # 수정 - 추상 메서드 추가
```

### Side Effect 위험
- multi-stream XREAD는 기존 per-stream consume과 다른 패턴. blocking connection 관리 주의

---

→ 다음: [Step 09: Daemon relay-client 수정](step-09-daemon-client.md)

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅
