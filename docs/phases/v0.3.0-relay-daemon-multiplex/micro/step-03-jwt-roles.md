# Step 03: JWT 역할 분리 + Refresh Token

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 02

---

## 1. 구현 내용 (design.md 기반)
- `verifyToken()` 수정: 반환값에 `role` 포함 `{ sub, role }`
- `signToken()` 수정 또는 신규: App JWT `{ sub: userId, role: 'app', deviceId }`, Daemon JWT `{ sub: daemonId, role: 'daemon' }`
- Refresh token 생성/검증/갱신 로직: `issueRefreshToken()`, `refreshAccessToken()`
- Refresh token rotation: 사용 시 새 refresh token 발급, 이전 것 revoke
- Replay attack 방어: 이미 revoke된 refresh token 사용 시 해당 subject의 모든 token revoke

## 2. 완료 조건
- [ ] `verifyToken(daemonJwt)` → `{ sub: 'daemonId', role: 'daemon' }`
- [ ] `verifyToken(appJwt)` → `{ sub: 'userId', role: 'app', deviceId: '...' }`
- [ ] refresh token으로 새 access JWT + 새 refresh token 발급됨
- [ ] 사용된 refresh token 재사용 시 401 + 해당 subject의 모든 refresh token revoke
- [ ] `npx tsc --noEmit` 통과

## 3. 롤백 방법
- git revert

---

## Scope

### 수정 대상 파일
```
packages/relay/src/routes/
├── auth.ts  # 수정 - signToken, verifyToken 수정 + refresh 로직 추가
```

### Side Effect 위험
- verifyToken 반환값 변경 → ws.ts에서 사용하는 곳 조정 필요 (Step 07에서 처리)
- 기존 user JWT와의 호환성: role 없는 기존 토큰은 role='app' 기본값으로 처리

---

→ 다음: [Step 04: Daemon 인증 API](step-04-daemon-auth-api.md)

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅
