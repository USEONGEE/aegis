# 설계 - v0.1.9

## 변경 규모
**규모**: 운영 리스크
**근거**: DB 스키마 변경(SQLite `devices` → `signers`, JSON `devices.json` → `signers.json`) + 3개 패키지 내부 API 변경 + daemon↔app control protocol 변경

---

## 문제 요약
WDK approval/signing 도메인에서 서명 주체를 "Device"로 명명하여, 비디바이스 서명 주체 지원 시 의미 불일치 발생. "Signer"로 일반화하는 순수 rename 리팩토링.

> 상세: [README.md](README.md) 참조

## 접근법
- Layer-by-Layer Bottom-Up: 의존성 방향을 따라 guarded-wdk(types → API → broker) → daemon → app 순서로 점진적 rename
- 4 커밋으로 분할하여 각 커밋이 검증 가능한 단위 유지

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: Big-Bang (단일 커밋) | 중간 상태 없음, 일관성 | ~800줄 diff, 실패 시 전체 롤백, 원인 추적 어려움 | ❌ |
| B: Layer-by-Layer Bottom-Up | 각 커밋 검증 가능, 리뷰 단위 명확, 롤백 최소 단위 | 커밋 수 증가 (4 vs 1) | ✅ |
| C: Alias + Deprecation | backward compatibility | "No Backward Compatibility" 원칙 위반, 3배 작업량, 과잉 설계 | ❌ |

**선택 이유**: 프로젝트 원칙(No Backward Compatibility, Breaking change 허용, Primitive First)에 정합하면서, 의존성 방향을 따르므로 타입 오류가 상위 레이어에서 자연스럽게 드러남

## 기술 결정
- 순수 mechanical rename — 로직 변경 없음
- 기존 store 데이터 reset 허용 (마이그레이션 불필요)
- `device_revoke` approval type 문자열은 유지, `metadata.deviceId` → `metadata.signerId`로 변경
- PairingService 내부 로직(getDeviceId 등) 유지, relay 메시지 필드명만 변경

## 가정/제약
- pre-1.0 단계이므로 기존 store 데이터(SQLite, JSON)의 하위 호환 불필요 — reset 허용
- 외부 소비자 없음 — admin command 이름(`device_list` → `signer_list`) 변경 가능
- v0.1.7 Store 네이밍 통일이 완료된 상태에서 진행 (StoredDevice + DeviceRow 패턴 확립됨)
- app과 daemon을 동일 release에서 함께 배포 (protocol 불일치 방지)

---

## 범위 / 비범위

**범위 (In Scope)**:
- guarded-wdk: 타입, 에러, 공개 API, store 구현 (json/sqlite), verifier, broker
- daemon: control-handler, wdk-host, admin-server + control protocol
- app: approval types, SignedApprovalBuilder, SettingsScreen (UI + device_list protocol), PairingService (relay 메시지 필드 1개), AppProviders (targetDeviceId)
- 테스트: guarded-wdk 6개, daemon 2개, app 1개

**비범위 (Out of Scope)**:
- relay 패키지 — 물리 디바이스 등록 도메인
- app IdentityKeyManager — 물리 디바이스 ID 생성 도메인 (getDeviceId 메서드 유지)
- `device_revoke` approval type 문자열 자체
- 새로운 서명 주체 타입 추가

## API/인터페이스 계약

### guarded-wdk 공개 API 변경

| Before | After |
|--------|-------|
| `StoredDevice` | `StoredSigner` |
| `StoredDevice.deviceId` | `StoredSigner.signerId` |
| `StoredDevice.pairedAt` | `StoredSigner.registeredAt` |
| `SignedApproval.deviceId` | `SignedApproval.signerId` |
| `HistoryEntry.deviceId` | `HistoryEntry.signerId` |
| `saveDevice(id, pubKey)` | `saveSigner(id, pubKey)` |
| `getDevice(id)` | `getSigner(id)` |
| `listDevices()` | `listSigners()` |
| `revokeDevice(id)` | `revokeSigner(id)` |
| `isDeviceRevoked(id)` | `isSignerRevoked(id)` |
| `getLastNonce(approver, deviceId)` | `getLastNonce(approver, signerId)` |
| `updateNonce(approver, deviceId, nonce)` | `updateNonce(approver, signerId, nonce)` |
| `DeviceRevokedError` | `SignerRevokedError` |
| `DeviceRevoked` event | `SignerRevoked` event |

