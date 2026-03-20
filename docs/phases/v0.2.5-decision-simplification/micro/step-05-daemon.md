# Step 05: Daemon 변경

## 메타데이터
- **소유 DoD**: F17, F18, F19, F21, F22
- **수정 파일**: `packages/daemon/src/tool-surface.ts`, `packages/daemon/src/control-handler.ts`, `packages/daemon/src/execution-journal.ts`, `packages/daemon/src/index.ts`, `packages/guarded-wdk/src/guarded-wdk-factory.ts`
- **의존성**: Step 02, 03, 04

## 구현 내용
1. tool-surface.ts: sendTransaction/signTransaction/transfer approval 대기 로직 제거
2. tool-surface.ts: `listRejections` + `listPolicyVersions` 조회 도구 추가 (TOOL_DEFINITIONS + handler)
3. tool-surface.ts: policyRequest `reason` → `description` rename
4. control-handler.ts: `tx_approval` case 삭제
5. control-handler.ts: policy_approval에서 `savePolicy(accountIndex, chainId, input, pending.content)` — description 전달
6. execution-journal.ts: `pending_approval` 문서/flow 정리
7. index.ts: `ApprovalRequested` 이벤트 relay 제거
8. guarded-wdk-factory.ts: middleware 등록에서 `approvalBroker` 제거, `rejectionRecorder` 주입

## 완료 조건
- [ ] F17, F18, F19, F21, F22

## FP/FN
- **FP**: 없음
- **FN**: 없음
