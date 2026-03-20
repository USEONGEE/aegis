# Step 01: MiddlewareConfig + middleware 내부 변경

## 메타데이터
- **소유 DoD**: F1, F2, F3, F4, F13
- **수정 파일**: `packages/guarded-wdk/src/guarded-middleware.ts`
- **의존성**: 없음

## 구현 내용
1. `MiddlewareConfig.policiesRef` → `policyResolver: (chainId: number) => Promise<Policy[]>`
2. `MiddlewareConfig.accountIndexRef` 제거
3. `ChainPolicies`, `ChainPolicyConfig` 타입 삭제
4. `evaluatePolicy` 시그니처: `(chainPolicies: ChainPolicies, chainId, tx)` → `(policies: Policy[], chainId, tx)`
5. middleware 내부 3곳: `policiesRef()` → `await policyResolver(chainId)`, `accountIndexRef()` → 삭제(approval request에서 별도 처리)

## 완료 조건
- [ ] F1: `policiesRef` 검색 0건, `policyResolver` 존재
- [ ] F2: `accountIndexRef` 검색 0건
- [ ] F3: `ChainPolicies` 검색 0건
- [ ] F4: `ChainPolicyConfig` 검색 0건
- [ ] F13: `evaluatePolicy` 첫 파라미터가 `Policy[]`

## FP/FN 검증
- **FP**: 없음. guarded-middleware.ts 1개 파일만 수정.
- **FN**: accountIndexRef가 approval request 생성 시 사용되므로, 이 값을 policyResolver closure 외에서 어떻게 전달할지 — Step 02(factory)에서 처리.
