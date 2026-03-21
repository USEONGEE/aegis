# Step 10: App 인증 + Enrollment UX

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 05, 06, 07

---

## 1. 구현 내용 (design.md 기반)
- App Google OAuth (PKCE): @react-native-google-signin/google-signin 통합
- 로그인 성공 → `/api/auth/google` 호출 → `{ token, refreshToken }` SecureStore 저장
- Refresh token 자동 갱신: token 만료 전 자동 refresh. 갱신 실패 → 로그인 화면
- RelayClient: `authenticated` 응답 대기. 수신 전까지 `connected = false`
- Enrollment code 입력 UI: QR 스캔 또는 수동 코드 입력 → `/api/auth/enroll/confirm` 호출
- Daemon enrollment 터미널 출력: daemon이 enrollmentCode를 QR/텍스트로 표시

## 2. 완료 조건
- [ ] App: Google OAuth 로그인 → token/refreshToken SecureStore 저장
- [ ] App: refresh 자동 갱신. 실패 시 로그인 화면 이동
- [ ] App RelayClient: `authenticated` 전까지 `connected = false`
- [ ] App: enrollment code 입력 → confirm → 바인딩 완료 표시
- [ ] Daemon: enrollment 시 enrollmentCode를 터미널에 출력
- [ ] manual test로 end-to-end 확인

## 3. 롤백 방법
- git revert

---

## Scope

### 수정 대상 파일
```
packages/app/src/core/
├── relay/RelayClient.ts       # 수정 - authenticated 대기, token refresh
├── identity/IdentityKeyManager.ts  # 수정 - Google OAuth token 관리

packages/daemon/src/
├── index.ts  # 수정 - enrollment 시 QR/code 터미널 출력
```

### 신규 생성 파일
```
packages/app/src/domains/auth/
├── screens/LoginScreen.tsx        # 신규 - Google OAuth 로그인 화면
├── screens/EnrollmentScreen.tsx   # 신규 - enrollment code 입력 화면
```

### 신규 의존성
- `@react-native-google-signin/google-signin` (app)
- `qrcode-terminal` (daemon, 선택)

---

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅
