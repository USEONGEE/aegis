# Step 05: 테스트 수정 + 최종 검증

## 메타데이터
- **소유 DoD**: N1-N5, E1-E5
- **수정 파일**: `packages/guarded-wdk/tests/factory.test.ts`, `packages/guarded-wdk/tests/integration.test.ts`, `packages/guarded-wdk/tests/evaluate-policy.test.ts`, `packages/daemon/tests/control-handler.test.ts`, `packages/daemon/tests/tool-surface.test.ts`
- **의존성**: Step 01-04

## 구현 내용
1. factory.test.ts: config.policies 테스트 → store 기반으로 전환, updatePolicies 테스트 제거, approvalStore 필수 에러 테스트 추가 (F6, E2)
2. integration.test.ts: policiesRef → policyResolver mock, 지갑별 정책 분리 테스트 추가 (F15, E4)
3. evaluate-policy.test.ts: evaluatePolicy 시그니처 변경 (Policy[] 직접 받음)
4. control-handler.test.ts: updatePolicies mock → savePolicy mock, broker 실패 시 savePolicy 미호출 테스트 (E3, E5)
5. tool-surface.test.ts: swapPoliciesForWallet mock 제거, loadPolicy mock 변경

## 최종 검증
- [ ] N1: baseline 대비 guarded-wdk `error TS` 비증가
- [ ] N2: baseline 대비 daemon `error TS` 비증가
- [ ] N3: `cd packages/guarded-wdk && npm test` 통과
- [ ] N4: `cd packages/daemon && npm test` 통과
- [ ] N5: `grep -r 'ChainPolicies\|ChainPolicyConfig\|policiesStore\|swapPoliciesForWallet' packages/*/src` → 0건
- [ ] E1: 빈 정책 시나리오 테스트 통과
- [ ] E2: approvalStore 없이 생성 시 에러 테스트 통과
- [ ] E3: policy_approval 후 savePolicy 호출 테스트 통과
- [ ] E4: 지갑별 정책 분리 테스트 통과
- [ ] E5: broker 실패 시 savePolicy 미호출 테스트 통과

## FP/FN 검증
- **FP**: 없음.
- **FN**: N5 grep으로 전체 검증.
