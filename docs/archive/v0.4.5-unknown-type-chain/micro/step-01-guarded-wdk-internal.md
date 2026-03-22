# Step 01: guarded-wdk 내부 unknown 제거

## 메타데이터
- **난이도**: 🟡
- **선행 조건**: 없음

## 구현 내용
- `approval-store.ts` — `PolicyInput.policies: unknown[]` → `Policy[]`, `RejectionEntry.context: unknown` → `EvaluationContext | null`, `PolicyVersionEntry.diff: unknown` → `PolicyDiff` 신규 타입
- `errors.ts` — `PolicyRejectionError.context: unknown` → `EvaluationContext | null`
- `signed-approval-broker.ts` — `ApprovalSubmitContext['policy_approval'].policies: unknown[]` → `Policy[]`
- `PolicyDiff` 타입 정의: `{ added: Policy[]; removed: Policy[]; modified: Array<{ before: Policy; after: Policy }> }`
- `computePolicyDiff` 함수 시그니처 업데이트 (sqlite-approval-store.ts, json-approval-store.ts)
- `PolicyInput.signature: Record<string, unknown>` → 가능하면 구체화 (구조 확인 필요)

## 완료 조건
- [ ] `grep ': unknown' packages/guarded-wdk/src/approval-store.ts` → 0건
- [ ] `grep 'context: unknown' packages/guarded-wdk/src/errors.ts` → 0건
- [ ] `grep 'unknown' packages/guarded-wdk/src/signed-approval-broker.ts` → 0건
- [ ] `npx tsc --noEmit` 통과 (guarded-wdk)

## Scope
### 수정 대상
- `packages/guarded-wdk/src/approval-store.ts` — PolicyInput, RejectionEntry, PolicyVersionEntry 타입 수정
- `packages/guarded-wdk/src/errors.ts` — PolicyRejectionError.context 타입 수정
- `packages/guarded-wdk/src/signed-approval-broker.ts` — ApprovalSubmitContext policies 타입 수정
- `packages/guarded-wdk/src/sqlite-approval-store.ts` — computePolicyDiff 시그니처 + 내부 캐스팅
- `packages/guarded-wdk/src/json-approval-store.ts` — computePolicyDiff 시그니처 + 내부 캐스팅
