# Step 04: wdk_countersig 제거 (Change 7)

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: Step 03

---

## 1. 구현 내용 (design.md 기반)
- SignedPolicy 인터페이스에서 `wdk_countersig` 필드 삭제
- SQLite policies 테이블에서 `wdk_countersig` 컬럼 삭제
- savePolicy() 관련 코드에서 wdk_countersig 참조 제거

## 2. 완료 조건
- [ ] `grep -rn 'wdk_countersig' packages/guarded-wdk/src/` 결과 0건
- [ ] sqlite-approval-store.test.ts 통과
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: guarded-wdk 패키지만

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts           # SignedPolicy 인터페이스
├── sqlite-approval-store.ts    # CREATE TABLE, INSERT/UPDATE
└── json-approval-store.ts      # savePolicy spread (간접)

packages/guarded-wdk/tests/
└── sqlite-approval-store.test.ts # wdk_countersig 관련 assertion 제거
```

## FP/FN 검증

### 검증 통과: ✅

---

> 다음: [Step 05: PendingRequest 분리](step-05-pending-split.md)
