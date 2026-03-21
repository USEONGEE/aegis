# Step 07: WS 연결 구조 변경

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 03, 04

---

## 1. 구현 내용 (design.md 기반)
- ConnectionBucket 구조 변경: `daemonSockets`, `userToDaemon`, `appBuckets` 3개 Map
- daemon authenticate: daemon JWT 검증 → daemon_users 조회 → 연결 등록
- daemon 메시지 라우팅: userId 필드 필수, daemon_users로 소유권 검증
- app→daemon 라우팅: userId(소켓 인증) → userToDaemon → daemon 소켓에 userId 포함하여 forward
- daemon→app 라우팅: userId(메시지) → appBuckets에 forward
- heartbeat: `online:daemon:{daemonId}` (per-daemon)
- 인증 실패 시 소켓 강제 종료
- 동일 daemon 재연결 시 기존 소켓 교체

## 2. 완료 조건
- [ ] daemon JWT로 `/ws/daemon` authenticate → `{ type: 'authenticated', daemonId, userIds }` 수신
- [ ] daemon이 `{ type: 'chat', userId, sessionId, payload }` 전송 → appBuckets[userId]로 forward
- [ ] daemon이 소유하지 않은 userId → `{ type: 'error', message: 'Unauthorized userId' }`
- [ ] app이 chat 전송 → daemon 소켓에 userId 포함하여 forward
- [ ] daemon heartbeat → `online:daemon:{daemonId}` Redis 키
- [ ] 인증 실패 → 소켓 close 이벤트
- [ ] 2+ user 동시 멀티플렉싱 WS test 통과

## 3. 롤백 방법
- git revert (ws.ts 전체 리팩토링)

---

## Scope

### 수정 대상 파일
```
packages/relay/src/routes/
├── ws.ts  # 대규모 수정 - 연결 구조 전체 변경
```

### Side Effect 위험
- ws.ts 전면 리팩토링이므로 기존 app 연결 로직도 영향받음
- push notification 로직 (pushToOfflineApps)도 새 자료구조에 맞게 조정 필요

---

→ 다음: [Step 08: WS Stream Polling + Events](step-08-ws-polling.md)

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅
