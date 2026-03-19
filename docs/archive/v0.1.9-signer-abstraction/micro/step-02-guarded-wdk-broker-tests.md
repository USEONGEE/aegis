# Step 02: guarded-wdk broker + 테스트

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01 완료

---

## 1. 구현 내용 (design.md 기반)
- `signed-approval-broker.ts`: `signedApproval.deviceId` → `signerId`, `metadata.deviceId` → `metadata.signerId`, `revokeDevice` → `revokeSigner`, `DeviceRevoked` → `SignerRevoked` 이벤트, error message 업데이트
- 테스트 파일 6개: mock data, assertion, mock store 메서드명 전부 업데이트
  - `approval-broker.test.ts`
  - `json-approval-store.test.ts`
  - `sqlite-approval-store.test.ts`
  - `integration.test.ts`
  - `evaluate-policy.test.ts`
  - `factory.test.ts`

## 2. 완료 조건
- [ ] `grep -r "DeviceRevoked\|deviceId\|saveDevice\|revokeDevice\|listDevices\|isDeviceRevoked\|StoredDevice\|DeviceRevokedError\|pairedAt\|DeviceRow" packages/guarded-wdk/src/signed-approval-broker.ts` → 0 결과
- [ ] `grep -r "DeviceRevoked\|DeviceRevokedError\|StoredDevice\|saveDevice\|getDevice\|revokeDevice\|listDevices\|isDeviceRevoked\|DeviceRow\|pairedAt\|devices\.json" packages/guarded-wdk/tests/` → 0 결과
- [ ] guarded-wdk `tsc --noEmit` 통과
- [ ] guarded-wdk `npm test` 전체 통과

## 3. 롤백 방법
- `git revert <commit-hash>` (Step 01도 함께 revert 필요)
- 영향 범위: guarded-wdk 패키지 내부

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/
├── src/
│   └── signed-approval-broker.ts  # deviceId → signerId, 이벤트 rename
└── tests/
    ├── approval-broker.test.ts        # broker 동작 + device_revoke 테스트
    ├── json-approval-store.test.ts    # mock data + assertion rename
    ├── sqlite-approval-store.test.ts  # mock data + assertion rename
    ├── integration.test.ts            # mock data + assertion rename
    ├── evaluate-policy.test.ts        # mock data rename
    └── factory.test.ts               # mock store 메서드명 rename
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| signed-approval-broker.ts | 직접 수정 | broker 소스 |
| tests/* | 직접 수정 | 테스트 코드의 mock/assertion |

### Side Effect 위험
- 없음. 이 Step 완료 후 guarded-wdk는 완전한 상태 (tsc + jest 통과)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| signed-approval-broker.ts | deviceId/event rename | ✅ OK |
| approval-broker.test.ts | broker 동작 + device_revoke 테스트 | ✅ OK |
| json-approval-store.test.ts | mock data에 deviceId/StoredDevice 참조 | ✅ OK |
| sqlite-approval-store.test.ts | mock data에 deviceId/StoredDevice 참조 | ✅ OK |
| integration.test.ts | 통합 테스트 mock data | ✅ OK |
| evaluate-policy.test.ts | policy 테스트 mock data | ✅ OK |
| factory.test.ts | mock store 메서드명 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| broker deviceId → signerId | broker.ts ✅ | OK |
| DeviceRevoked → SignerRevoked | broker.ts ✅ | OK |
| 테스트 mock/assertion | 6개 테스트 파일 ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 03: daemon + 테스트](step-03-daemon.md)
