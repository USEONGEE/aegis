# Step 04: Daemon

## 메타데이터
- **소유 DoD**: F9, F10
- **수정 파일**: `packages/daemon/src/control-handler.ts`, `packages/daemon/src/admin-server.ts`
- **의존성**: Step 01
- **롤백**: 단일 커밋 revert

## Scope
- control-handler: pairing_confirm 핸들러, device_revoke 핸들러, toSignedApproval 매핑
- admin-server: signer_list 응답

## 구현 내용
1. toSignedApproval: `signerId` 필드 제거 (SignedApproval에서 삭제됨)
2. pairing_confirm: `saveSigner(signerId, identityPubKey)` → `saveSigner(identityPubKey)`. signerId 변수 → identityPubKey 직접 사용.
3. device_revoke: payload에서 `targetPublicKey` 필드를 받아 `expectedTargetHash = SHA-256(targetPublicKey)`로 검증 컨텍스트 설정. 기존 `payload.signerId` → `payload.targetPublicKey`.
4. admin-server signer_list: 응답에서 `signerId: d.signerId` → `publicKey: d.publicKey`

## 완료 조건
- [ ] F9: pairing_confirm에서 saveSigner(publicKey, ...) 호출
- [ ] F10: admin-server에서 signerId 참조 0건

## FP/FN
- **FP**: 없음
- **FN**: device_revoke의 payload 구조가 App에서 바뀌어야 함 → Step 05와 연동.
