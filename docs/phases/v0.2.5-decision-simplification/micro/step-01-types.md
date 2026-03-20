# Step 01: 타입 변경

## 메타데이터
- **소유 DoD**: F1, F2, F11, F12, F13, F20
- **수정 파일**: `packages/guarded-wdk/src/approval-store.ts`, `packages/guarded-wdk/src/guarded-middleware.ts`, `packages/guarded-wdk/src/store-types.ts`
- **의존성**: 없음

## 구현 내용
1. `Decision`: `'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'` → `'ALLOW' | 'REJECT'`
2. `JournalStatus`: `'pending_approval'` 제거
3. `RejectionEntry` 인터페이스 추가: `{ intentHash, accountIndex, chainId, targetHash, reason, context, policyVersion, rejectedAt }`
4. `PolicyVersionEntry` 인터페이스 추가: `{ accountIndex, chainId, version, description, diff, changedAt }`
5. `ApprovalStore`에 `saveRejection()`, `listRejections()`, `listPolicyVersions()` 추상 메서드 추가
6. `ApprovalStore.savePolicy()` 시그니처에 `description` 파라미터 추가
7. `store-types.ts`에 `RejectionRow`, `PolicyVersionRow` 추가
8. `validatePolicy`에서 `REQUIRE_APPROVAL` → `ALLOW`/`REJECT`만 허용

## 완료 조건
- [ ] F1, F2, F11, F12, F13, F20

## FP/FN
- **FP**: 없음
- **FN**: index.ts export → Step 06
