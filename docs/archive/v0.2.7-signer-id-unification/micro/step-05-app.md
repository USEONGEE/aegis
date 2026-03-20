# Step 05: App

## 메타데이터
- **소유 DoD**: F11, F12, F13, F14
- **수정 파일**: `packages/app/src/core/approval/SignedApprovalBuilder.ts`, `packages/app/src/core/approval/types.ts`, `packages/app/src/core/crypto/PairingService.ts`, `packages/app/src/domains/settings/screens/SettingsScreen.tsx`
- **의존성**: Step 01
- **롤백**: 단일 커밋 revert

## Scope
- SignedApprovalBuilder: `private signerId` 필드, `setSignerId()`, 빌드 payload에서 signerId 포함
- types.ts: `SignedApprovalPayload.signerId`
- PairingService: pairing_confirm 전송 시 `signerId: deviceId` → 제거 또는 publicKey 사용
- SettingsScreen: `PairedSigner.signerId` → `publicKey`, UI에서 `signer.name ?? 축약publicKey` fallback

## 구현 내용
1. SignedApprovalBuilder: `private signerId` 제거, `setSignerId()` 제거, build에서 signerId 포함하지 않음
2. types.ts: `SignedApprovalPayload`에서 `signerId` 필드 제거
3. PairingService: `sendControl({ signerId: deviceId, ... })` → signerId 필드 제거. daemon은 identityPubKey로 signer 등록.
4. SettingsScreen: `PairedSigner` 인터페이스에서 signerId → publicKey. `signer.name ?? signer.signerId` → `signer.name ?? \`${signer.publicKey.slice(0,8)}...${signer.publicKey.slice(-4)}\``
5. SettingsScreen device_revoke: `forDeviceRevoke({ targetSignerId: signer.signerId })` → `forDeviceRevoke({ targetPublicKey: signer.publicKey })`. SignedApprovalBuilder의 `forDeviceRevoke`도 `targetSignerId` → `targetPublicKey` 파라미터 변경. relay 전송 payload에 `targetPublicKey` 포함.

## 완료 조건
- [ ] F11: SignedApprovalBuilder에서 signerId 0건
- [ ] F12: types.ts에서 signerId 0건
- [ ] F13: SettingsScreen에서 signerId 0건 + name fallback 축약 publicKey
- [ ] F14: PairingService에서 signerId 0건

## FP/FN
- **FP**: 없음
- **FN**: App 테스트 (PairingService.test.js) → Step 06에서 처리.
