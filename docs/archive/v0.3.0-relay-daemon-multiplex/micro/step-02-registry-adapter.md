# Step 02: RegistryAdapter 확장

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01

---

## 1. 구현 내용 (design.md 기반)
- RegistryAdapter에 daemon CRUD 추상 메서드 추가: createDaemon, getDaemon
- RegistryAdapter에 daemon_users 메서드 추가: bindUser, unbindUsers, getUsersByDaemon, getDaemonByUser
- RegistryAdapter에 refresh token 메서드 추가: createRefreshToken, getRefreshToken, revokeRefreshToken, revokeAllRefreshTokens
- RegistryAdapter에 enrollment 메서드 추가: createEnrollmentCode, getEnrollmentCode, markEnrollmentUsed
- PgRegistry에서 위 메서드 전체 SQL 구현

## 2. 완료 조건
- [ ] RegistryAdapter에 daemon/enrollment/refresh 관련 abstract 메서드 12개+ 정의됨
- [ ] PgRegistry에서 모든 메서드 SQL 구현됨
- [ ] bindUser 시 UNIQUE(user_id) 위반 → 에러 throw
- [ ] `npx tsc --noEmit` 통과

## 3. 롤백 방법
- git revert (코드만 변경, 데이터 없음)

---

## Scope

### 수정 대상 파일
```
packages/relay/src/registry/
├── registry-adapter.ts  # 수정 - abstract 메서드 추가
├── pg-registry.ts       # 수정 - SQL 구현 추가
```

### Side Effect 위험
- 기존 메서드 시그니처 변경 없음. 추가만.

---

→ 다음: [Step 03: JWT 역할 분리](step-03-jwt-roles.md)

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅
