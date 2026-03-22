# Step 03: daemon tool-surface unknown 제거

## 메타데이터
- **난이도**: 🟡
- **선행 조건**: Step 01 (guarded-wdk 타입 확정)

## 구현 내용
- `IntentRejectedResult.context: unknown` → `EvaluationContext | null` (guarded-wdk import)
- `TransferRejectedResult.context: unknown` → `EvaluationContext | null`
- `PolicyListSuccess.policies: unknown[]` → `StoredPolicy[]` (guarded-wdk approval-store import)
- `PolicyPendingSuccess.pending: unknown[]` → `PendingApprovalRequest[]`
- `ListCronsSuccess.crons: unknown[]` → `StoredCron[]`
- `ListRejectionsSuccess.rejections: unknown[]` → `RejectionEntry[]`
- `ListPolicyVersionsSuccess.policyVersions: unknown[]` → `PolicyVersionEntry[]`
- `GetBalanceSuccess.balances: unknown[]` — WDK 외부 타입이라 즉시 구체화 어려움. `Record<string, unknown>[]`로 최소 개선 또는 유지
- 불필요해진 `as unknown as` 캐스트 제거 (가능한 범위)

## 완료 조건
- [ ] `grep 'unknown\[\]' packages/daemon/src/tool-surface.ts` → GetBalanceSuccess 1건 이하
- [ ] `grep 'context: unknown' packages/daemon/src/tool-surface.ts` → 0건
- [ ] `npx tsc --noEmit` 통과 (daemon)
- [ ] CI `cross/dead-exports` 건수 감소 확인

## Scope
### 수정 대상
- `packages/daemon/src/tool-surface.ts` — 결과 타입 인터페이스 7개 필드 수정, import 추가
