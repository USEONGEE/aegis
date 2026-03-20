# Step 04: 테스트 수정 + 최종 검증

## 메타데이터
- **소유 DoD**: N1, N2, N3, N4, N5, E1, E2, E3, F8
- **수정 파일**: `packages/guarded-wdk/tests/json-approval-store.test.ts`, `packages/guarded-wdk/tests/sqlite-approval-store.test.ts`, `packages/guarded-wdk/tests/factory.test.ts`, `packages/guarded-wdk/tests/integration.test.ts`, `packages/daemon/tests/tool-surface.test.ts`
- **의존성**: Step 01, 02, 03

## 구현 내용
1. json-approval-store.test.ts: `policiesJson`/`signatureJson` assertions → `policies`/`signature`
2. sqlite-approval-store.test.ts: 동일 + E2 깨진 JSON 에러 테스트 추가
3. factory.test.ts: MockApprovalStore.savePolicy에서 policiesJson 제거 + assertions 변경
4. integration.test.ts: MockApprovalStore 동일 변경
5. daemon/tool-surface.test.ts: mock store loadPolicy 반환값 변경

## 최종 검증 (이 Step 완료 후 수행)
- [ ] N1: `cd packages/guarded-wdk && npm run typecheck` → 종료코드 0
- [ ] N2: `cd packages/daemon && npm run build` → 종료코드 0
- [ ] N3: `cd packages/guarded-wdk && npm test` → 종료코드 0
- [ ] N4: `cd packages/daemon && npm test` → 종료코드 0
- [ ] N5: `grep -r 'policiesJson\|signatureJson' packages/*/src packages/*/tests` → 0건
- [ ] E1: empty policy 테스트 통과 (policies: [], signature: {})
- [ ] E2: 깨진 JSON row에서 savePolicy 에러 확인
- [ ] E3: TS 컴파일 통과 (N1, N2)
- [ ] F8: `npx tsx scripts/type-dep-graph/index.ts --include=guarded-wdk --json` → StoredCron→CronInput, StoredJournal→JournalInput, StoredPolicy→PolicyInput 엣지 존재

## FP/FN 검증
- **FP (과잉)**: 없음. 수정 대상은 design.md에서 전수 검색된 5개 테스트 파일.
- **FN (누락)**: N5 검증으로 packages/ 전체에서 잔존 참조 0건 확인. 테스트 파일까지 포함.
