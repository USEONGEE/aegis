# DoD (Definition of Done) - v0.1.9

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | guarded-wdk 공개 API에서 `StoredDevice` → `StoredSigner`, `DeviceRevokedError` → `SignerRevokedError` 타입 rename 완료 | `grep -r "StoredDevice\|DeviceRevokedError" packages/guarded-wdk/src/` → 0 결과 |
| F2 | guarded-wdk 공개 메서드 `saveDevice/getDevice/listDevices/revokeDevice/isDeviceRevoked` → `saveSigner/getSigner/listSigners/revokeSigner/isSignerRevoked` rename 완료 | `grep -r "saveDevice\|getDevice\|listDevices\|revokeDevice\|isDeviceRevoked" packages/guarded-wdk/src/` → 0 결과 |
| F3 | `SignedApproval.deviceId` → `SignedApproval.signerId` 필드 rename 완료 (guarded-wdk + app) — 선언부와 사용처 모두 | `grep -n "deviceId" packages/guarded-wdk/src/approval-store.ts` → 0 결과 (계약 정의) + `grep -n "deviceId" packages/app/src/core/approval/types.ts` → 0 결과 (app 계약 정의) |
| F4 | `HistoryEntry` 타입의 `deviceId` 필드가 `signerId`로 rename 완료 | `grep -rn "deviceId" packages/guarded-wdk/src/approval-store.ts` → 0 결과 |
| F5 | `DeviceRow` → `SignerRow` 내부 타입 rename 완료, `device_id` → `signer_id`, `paired_at` → `registered_at` | `grep -r "DeviceRow\|device_id\|paired_at" packages/guarded-wdk/src/` → 0 결과 |
| F6 | `StoredDevice.pairedAt` → `StoredSigner.registeredAt` 필드 rename 완료 | `grep -r "pairedAt" packages/guarded-wdk/src/ packages/daemon/src/` → 0 결과 |
| F7 | SQLite 스키마: `devices` 테이블 → `signers`, `device_id` → `signer_id`, `paired_at` → `registered_at` | `grep -r "devices\|device_id\|paired_at" packages/guarded-wdk/src/sqlite-approval-store.ts` → 0 결과 |
| F8 | JSON 파일: `devices.json` → `signers.json` | `grep -r "devices\.json" packages/guarded-wdk/src/` → 0 결과 |
| F9 | nonce 테이블 컬럼: `device_id` → `signer_id` | `grep "device_id" packages/guarded-wdk/src/sqlite-approval-store.ts` → 0 결과 |
| F10 | `DeviceRevoked` 이벤트 → `SignerRevoked` 이벤트 rename | `grep -r "DeviceRevoked" packages/guarded-wdk/src/` → 0 결과 |
| F11 | `metadata.deviceId` → `metadata.signerId` (device_revoke handler) | `grep -r "metadata\.deviceId\|metadata\[.*deviceId" packages/guarded-wdk/src/ packages/daemon/src/` → 0 결과 |
| F12 | daemon `ControlPayload.deviceId` → `ControlPayload.signerId` | `grep -rn "deviceId" packages/daemon/src/control-handler.ts` → 0 결과 |
| F13 | daemon admin command `device_list` → `signer_list`, response `devices` → `signers` | `grep -r "device_list" packages/daemon/src/` → 0 결과 |
| F14 | daemon `listDevices` → `listSigners` 호출 | `grep -r "listDevices" packages/daemon/src/` → 0 결과 |
| F15 | app `SignedApprovalBuilder.deviceId` → `signerId`, `targetDeviceId` → `targetSignerId` | `grep -r "deviceId\|targetDeviceId" packages/app/src/core/approval/SignedApprovalBuilder.ts` → 0 결과 |
| F16 | app `PairingService`: `pairing_confirm` payload에서 `deviceId` 키 제거, `signerId` 키 사용 (`PairingResult.deviceId`와 `getDeviceId()`는 물리 디바이스 도메인이므로 유지) | `grep -A5 "type: 'pairing_confirm'" packages/app/src/core/crypto/PairingService.ts \| grep "signerId"` ≥ 1 + `grep -A5 "type: 'pairing_confirm'" packages/app/src/core/crypto/PairingService.ts \| grep "deviceId"` → 0 결과 |
| F17 | app `SettingsScreen` protocol: `device_list` → `signer_list`, `PairedDevice` 타입 rename, response 필드 rename | `grep -rn "device_list\|PairedDevice" packages/app/src/domains/settings/` → 0 결과 (PairingResult.deviceId는 물리 디바이스 scope 외이므로 제외) |
| F18 | app `AppProviders` `targetDeviceId` → `targetSignerId` | `grep "targetDeviceId" packages/app/src/app/providers/AppProviders.tsx` → 0 결과 |
| F19 | `device_revoke` approval type 문자열이 canonical 계약 지점에서 유지됨, `signer_revoke`는 도입되지 않음 | `grep -r "signer_revoke" packages/*/src/ packages/*/tests/` → 0 결과 + canonical 계약 파일에서 `device_revoke` 유지 확인: `grep "device_revoke" packages/guarded-wdk/src/approval-store.ts` ≥ 1, `grep "device_revoke" packages/daemon/src/control-handler.ts` ≥ 1, `grep "device_revoke" packages/guarded-wdk/src/signed-approval-broker.ts` ≥ 1 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk TypeScript: rename으로 인한 새 에러 0 | `npx tsc --noEmit -p packages/guarded-wdk/tsconfig.json` — 기존 guarded-wdk-factory.ts 5개 에러만 허용 |
| N2 | daemon TypeScript: rename으로 인한 새 에러 0 | `npx tsc --noEmit -p packages/daemon/tsconfig.json 2>&1 \| grep "error TS" \| grep -v "guarded-wdk-factory\|index\.ts\|openclaw-client\|wdk-host\.ts(101" \| grep -v "admin-server\.ts(219\|admin-server\.ts(251"` → 0 결과 |
| N3 | app TypeScript 컴파일 에러 0 | `npx tsc --noEmit -p packages/app/tsconfig.json` |
| N4 | guarded-wdk 전체 테스트 통과 | `cd packages/guarded-wdk && npm test` |
| N5 | daemon rename 영향 테스트 통과 | `cd packages/daemon && npx jest control-handler.test` (tool-surface.test.ts 기존 rootDir 실패는 scope 외) |
| N6 | app PairingService.test.js mock data 업데이트 | `grep -c "signerId" packages/app/tests/PairingService.test.js` ≥ 1 |
| N7 | guarded-wdk index.ts에서 `SignerRevokedError`, `StoredSigner` export | `grep -c "SignerRevokedError\|StoredSigner" packages/guarded-wdk/src/index.ts` ≥ 2 |

