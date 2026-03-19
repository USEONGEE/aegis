# Step 05: 테스트 assertion 수정

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 02, Step 03

---

## 1. 구현 내용

### json-approval-store.test.ts
- Seed: `seed.is_active` → `seed.isActive` (boolean), `toBe(1)` → `toBe(true)`, `toBe(0)` → `toBe(false)`
- Policy: `loaded!.seed_id` → `loaded!.seedId`, `loaded!.policies_json` → `loaded!.policiesJson`, `loaded!.policy_version` → `loaded!.policyVersion`, `loaded!.signature_json` → `loaded!.signatureJson`
- Device: `dev!.device_id` → `dev!.deviceId`, `dev!.public_key` → `dev!.publicKey`, `dev!.revoked_at` → `dev!.revokedAt`

### sqlite-approval-store.test.ts
- 동일 패턴 적용

### factory.test.ts
- `SeedRecord` import → `StoredSeed` import

## 2. 완료 조건
- [ ] `pnpm --filter guarded-wdk test` — 161 tests, 6 suites 전부 pass
- [ ] 테스트에서 snake_case 접근 없음: `grep -rE '\.(device_id|public_key|paired_at|revoked_at|seed_id|created_at|is_active|policy_version|updated_at|policies_json|signature_json)' packages/guarded-wdk/tests/` 결과 0건

## 3. 롤백 방법
- 테스트 파일 변경 revert

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/tests/
├── json-approval-store.test.ts   # 수정 - assertion camelCase 전환
├── sqlite-approval-store.test.ts # 수정 - assertion camelCase 전환
└── factory.test.ts               # 수정 - SeedRecord → StoredSeed import
```

### Side Effect 위험
없음 - 테스트 코드만 수정

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| json-approval-store.test.ts | assertion camelCase 전환 | ✅ OK |
| sqlite-approval-store.test.ts | assertion camelCase 전환 | ✅ OK |
| factory.test.ts | StoredSeed import | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Seed assertion 전환 | ✅ | OK |
| Policy assertion 전환 | ✅ | OK |
| Device assertion 전환 | ✅ | OK |
| SeedRecord import → StoredSeed | ✅ factory.test.ts | OK |

### 검증 통과: ✅

---
