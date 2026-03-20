# Step 03: 소비자 코드 수정

## 메타데이터
- **소유 DoD**: F6, F7
- **수정 파일**: `packages/guarded-wdk/src/guarded-wdk-factory.ts`, `packages/daemon/src/wdk-host.ts`, `packages/daemon/src/tool-surface.ts`
- **의존성**: Step 02

## 구현 내용
1. guarded-wdk-factory.ts: `stored.policiesJson` → `stored.policies`, `JSON.parse()` 제거, `deepCopy(stored)` 직접 사용
2. daemon/wdk-host.ts: `JSON.parse(stored.policiesJson)` → `stored.policies`
3. daemon/tool-surface.ts swapPoliciesForWallet: `JSON.parse(stored.policiesJson)` → `stored.policies`
4. daemon/tool-surface.ts policyList: `JSON.parse(policy.policiesJson)` → `policy.policies`

## 완료 조건
- [ ] F6: guarded-wdk-factory.ts에서 `policiesJson` 검색 0건
- [ ] F7: wdk-host.ts + tool-surface.ts에서 `policiesJson` 검색 0건

## FP/FN 검증
- **FP (과잉)**: 없음. grep으로 확인된 3개 파일만 수정.
- **FN (누락)**: app 패키지에 policiesJson 소비 지점 없음 확인됨 (Codex Step 1 리뷰에서 검증). relay도 무관.