### daemon↔app control protocol 변경

| Message | Before | After |
|---------|--------|-------|
| `pairing_confirm` payload | `{ deviceId: string }` | `{ signerId: string }` |
| admin command | `device_list` | `signer_list` |
| admin response | `{ devices: [...] }` | `{ signers: [...] }` |
| admin response item | `{ deviceId, pairedAt }` | `{ signerId, registeredAt }` |
| revoke metadata | `{ deviceId: string }` | `{ signerId: string }` |

## 데이터 모델/스키마

### SQLite 변경

```sql
-- Before
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  name TEXT,
  paired_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS nonces (
  approver TEXT NOT NULL,
  device_id TEXT NOT NULL,
  last_nonce INTEGER NOT NULL,
  PRIMARY KEY (approver, device_id)
);

-- After
CREATE TABLE IF NOT EXISTS signers (
  signer_id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  name TEXT,
  registered_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS nonces (
  approver TEXT NOT NULL,
  signer_id TEXT NOT NULL,
  last_nonce INTEGER NOT NULL,
  PRIMARY KEY (approver, signer_id)
);
```

### JSON 파일 변경
- `devices.json` → `signers.json`
- Row 키: `device_id` → `signer_id`, `paired_at` → `registered_at`
- 기존 데이터 reset 허용 (마이그레이션 없음)

### Internal Row Type 변경

| Before (`DeviceRow`) | After (`SignerRow`) |
|---------------------|---------------------|
| `device_id: string` | `signer_id: string` |
| `paired_at: number` | `registered_at: number` |
| `revoked_at: number \| null` | `revoked_at: number \| null` (유지) |

### History Entry 변경
- `StoredHistoryEntry.device_id` → `signer_id`

## 데이터 흐름
N/A: 데이터 흐름 자체는 변경 없음. 필드명만 변경. 기존 흐름: app → relay → daemon → guarded-wdk store. 변경 후에도 동일한 흐름, 필드명만 deviceId → signerId.

## 테스트 전략
- **guarded-wdk**: `tsc --noEmit` + `jest --verbose` (6개 테스트 파일). 각 커밋 후 실행
- **daemon**: `tsc --noEmit` + `jest --verbose` (2개 테스트 파일). Commit 3 후 실행
- **app**: `npx tsc -p packages/app/tsconfig.json --noEmit` (앱 유닛 테스트는 no-op이므로 타입 체크만). PairingService.test.js mock data 필드명 업데이트
- **최종**: 전체 모노레포 `tsc --noEmit` + 전체 `jest`
- **grep 검증**: 각 커밋 후 해당 패키지 src/에서 old name grep → 0 결과 확인

## 실패/에러 처리
N/A: 순수 rename 리팩토링. 에러 처리 로직 변경 없음. `SignerRevokedError`는 `DeviceRevokedError`의 이름만 변경한 것으로 동작 동일.

## 롤아웃/롤백 계획
N/A: pre-1.0, 프로덕션 배포 없음. 기존 store 데이터 reset 허용이므로 롤백 시 DB/JSON 파일 삭제 후 재시작으로 충분.

## 관측성
N/A: 로그 메시지의 "Device" → "Signer" 문자열 변경만 해당. 메트릭/알람 없음 (pre-1.0).

## 보안/권한
N/A: 서명 검증 로직, 승인 흐름, 권한 모델 변경 없음. 순수 네이밍 변경이므로 보안 영향 없음.

## 성능/스케일
N/A: 순수 rename. 런타임 동작 변화 없음.

---

## 아키텍처 개요

의존성 그래프 (화살표 = "depends on"):

```
app/SettingsScreen, app/AppProviders
  ↓
app/SignedApprovalBuilder, app/PairingService
  ↓
app/approval/types.ts
  ↓  (같은 구조, 독립 정의)
daemon/control-handler, daemon/admin-server, daemon/wdk-host
  ↓
guarded-wdk/signed-approval-broker, guarded-wdk/approval-verifier
  ↓
guarded-wdk/json-approval-store, guarded-wdk/sqlite-approval-store
  ↓
guarded-wdk/approval-store (abstract), guarded-wdk/errors
  ↓
guarded-wdk/store-types (internal)
```

