# Step 01: DB 스키마

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (DROP TABLE)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `daemons` 테이블 생성 (id, secret_hash, created_at)
- `daemon_users` 테이블 생성 (daemon_id, user_id, bound_at) + UNIQUE(user_id)
- `refresh_tokens` 테이블 생성 (id, subject_id, role, device_id, expires_at, created_at, revoked_at)
- `enrollment_codes` 테이블 생성 (code, daemon_id, expires_at, used_at)
- 인덱스: idx_daemon_users_daemon_id, idx_refresh_tokens_subject

## 2. 완료 조건
- [ ] `registry.migrate()` 실행 후 4개 테이블 존재 (daemons, daemon_users, refresh_tokens, enrollment_codes)
- [ ] daemon_users에 UNIQUE(user_id) 제약 존재
- [ ] 기존 테이블 (users, devices, sessions) 변경 없음

## 3. 롤백 방법
- `DROP TABLE enrollment_codes, refresh_tokens, daemon_users, daemons CASCADE;`

---

## Scope

### 수정 대상 파일
```
packages/relay/src/registry/
├── schema.sql  # 수정 - 4개 테이블 + 인덱스 추가
```

### 신규 생성 파일
없음

### Side Effect 위험
- 없음. 기존 테이블 변경 없음. IF NOT EXISTS 사용.

---

→ 다음: [Step 02: RegistryAdapter 확장](step-02-registry-adapter.md)

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅
