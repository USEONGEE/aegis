# Step 04: Store 구현

## 메타데이터
- **소유 DoD**: F14, F15, F16, N7
- **수정 파일**: `packages/guarded-wdk/src/json-approval-store.ts`, `packages/guarded-wdk/src/sqlite-approval-store.ts`
- **의존성**: Step 01

## 구현 내용
1. `saveRejection()`, `listRejections()` 구현 (Json + Sqlite)
2. `savePolicy()` 수정: 저장 시 자동으로 policy_versions에 이력 기록 (diff 계산)
3. `listPolicyVersions()` 구현
4. SQLite: `rejection_history`, `policy_versions` 테이블 CREATE (init에서)
5. JSON: `rejection-history.json`, `policy-versions.json` 파일 defaults 추가
6. `savePolicy` 시그니처에 `description` 파라미터 추가 (approval-store.ts 정의에 맞춤)

## 완료 조건
- [ ] F14, F15, F16, N7

## FP/FN
- **FP**: 없음
- **FN**: diff 계산 유틸리티가 필요할 수 있음 — store 내부에 구현.
