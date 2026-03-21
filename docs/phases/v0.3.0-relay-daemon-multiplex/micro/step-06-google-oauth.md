# Step 06: App Google OAuth API

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 03

---

## 1. 구현 내용 (design.md 기반)
- `POST /api/auth/google { idToken }` → 200 `{ userId, token, refreshToken }`
- Google ID token 검증 (google-auth-library 사용)
- user 자동 생성: idToken에서 sub → userId, 없으면 users 테이블에 INSERT
- App JWT 발급: `{ sub: userId, role: 'app', deviceId }`
- Refresh token 발급 (device_id 포함)

## 2. 완료 조건
- [ ] `POST /api/auth/google { idToken }` → 200 `{ userId, token, refreshToken }`
- [ ] 신규 user → users 테이블에 자동 생성됨
- [ ] 기존 user → 기존 userId로 로그인
- [ ] 잘못된 idToken → 401
- [ ] App JWT에 `{ sub: userId, role: 'app', deviceId }` 포함
- [ ] integration test 통과 (Google idToken mock)

## 3. 롤백 방법
- git revert

---

## Scope

### 수정 대상 파일
```
packages/relay/src/routes/
├── auth.ts  # 수정 - /api/auth/google 라우트 추가
```

### 신규 의존성
- `google-auth-library` (또는 직접 JWT 검증)

### Side Effect 위험
- 기존 register/login API는 유지 (breaking change이므로 이후 제거 가능)

---

→ 다음: [Step 07: WS 연결 구조 변경](step-07-ws-connection.md)

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅
