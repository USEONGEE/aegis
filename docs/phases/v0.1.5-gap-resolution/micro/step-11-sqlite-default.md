# Step 11: SqliteStore 기본값 (Gap 7)

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `wdk-host.ts`에서 기본 store를 `JsonApprovalStore` → `SqliteApprovalStore`로 변경
- `new JsonApprovalStore(...)` → `new SqliteApprovalStore(...)`
- JsonStore는 테스트/개발용으로 유지 (삭제하지 않음)
- SqliteStore는 WAL mode, 쿼리 가능

## 2. 완료 조건
- [ ] `wdk-host.ts`에서 기본 생성이 `SqliteApprovalStore`인 코드 존재
- [ ] `grep -n 'new JsonApprovalStore' packages/daemon/src/wdk-host.ts` 결과 0건
- [ ] daemon 부팅 테스트 통과 (SqliteStore로 정상 동작)
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: daemon 패키지만 (wdk-host)

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── wdk-host.ts                 # 기본 store를 SqliteApprovalStore로 변경
```

### Side Effect 위험
- 기존 JSON 파일 데이터는 마이그레이션 안 함 (reset 허용)

## FP/FN 검증

### 검증 통과: ✅
- SqliteApprovalStore는 이미 구현되어 있으므로 import만 변경 (OK)
- JsonApprovalStore는 테스트에서 계속 사용 → 삭제 안 함 (OK)

---

> 다음: [Step 12: manifest schema 정합](step-12-manifest-schema.md)
