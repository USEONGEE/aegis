# Step 02: Middleware 단순화

## 메타데이터
- **소유 DoD**: F3, F4, F5, F6, F7, F8
- **수정 파일**: `packages/guarded-wdk/src/guarded-middleware.ts`
- **의존성**: Step 01

## 구현 내용
1. `MiddlewareConfig`에서 `approvalBroker` 제거
2. `MiddlewareConfig`에 `rejectionRecorder: (entry: RejectionEntry) => Promise<void>` 추가
3. sendTransaction/transfer/signTransaction에서 REQUIRE_APPROVAL 분기 전체 제거
4. waitForApproval 호출 제거
5. ApprovalRequested 이벤트 emit 제거
6. REJECT 시: `rejectionRecorder()` 호출 (실패 시 catch+로그) → `PolicyRejectionError` throw

## 완료 조건
- [ ] F3, F4, F5, F6, F7, F8

## FP/FN
- **FP**: 없음
- **FN**: factory에서 rejectionRecorder 주입 → Step 05에서 확인
