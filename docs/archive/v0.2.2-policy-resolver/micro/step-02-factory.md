# Step 02: Factory 변경

## 메타데이터
- **소유 DoD**: F5, F6, F7, F8, F15, F16
- **수정 파일**: `packages/guarded-wdk/src/guarded-wdk-factory.ts`
- **의존성**: Step 01

## 구현 내용
1. `GuardedWDKConfig.policies` 필드 삭제
2. `GuardedWDKConfig.approvalStore` 필수화 — 없으면 throw
3. `policiesStore` 변수 + 부팅 캐시 로직 삭제
4. `validatePolicies` 부팅 호출 삭제 (resolver 내부로 이동)
5. `updatePolicies` 메서드 삭제
6. `GuardedWDKFacade` 인터페이스에서 `updatePolicies` 제거
7. middleware 등록 시 `policyResolver` 주입 (closure에서 currentAccountIndex 캡처)

## 완료 조건
- [ ] F5: config `policies` 필드 부재
- [ ] F6: approvalStore 미전달 시 throw
- [ ] F7: `updatePolicies` 검색 0건
- [ ] F8: `policiesStore` 검색 0건
- [ ] F15: policyResolver가 currentAccountIndex 기반 조회
- [ ] F16: resolver 내부 validatePolicies 호출

## FP/FN 검증
- **FP**: 없음.
- **FN**: index.ts에서 ChainPolicies/ChainPolicyConfig export 제거 → Step 04에서 처리.
