# Step 04: app shared contract + protocol consumers

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert, Step 03과 함께 같은 PR)
- **선행 조건**: Step 03 완료

---

## 1. 구현 내용 (design.md 기반)
- `approval/types.ts`: `SignedApproval.deviceId` → `signerId`, payload 타입 rename
- `SignedApprovalBuilder.ts`: `private deviceId` → `signerId`, `targetDeviceId` → `targetSignerId`, `setDeviceId` → `setSignerId`, `forDeviceRevoke` metadata rename
- `PairingService.ts`: `pairing_confirm` payload의 `deviceId` → `signerId` (line 127, `getDeviceId()`와 `PairingResult.deviceId`는 유지)
- `SettingsScreen.tsx`: `device_list` → `signer_list`, `PairedDevice` → `PairedSigner`, `devices` state → `signers`, response field rename, UI 텍스트
- `AppProviders.tsx`: `targetDeviceId` → `targetSignerId`
- `PairingService.test.js`: mock data `deviceId` → `signerId`

## 2. 완료 조건
- [ ] `grep -n "deviceId\|targetDeviceId" packages/app/src/core/approval/SignedApprovalBuilder.ts` → 0 결과
- [ ] `grep -n "deviceId" packages/app/src/core/approval/types.ts` → 0 결과
- [ ] `grep -A5 "type: 'pairing_confirm'" packages/app/src/core/crypto/PairingService.ts | grep "signerId"` ≥ 1
- [ ] `grep -A5 "type: 'pairing_confirm'" packages/app/src/core/crypto/PairingService.ts | grep "deviceId"` → 0 결과
- [ ] `grep -rn "device_list\|PairedDevice\|\.deviceId" packages/app/src/domains/settings/` → 0 결과
- [ ] `grep "targetDeviceId" packages/app/src/app/providers/AppProviders.tsx` → 0 결과
- [ ] `grep -c "signerId" packages/app/tests/PairingService.test.js` ≥ 1
- [ ] app `tsc --noEmit` 통과

## 3. 롤백 방법
- `git revert <commit-hash>` (Step 03도 함께 revert — 같은 PR이므로)
- 영향 범위: app 패키지 전체

---

## Scope

### 수정 대상 파일
```
packages/app/
├── src/
│   ├── core/
│   │   ├── approval/
│   │   │   ├── types.ts                  # SignedApproval.deviceId → signerId
│   │   │   └── SignedApprovalBuilder.ts   # deviceId → signerId, targetDeviceId → targetSignerId
│   │   └── crypto/
│   │       └── PairingService.ts          # payload.deviceId → signerId (내부 getDeviceId 유지)
│   ├── domains/settings/screens/
│   │   └── SettingsScreen.tsx             # device_list → signer_list, PairedDevice → PairedSigner
│   └── app/providers/
│       └── AppProviders.tsx               # targetDeviceId → targetSignerId
└── tests/
    └── PairingService.test.js             # mock data rename
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| types.ts | 직접 수정 | 공유 계약 타입 정의 |
| SignedApprovalBuilder.ts | 직접 수정 | approval 빌더 |
| PairingService.ts | 직접 수정 | relay 메시지 필드명만 (내부 로직 유지) |
| SettingsScreen.tsx | 직접 수정 | admin protocol consumer + UI |
| AppProviders.tsx | 직접 수정 | revoke flow에서 targetDeviceId |
| PairingService.test.js | 직접 수정 | mock data |
| IdentityKeyManager.ts | 변경 없음 | scope 외 — 물리 디바이스 ID 도메인 |

### Side Effect 위험
- PairingService: `getDeviceId()` 반환값을 `signerId` 필드에 할당하게 됨. 값 자체는 동일한 물리 디바이스 ID이지만 메시지 키가 변경. daemon이 Step 03에서 `signerId`를 기대하므로 정합.
- SettingsScreen: `device_list` → `signer_list` 변경으로, daemon이 Step 03에서 변경한 커맨드명과 정합.

### 참고할 기존 패턴
- `packages/app/src/core/approval/SignedApprovalBuilder.ts`: builder 패턴 — 필드명만 변경

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| types.ts | SignedApproval 계약 타입 | ✅ OK |
| SignedApprovalBuilder.ts | builder 필드 rename | ✅ OK |
| PairingService.ts | pairing_confirm payload 필드 | ✅ OK |
| SettingsScreen.tsx | device_list protocol + UI | ✅ OK |
| AppProviders.tsx | targetDeviceId | ✅ OK |
| PairingService.test.js | mock data | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| SignedApproval.deviceId | types.ts ✅ | OK |
| builder rename | SignedApprovalBuilder.ts ✅ | OK |
| pairing_confirm payload | PairingService.ts ✅ | OK |
| signer_list protocol | SettingsScreen.tsx ✅ | OK |
| targetSignerId | AppProviders.tsx ✅ | OK |
| mock data | PairingService.test.js ✅ | OK |

### 검증 통과: ✅
