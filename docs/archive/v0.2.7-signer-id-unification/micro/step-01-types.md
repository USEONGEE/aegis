# Step 01: 타입 변경

## 메타데이터
- **소유 DoD**: F1, F2, F3, F4, F5
- **수정 파일**: `packages/guarded-wdk/src/approval-store.ts`, `packages/guarded-wdk/src/store-types.ts`
- **의존성**: 없음
- **롤백**: 단일 커밋 revert

## Scope
- `approval-store.ts`: SignedApproval, HistoryEntry, StoredSigner 인터페이스 + ApprovalStore 추상 메서드 시그니처
- `store-types.ts`: SignerRow (signer_id → public_key PK), NonceRow (복합키 → 단일키)

## 구현 내용
1. `SignedApproval`: `signerId: string` 필드 제거
2. `HistoryEntry`: `signerId: string` 필드 제거
3. `StoredSigner`: `signerId: string` 제거, `publicKey`가 유일한 식별자
4. `saveSigner(signerId, publicKey)` → `saveSigner(publicKey, name?)`
5. `getSigner(signerId)` → `getSigner(publicKey)`
6. `revokeSigner(signerId)` → `revokeSigner(publicKey)`
7. `isSignerRevoked(signerId)` → `isSignerRevoked(publicKey)`
8. `getLastNonce(approver, signerId)` → `getLastNonce(approver)`
9. `updateNonce(approver, signerId, nonce)` → `updateNonce(approver, nonce)`
10. `store-types.ts`: `SignerRow.signer_id` → 제거, `public_key`가 PK. `NonceRow`: `signer_id` 제거.

## 완료 조건
- [ ] F1: SignedApproval에 signerId 없음
- [ ] F2: HistoryEntry에 signerId 없음
- [ ] F3: StoredSigner에 signerId 없음, publicKey가 PK
- [ ] F4: signer 메서드가 publicKey 파라미터 사용
- [ ] F5: nonce 메서드가 approver 단일키

## FP/FN
- **FP**: 없음. 타입 정의 파일 2개만 수정.
- **FN**: errors.ts SignerRevokedError → Step 02에서 처리. index.ts export → 별도 확인.