Bottom-up으로 아래부터 위로 rename 진행.

---

## 커밋 전략 (4 커밋)

### Commit 1: guarded-wdk types + public API + store 구현
**파일 7개**: store-types.ts, errors.ts, approval-store.ts, json-approval-store.ts, sqlite-approval-store.ts, approval-verifier.ts, index.ts

핵심 변경:
- `DeviceRow` → `SignerRow`, `device_id` → `signer_id`, `paired_at` → `registered_at`
- `DeviceRevokedError` → `SignerRevokedError`
- `StoredDevice` → `StoredSigner`, 5개 메서드 rename
- `SignedApproval.deviceId` → `signerId`, `HistoryEntry.deviceId` → `signerId`
- JSON 파일 `devices.json` → `signers.json`
- SQLite 테이블 `devices` → `signers`

**예상**: ~270줄

### Commit 2: guarded-wdk broker + 테스트
**파일 7개**: signed-approval-broker.ts + 6개 테스트 파일

핵심 변경:
- broker: `signedApproval.deviceId` → `signerId`, `metadata.deviceId` → `metadata.signerId`, `DeviceRevoked` → `SignerRevoked`
- 테스트: mock data, assertion, mock store 메서드명 전부 업데이트

**검증**: guarded-wdk `tsc --noEmit` + `jest --verbose` 통과
**예상**: ~200줄

### Commit 3: daemon + 테스트
**파일 5개**: control-handler.ts, wdk-host.ts, admin-server.ts + 2개 테스트 파일

핵심 변경:
- control-handler: `ControlPayload.deviceId` → `signerId`, `saveDevice` → `saveSigner`
- admin-server: `device_list` → `signer_list`, response `devices` → `signers`
- wdk-host: `listDevices` → `listSigners`

**검증**: daemon `tsc --noEmit` + `jest --verbose` 통과
**예상**: ~150줄

### Commit 4: app shared contract + protocol consumers
**파일 6개**: approval/types.ts, SignedApprovalBuilder.ts, PairingService.ts, SettingsScreen.tsx, AppProviders.tsx + PairingService.test.js

핵심 변경:
- types.ts: `SignedApproval.deviceId` → `signerId`
- SignedApprovalBuilder: `deviceId` → `signerId`, `targetDeviceId` → `targetSignerId`
- PairingService: `pairing_confirm.payload.deviceId` → `signerId` (line 127, 내부 `getDeviceId()` 호출은 유지)
- SettingsScreen: `device_list` → `signer_list`, `devices` → `signers`, `PairedDevice` → `PairedSigner`, UI 문자열
- AppProviders: `targetDeviceId` → `targetSignerId`
- PairingService.test.js: mock data `deviceId` → `signerId`

**검증**: `npx tsc -p packages/app/tsconfig.json --noEmit` 통과
**예상**: ~100줄

---

## 리스크/오픈 이슈

### Risk 1: SignedApproval 공유 계약 파손 (High)
guarded-wdk, daemon, app이 `signerId` 필드를 동시에 사용해야 함. Bottom-up 순서 + 패키지별 테스트로 완화.

### Risk 2: `device_revoke` metadata 필드 불일치 (High)
`metadata.signerId`를 daemon과 app이 동일하게 사용해야 함. broker 테스트 + SignedApprovalBuilder.forDeviceRevoke에서 검증.

### Risk 3: PairingService payload 변경 (Medium)
PairingService가 `pairing_confirm.payload.signerId`를 보내야 daemon이 처리 가능. PairingService 내부 로직은 유지, relay 메시지 필드명만 변경.

### Risk 4: SettingsScreen protocol 변경 (Medium)
`device_list` → `signer_list`, response `devices` → `signers`. 앱 유닛 테스트 없으므로 tsc --noEmit으로 타입 체크만 가능.

### Risk 5: admin-server 커맨드명 변경 (Low)
pre-1.0, 외부 소비자 없음. Breaking change 허용.

### Risk 6: 테스트 누락 (Low)
TypeScript strict mode에서 타입 불일치 자동 감지. 각 커밋 후 jest 실행.
