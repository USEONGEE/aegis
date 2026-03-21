# Step 09: Daemon relay-client 수정

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 07, 08

---

## 1. 구현 내용 (design.md 기반)
- daemon config: `DAEMON_ID`, `DAEMON_SECRET` 환경변수 (기존 `RELAY_TOKEN` 대체)
- 부팅 시: `/api/auth/daemon/login` → daemon JWT + refreshToken 획득
- WS authenticate: daemon JWT + `lastControlIds` (per-user control 커서)
- `authenticated` 응답 대기 후 연결 성공 처리. 타임아웃 시 reconnect
- 모든 outgoing 메시지에 `userId` 필드 추가
- message-queue: queue key를 `(userId, sessionId)` 복합키로 변경
- `user_bound` / `user_unbound` 이벤트 처리
- refresh token 자동 갱신 (만료 전 갱신)

## 2. 완료 조건
- [ ] daemon이 `DAEMON_ID` + `DAEMON_SECRET`으로 부팅 → JWT 획득
- [ ] WS authenticate → `{ type: 'authenticated', daemonId, userIds }` 수신 후 connected
- [ ] 모든 outgoing chat/control 메시지에 `userId` 포함
- [ ] message-queue key가 `(userId, sessionId)` 복합키 (grep 확인)
- [ ] `user_bound` 수신 시 새 user 추가 처리
- [ ] access token 만료 전 자동 refresh
- [ ] `npx tsc --noEmit` 통과

## 3. 롤백 방법
- git revert

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── config.ts          # 수정 - DAEMON_ID, DAEMON_SECRET 추가
├── relay-client.ts    # 수정 - daemon auth, userId in messages, authenticated wait
├── message-queue.ts   # 수정 - queue key (userId, sessionId) 복합키
├── index.ts           # 수정 - 부팅 시 daemon login, user_bound/unbound 처리
```

### Side Effect 위험
- relay-client.ts 대규모 변경 → 기존 메시지 핸들러(chat-handler, control-handler)에 전달되는 payload 구조 영향 최소화 필요

---

→ 다음: [Step 10: App 인증 + Enrollment UX](step-10-app-auth.md)

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅
