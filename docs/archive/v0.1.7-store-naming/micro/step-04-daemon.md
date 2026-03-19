# Step 04: daemon snake_case → camelCase 전환 + any 제거 + daemon 테스트 수정

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 02, Step 03

---

## 1. 구현 내용 (design.md TD-6 기반)

### admin-server.ts
- `const devices: any[]` → `any` 제거 (타입 추론 사용)
- `(d: any)` 콜백 → `any` 제거
- `d.device_id` → `d.deviceId`, `d.paired_at` → `d.pairedAt`, `d.revoked_at` → `d.revokedAt`
- `const seeds: any[]` → `any` 제거
- `(s: any)` 콜백 → `any` 제거
- `s.created_at` → `s.createdAt`

### wdk-host.ts
- `(d: any)` → `any` 제거
- `d.revoked_at` → `d.revokedAt`
- `d.public_key` → `d.publicKey`
- `stored.policies_json` → `stored.policiesJson`

### control-handler.ts
- `const devices: any[]` → `any` 제거
- `(d: any)` 콜백 → `any` 제거
- `d.revoked_at` → `d.revokedAt`
- `d.public_key` → `d.publicKey`
- 로컬 인터페이스(ApprovalStoreReader 등)의 `listDevices`/`listSeeds`/`loadPolicy` 반환 타입을 guarded-wdk public 타입으로 좁히기 (가능한 경우)

### tool-surface.ts
- `policy.policies_json` → `policy.policiesJson`

### daemon 테스트 수정
- `tool-surface.test.ts`: mock의 `policies_json` → `policiesJson` 등 snake_case mock shape 전환
- `control-handler.test.ts`: mock의 `public_key`, `revoked_at` → `publicKey`, `revokedAt` 등

## 2. 완료 조건
- [ ] `grep -rE '\.(device_id|public_key|paired_at|revoked_at|seed_id|created_at|is_active|policy_version|updated_at|policies_json|signature_json)[^_]' packages/daemon/src/` 결과 0건
- [ ] `grep -nE '(d: any)|(s: any)|devices: any|seeds: any' packages/daemon/src/admin-server.ts packages/daemon/src/wdk-host.ts packages/daemon/src/control-handler.ts` 결과 0건
- [ ] daemon 테스트의 snake_case mock shape 전환 완료

## 3. 롤백 방법
- daemon 소스 + 테스트 파일 변경 revert

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── admin-server.ts      # 수정 - snake_case→camelCase + any 제거
├── wdk-host.ts          # 수정 - snake_case→camelCase + any 제거
├── control-handler.ts   # 수정 - snake_case→camelCase + any 제거 + 타입 좁히기
└── tool-surface.ts      # 수정 - policies_json→policiesJson

packages/daemon/tests/
├── tool-surface.test.ts     # 수정 - mock shape snake_case→camelCase
└── control-handler.test.ts  # 수정 - mock shape snake_case→camelCase
```

### Side Effect 위험
- daemon이 타입 import 없이 `any`로 접근하므로 import 추가 불필요 (타입 추론으로 해결)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| admin-server.ts | snake_case→camelCase + any 제거 | ✅ OK |
| wdk-host.ts | snake_case→camelCase + any 제거 | ✅ OK |
| control-handler.ts | snake_case→camelCase + any 제거 + 타입 좁히기 | ✅ OK |
| tool-surface.ts | policies_json→policiesJson | ✅ OK |
| tool-surface.test.ts | mock shape 전환 | ✅ OK |
| control-handler.test.ts | mock shape 전환 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| admin-server any 제거 | ✅ | OK |
| wdk-host any 제거 | ✅ | OK |
| control-handler 타입 좁히기 | ✅ | OK |
| tool-surface policy 접근 | ✅ | OK |
| daemon 테스트 mock 수정 | ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 05: guarded-wdk 테스트 수정](step-05-tests.md)
