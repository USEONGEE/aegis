# Device → Signer 추상화 - v0.1.9

## 문제 정의

### 현상
- WDK approval/signing 도메인에서 서명 주체를 `Device`로 명명하고 있음
- 타입: `StoredDevice`, `DeviceRow`, `DeviceRevokedError`
- 메서드: `saveDevice`, `getDevice`, `listDevices`, `revokeDevice`, `isDeviceRevoked`
- 필드: `deviceId`, `pairedAt`
- DB 테이블: `devices`, 컬럼: `device_id`; JSON 파일: `devices.json`
- 공유 계약: `SignedApproval.deviceId` — guarded-wdk, daemon, app 모두 참조
- 영향 범위:
  - guarded-wdk: approval-store, store-types, errors, json/sqlite 구현, verifier, broker
  - daemon: control-handler, wdk-host, admin-server
  - app: SignedApprovalBuilder, approval types, SettingsScreen (signer_list protocol + UI), PairingService (relay 메시지 필드명 1개), AppProviders (targetSignerId)
  - **app 제외**: IdentityKeyManager — 물리 디바이스 ID 생성 도메인 (getDeviceId 유지). PairingService 내부 로직 유지, relay 메시지 필드명만 변경

### 원인
- 초기 설계에서 서명 주체가 물리적 디바이스(모바일 앱)였기 때문에 `Device`로 명명
- 서명 주체가 디바이스에 국한되지 않음에도 네이밍이 그대로 유지됨

### 영향
- 웹 대시보드, 서버 사이드 서명자 등 비디바이스 서명 주체 추가 시 의미 불일치
- 새로운 개발자가 "Device"를 보고 물리적 디바이스만 가능하다고 오해할 수 있음
- WDK의 핵심 원칙 "서명 엔진"과 네이밍이 불일치 — 서명 엔진은 서명 주체(Signer)를 관리해야 함

### 목표
- WDK approval/signing 도메인 내부의 `Device` 네이밍을 `Signer`로 일반화
- 공유 계약(`SignedApproval.deviceId` → `signerId`) 포함 — app 코드도 함께 변경
- DB 스키마 `signers` 테이블 + JSON 파일 `signers.json`으로 변경
- 디바이스에 한정되지 않는 네이밍으로, 향후 다양한 서명 주체 타입 확장을 막지 않음

### 비목표 (Out of Scope)
- 새로운 서명 주체 타입 추가 (웹, 서버 등) — 이번은 rename만
- relay 패키지 — relay의 device는 실제 물리 디바이스 등록 도메인이므로 rename 대상 아님
- `device_revoke` approval type 문자열 자체의 rename — approval type은 별도 Phase
- app의 IdentityKeyManager — 물리 디바이스 ID 생성 도메인 (getDeviceId 유지)
- PairingService 내부 로직 (물리 디바이스 ID 생성/페어링) — relay 메시지 필드명만 rename
- 서명 로직 변경 — 순수 네이밍 리팩토링

## 추가 결정사항
- `device_revoke` handler의 `metadata.deviceId` → `metadata.signerId`로 rename (revoke 대상이 signer이므로)
- approval type 문자열 `"device_revoke"` 자체는 유지 (별도 Phase)

## 제약사항
- v0.1.7 (Store 네이밍 통일)에서 확립된 `StoredDevice` + `DeviceRow` 패턴을 기반으로 진행
- Breaking change 허용 (프로젝트 원칙)
- `pairedAt` → `registeredAt` 변경 포함 (디바이스 "페어링"이 아니라 서명자 "등록")
- **기존 store 데이터 reset 허용** — pre-1.0이므로 기존 `devices.json` / SQLite `devices` 테이블의 마이그레이션 불필요. 스키마 변경 후 기존 데이터는 버림
