# Step 01: guarded-wdk types + public API + store 구현

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `store-types.ts`: `DeviceRow` → `SignerRow`, `device_id` → `signer_id`, `paired_at` → `registered_at`, `StoredHistoryEntry.device_id` → `signer_id`
- `errors.ts`: `DeviceRevokedError` → `SignerRevokedError`, constructor param `deviceId` → `signerId`
- `approval-store.ts`: `StoredDevice` → `StoredSigner`, `SignedApproval.deviceId` → `signerId`, `HistoryEntry.deviceId` → `signerId`, 5개 메서드 rename, `getLastNonce`/`updateNonce` param rename, `pairedAt` → `registeredAt`
- `json-approval-store.ts`: `devices.json` → `signers.json`, `DeviceRow` → `SignerRow` import, 모든 메서드 override rename, 필드 매핑 업데이트
- `sqlite-approval-store.ts`: `devices` 테이블 → `signers`, `device_id` → `signer_id`, `paired_at` → `registered_at`, nonces 컬럼 rename, 모든 SQL 쿼리 업데이트
- `approval-verifier.ts`: `DeviceRevokedError` → `SignerRevokedError`, `isDeviceRevoked` → `isSignerRevoked`, destructure rename
- `index.ts`: export rename

## 2. 완료 조건
- [ ] `grep -r "DeviceRow\|StoredDevice\|DeviceRevokedError" packages/guarded-wdk/src/` → 0 결과
- [ ] `grep -r "saveDevice\|getDevice\|listDevices\|revokeDevice\|isDeviceRevoked" packages/guarded-wdk/src/` → 0 결과
- [ ] `grep -n "deviceId" packages/guarded-wdk/src/approval-store.ts` → 0 결과
- [ ] `grep -r "device_id\|paired_at\|devices\.json" packages/guarded-wdk/src/` → 0 결과
- [ ] `grep -r "DeviceRevoked" packages/guarded-wdk/src/approval-verifier.ts` → 0 결과
- [ ] `grep -c "SignerRevokedError\|StoredSigner" packages/guarded-wdk/src/index.ts` ≥ 2
- [ ] `grep -r "pairedAt" packages/guarded-wdk/src/` → 0 결과

## 3. 롤백 방법
- `git revert <commit-hash>`
- 영향 범위: guarded-wdk 패키지만 (상위 레이어는 아직 old name 사용)

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── store-types.ts          # DeviceRow → SignerRow, 필드 rename
├── errors.ts               # DeviceRevokedError → SignerRevokedError
├── approval-store.ts       # StoredDevice → StoredSigner, 메서드/필드 rename
├── json-approval-store.ts  # 구현 rename + devices.json → signers.json
├── sqlite-approval-store.ts # 구현 rename + DB 스키마 변경
├── approval-verifier.ts    # error/method 참조 rename
└── index.ts                # export rename
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| store-types.ts | 직접 수정 | 내부 row type 정의 |
| errors.ts | 직접 수정 | 에러 클래스 정의 |
| approval-store.ts | 직접 수정 | 공개 API + abstract class |
| json-approval-store.ts | 직접 수정 | JSON store 구현 |
| sqlite-approval-store.ts | 직접 수정 | SQLite store 구현 |
| approval-verifier.ts | 직접 수정 | verifier에서 error/method 참조 |
| index.ts | 직접 수정 | 패키지 export |
| signed-approval-broker.ts | 간접 영향 | Step 02에서 수정 |

### Side Effect 위험
- 이 커밋 후 broker와 테스트는 컴파일 실패 (old name 참조) — Step 02에서 해결

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| store-types.ts | DeviceRow → SignerRow | ✅ OK |
| errors.ts | DeviceRevokedError → SignerRevokedError | ✅ OK |
| approval-store.ts | StoredDevice, 메서드, SignedApproval 타입 | ✅ OK |
| json-approval-store.ts | 구현 + devices.json | ✅ OK |
| sqlite-approval-store.ts | 구현 + DB 스키마 | ✅ OK |
| approval-verifier.ts | error/method 참조 | ✅ OK |
| index.ts | export rename | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| DeviceRow → SignerRow | store-types.ts ✅ | OK |
| DeviceRevokedError → SignerRevokedError | errors.ts ✅ | OK |
| StoredDevice → StoredSigner | approval-store.ts ✅ | OK |
| JSON 파일 rename | json-approval-store.ts ✅ | OK |
| DB 스키마 변경 | sqlite-approval-store.ts ✅ | OK |
| verifier 참조 | approval-verifier.ts ✅ | OK |
| export rename | index.ts ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: guarded-wdk broker + 테스트](step-02-guarded-wdk-broker-tests.md)
