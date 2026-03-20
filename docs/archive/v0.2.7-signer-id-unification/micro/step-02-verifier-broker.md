# Step 02: Verifier + Broker

## 메타데이터
- **소유 DoD**: F6, F7
- **수정 파일**: `packages/guarded-wdk/src/approval-verifier.ts`, `packages/guarded-wdk/src/signed-approval-broker.ts`, `packages/guarded-wdk/src/errors.ts`
- **의존성**: Step 01
- **롤백**: 단일 커밋 revert

## Scope
- `approval-verifier.ts`: 6단계 검증의 Step 2(폐기), Step 5(nonce)에서 signerId → approver
- `signed-approval-broker.ts`: device_revoke 처리, history entry 생성, SignerRevoked 이벤트
- `errors.ts`: SignerRevokedError 파라미터

## 구현 내용
1. verifier: `store.isSignerRevoked(signerId)` → `store.isSignerRevoked(approver)`
2. verifier: `store.getLastNonce(approver, signerId)` → `store.getLastNonce(approver)`
3. verifier: `store.updateNonce(approver, signerId, nonce)` → `store.updateNonce(approver, nonce)`
4. broker: device_revoke에서 폐기 대상 식별 변경 — `signedApproval.signerId` 직접 사용 → `signedApproval.targetHash`로 store의 signer 목록 순회하여 `SHA-256(publicKey) === targetHash`인 signer 찾아 `revokeSigner(publicKey)` 호출
5. broker: history entry에서 signerId 제거
6. errors: `SignerRevokedError` 파라미터 `signerId` → `publicKey`

## 완료 조건
- [ ] F6: approval-verifier.ts에서 `signerId` 검색 0건
- [ ] F7: signed-approval-broker.ts에서 `signerId` 검색 0건 (문자열 리터럴 제외)

## FP/FN
- **FP**: 없음
- **FN**: broker의 device_revoke에서 "누구를 revoke하는가" — targetHash가 폐기 대상 publicKey의 SHA-256. 이 관계는 verifier Step 6에서 검증.
