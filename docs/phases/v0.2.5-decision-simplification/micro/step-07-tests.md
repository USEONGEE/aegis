# Step 07: 테스트 수정 + 최종 검증

## 메타데이터
- **소유 DoD**: N1-N5, N7, E1-E7
- **수정 파일**: `packages/guarded-wdk/tests/evaluate-policy.test.ts`, `packages/guarded-wdk/tests/integration.test.ts`, `packages/guarded-wdk/tests/factory.test.ts`, `packages/guarded-wdk/tests/approval-broker.test.ts`, `packages/guarded-wdk/tests/json-approval-store.test.ts`, `packages/guarded-wdk/tests/sqlite-approval-store.test.ts`, `packages/daemon/tests/control-handler.test.ts`, `packages/daemon/tests/tool-surface.test.ts`
- **의존성**: Step 01-06

## 구현 내용
1. evaluate-policy.test.ts: `AUTO` → `ALLOW`, `REQUIRE_APPROVAL` 테스트 제거/변환
2. integration.test.ts: REQUIRE_APPROVAL 분기 제거, ALLOW/REJECT만, rejectionRecorder 검증 (F8, E1, E6)
3. factory.test.ts: ALLOW/REJECT 기반, rejectionRecorder 주입 확인 (F21)
4. approval-broker.test.ts: waitForApproval 관련 테스트 제거
5. json/sqlite-approval-store.test.ts: rejection CRUD + policy version CRUD + fresh init (F14-F16, N7, E3-E4)
6. control-handler.test.ts: tx_approval case 제거, policy_approval description 전달 (E5, E7)
7. tool-surface.test.ts: approval 대기 제거, listRejections/listPolicyVersions 조회 도구 테스트 (F22)

## 최종 검증
- [ ] N1, N2: baseline 대비 error TS 비증가
- [ ] N3: guarded-wdk npm test 통과
- [ ] N4: daemon npm test 통과
- [ ] N5: packages/ src/에서 삭제 대상 심볼 잔존 0건
- [ ] N7: fresh store init 후 rejection/policyVersion CRUD 동작
- [ ] E1-E7: 모든 엣지케이스 테스트 통과

## FP/FN
- **FP**: 없음
- **FN**: N5 grep으로 전체 검증
