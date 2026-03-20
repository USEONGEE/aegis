# Step 03: SignedApprovalBroker 정리

## 메타데이터
- **소유 DoD**: F9, F10
- **수정 파일**: `packages/guarded-wdk/src/signed-approval-broker.ts`
- **의존성**: Step 02

## 구현 내용
1. `waitForApproval()` 메서드 삭제
2. `createRequest()` tx 타입 경로 삭제 (policy/wallet 경로 유지)
3. 관련 pending tx approval 로직 정리

## 완료 조건
- [ ] F9, F10

## FP/FN
- **FP**: 없음
- **FN**: 없음. policy/wallet createRequest는 유지.
