# Step 05: Device Enrollment API

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 03, 04

---

## 1. 구현 내용 (design.md 기반)
- `POST /api/auth/daemon/enroll` (daemon JWT) → 200 `{ enrollmentCode, expiresIn: 300 }`
- `POST /api/auth/enroll/confirm` (app JWT + enrollmentCode) → 200 `{ daemonId, userId, bound: true }`
- `POST /api/auth/daemon/unbind` (daemon JWT + userIds) → 200 `{ unbound }`
- enrollment code: 짧은 코드 생성 (8자), 5분 만료, 1회 사용
- confirm 시 daemon_users INSERT + UNIQUE(user_id) 위반 → 409

## 2. 완료 조건
- [ ] enroll → enrollment code 반환 (8자, 만료 5분)
- [ ] confirm → daemon_users 행 생성됨 (DB 확인)
- [ ] 만료된 code로 confirm → 404
- [ ] 이미 사용된 code → 404
- [ ] userId가 이미 다른 daemon에 바인딩 → 409
- [ ] unbind → daemon_users 행 삭제됨
- [ ] integration test 통과

## 3. 롤백 방법
- git revert

---

## Scope

### 수정 대상 파일
```
packages/relay/src/routes/
├── auth.ts  # 수정 - enroll/confirm/unbind 라우트 추가
```

### 신규 생성 파일
```
packages/relay/tests/
├── enrollment.test.ts  # 신규 - enrollment integration test
```

---

→ 다음: [Step 06: App Google OAuth API](step-06-google-oauth.md)

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅
