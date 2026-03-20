# Step 03: Daemon 소비자 변경

## 메타데이터
- **소유 DoD**: F9, F10, F11, F12, F14
- **수정 파일**: `packages/daemon/src/tool-surface.ts`, `packages/daemon/src/wdk-host.ts`, `packages/daemon/src/control-handler.ts`
- **의존성**: Step 01, 02

## 구현 내용
1. tool-surface.ts: `swapPoliciesForWallet()` 함수 삭제 + tool call 전 swap 호출 제거
2. wdk-host.ts: 부팅 시 정책 복원 로직 삭제, `WDKInstance.updatePolicies` 삭제, `createMockWDK`에서 `updatePolicies` 삭제
3. control-handler.ts: `ApprovalStoreReader` → `ApprovalStoreWriter` 확장 (`savePolicy` 포함), `wdk.updatePolicies` → `store.savePolicy(accountIndex, chainId, { policies, signature: {} })`

## 완료 조건
- [ ] F9: `swapPoliciesForWallet` 검색 0건
- [ ] F10: control-handler에서 `updatePolicies` 검색 0건 + `savePolicy` 호출 존재
- [ ] F11: `restoredPolicies` 검색 0건
- [ ] F12: wdk-host에서 `updatePolicies` 메서드 0건
- [ ] F14: `ApprovalStoreWriter` 또는 동등 타입에 `savePolicy` 존재

## FP/FN 검증
- **FP**: 없음.
- **FN**: control-handler.test.ts의 mock 변경 → Step 05에서 처리.