## 배포 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| D1 | daemon protocol rename (Commit 3)과 app protocol consumer rename (Commit 4)은 동일 PR로 제출된다 | PR의 commit list에 Commit 3, 4 모두 포함 확인 (또는 squash merge 시 단일 PR 확인) |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | `device_revoke` approval type으로 signer revoke 시 | `metadata.signerId`에서 대상 추출, `revokeSigner()` 호출, `SignerRevoked` 이벤트 발생 | guarded-wdk broker 테스트 (device_revoke 케이스) 통과 |
| E2 | revoked signer로 approval 제출 시 | `SignerRevokedError` throw | guarded-wdk verifier 테스트 (revoked signer 케이스) 통과 |
| E3 | nonce 복합 키 `(approver, signerId)` 작동 | 동일 approver-signer 쌍에서 nonce 증가 검증 | sqlite/json approval store 테스트 (nonce 케이스) 통과 |
| E4 | PairingService가 `getDeviceId()` 호출 후 relay 메시지에 `signerId`로 전달 | 내부 ID 생성은 `getDeviceId()` 유지, 메시지 필드만 `signerId` | `grep -c "getDeviceId" packages/app/src/core/crypto/PairingService.ts` ≥ 1 (유지) + `grep -n "signerId" packages/app/src/core/crypto/PairingService.ts` (payload 부분 확인) |
| E5 | IdentityKeyManager의 `getDeviceId()` 등은 변경되지 않음 | 물리 디바이스 ID 도메인 코드는 그대로 | `grep -c "getDeviceId\|deviceId" packages/app/src/core/identity/IdentityKeyManager.ts` = 3 (baseline 고정) |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| Device 네이밍 → Signer 일반화 | F1~F10 | ✅ |
| 공유 계약 변경 (SignedApproval + app) | F3, F15~F18 | ✅ |
| DB 스키마 변경 | F7, F8, F9 | ✅ |
| 향후 확장을 막지 않는 네이밍 | F1~F19 전체 (rename 완료) | ✅ |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 반영 | 커버 |
|----------|---------|------|
| Layer-by-Layer Bottom-Up 4 커밋 | N1~N5 (패키지별 검증) | ✅ |
| 기존 store 데이터 reset 허용 | F7~F9 (새 스키마, 마이그레이션 없음) | ✅ |
| device_revoke 문자열 유지 | F19 (signer_revoke 금지 + device_revoke 유지) | ✅ |
| metadata.deviceId → signerId | F11 | ✅ |
| PairingService 내부 유지, 필드명만 변경 | E4, F16 | ✅ |
| Commit 3+4 동일 release | D1 | ✅ |
