# Step 04: Daemon 인증 API

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 02, 03

---

## 1. 구현 내용 (design.md 기반)
- `POST /api/auth/daemon/register { daemonId, secret }` → 201
- `POST /api/auth/daemon/login { daemonId, secret }` → 200 `{ daemonId, token, refreshToken }`
- `POST /api/auth/daemon/refresh { refreshToken }` → 200 `{ token, refreshToken }`
- 비밀번호 해싱: 기존 hashPassword/verifyPassword 재사용

## 2. 완료 조건
- [ ] `POST /api/auth/daemon/register` → 201 `{ daemonId }`. 중복 → 409
- [ ] `POST /api/auth/daemon/login` → 200 `{ daemonId, token, refreshToken }`. 잘못된 secret → 401
- [ ] daemon JWT에 `{ sub: daemonId, role: 'daemon' }` 포함
- [ ] `POST /api/auth/daemon/refresh` → 200. 만료/revoke → 401
- [ ] Fastify inject 기반 integration test 통과

## 3. 롤백 방법
- git revert (라우트 추가만, 기존 라우트 변경 없음)

---

## Scope

### 수정 대상 파일
```
packages/relay/src/routes/
├── auth.ts  # 수정 - daemon register/login/refresh 라우트 추가
```

### 신규 생성 파일
```
packages/relay/tests/
├── daemon-auth.test.ts  # 신규 - daemon 인증 integration test
```

---

→ 다음: [Step 05: Device Enrollment API](step-05-enrollment-api.md)

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅
