# 작업위임서 — Device → Signer 추상화

> WDK의 서명자를 "device"에서 "signer"로 일반화. 서명 주체가 디바이스일 필요 없음.

---

## 선행: v0.1.7 (Store 네이밍 통일)

v0.1.7에서 `Stored*` 패턴 통일 + camelCase 전환이 진행중. `DeviceRecord` → `StoredDevice`로 이미 변경됨.
**이 Phase는 v0.1.7 완료 후 `StoredDevice` → `StoredSigner`로 rename하는 작업.**

---

## 6하원칙

### Who (누가)
- 다음 세션
- 필요 접근: guarded-wdk, daemon

### What (무엇을)
- [ ] `StoredDevice` → `StoredSigner` rename
- [ ] `DeviceRow` → `SignerRow` (store-types.ts)
- [ ] `deviceId` → `signerId` (SignedApproval, HistoryEntry, nonce)
- [ ] `saveDevice` → `saveSigner`, `revokeDevice` → `revokeSigner`, `isDeviceRevoked` → `isSignerRevoked`, `listDevices` → `listSigners`, `getDevice` → `getSigner`
- [ ] `DeviceRevokedError` → `SignerRevokedError`
- [ ] `pairedAt` → `registeredAt`
- [ ] verifyApproval Step 2: `isDeviceRevoked` → `isSignerRevoked`
- [ ] daemon: deviceId 참조 → signerId
- [ ] DB: `devices` 테이블 → `signers`

### When (언제)
- 선행: v0.1.7 완료 후
- v0.1.8 (EvaluationContext)과 독립

### Where (어디서)
- `packages/guarded-wdk/src/approval-store.ts` — StoredDevice → StoredSigner, 메서드 rename
- `packages/guarded-wdk/src/approval-verifier.ts` — Step 2
- `packages/guarded-wdk/src/signed-approval-broker.ts` — deviceId 참조
- `packages/guarded-wdk/src/errors.ts` — DeviceRevokedError → SignerRevokedError
- `packages/guarded-wdk/src/store-types.ts` — DeviceRow → SignerRow
- `packages/guarded-wdk/src/json-approval-store.ts` — 구현
- `packages/guarded-wdk/src/sqlite-approval-store.ts` — 구현 + DB 스키마
- `packages/daemon/src/control-handler.ts` — deviceId → signerId
- `packages/daemon/src/wdk-host.ts` — listDevices → listSigners

### Why (왜)
WDK는 서명 엔진. 서명 주체가 디바이스인지 아닌지는 WDK 관심사가 아님. 웹 대시보드, 서버 등 다양한 서명 주체를 지원하려면 일반화 필요.

### How (어떻게)
- `/quick-phase-workflow`
- v0.1.7에서 확립된 `StoredDevice` + `DeviceRow` 패턴을 `StoredSigner` + `SignerRow`로 rename

**네이밍 매핑**:
```
StoredDevice        → StoredSigner
DeviceRow           → SignerRow
deviceId            → signerId
pairedAt            → registeredAt
saveDevice          → saveSigner
revokeDevice        → revokeSigner
isDeviceRevoked     → isSignerRevoked
listDevices         → listSigners
getDevice           → getSigner
DeviceRevokedError  → SignerRevokedError
```

---

## 주의사항
- SignedApproval의 `deviceId` → `signerId`는 RN App 서명 생성 코드도 변경 필요
- nonce: `getLastNonce(approver, deviceId)` → `getLastNonce(approver, signerId)`
- DB: `devices` 테이블 → `signers` 테이블

## 시작 방법
```bash
# v0.1.7 완료 확인 후
# /quick-phase-workflow
```
