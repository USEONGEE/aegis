# Step 03: store 구현체 매핑 (json + sqlite)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 01, Step 02

---

## 1. 구현 내용 (design.md TD-1~TD-5, TD-7 기반)

### json-approval-store.ts
- import 업데이트: `DeviceRow`, `SeedRow`, `PolicyRow` 추가, 구 타입명 변경
- `SeedsFile.seeds: SeedRow[]` (TD-7)
- Device 내부: `Record<string, DeviceRow>` (TD-7)
- Policy 내부: `Record<string, PolicyRow>` (TD-7)
- Device 메서드(`saveDevice`, `getDevice`, `listDevices`, `revokeDevice`, `isDeviceRevoked`): Row 내부 사용 + StoredDevice 매핑 반환
- Seed 메서드(`listSeeds`, `getSeed`, `addSeed`, `removeSeed`, `setActiveSeed`, `getActiveSeed`): Row 내부 사용 + StoredSeed 매핑 반환
- Policy 메서드(`loadPolicy`, `savePolicy`, `getPolicyVersion`, `listPolicyChains`): PolicyRow 내부 사용 + StoredPolicy 매핑 반환
- Journal 메서드(`getJournalEntry`, `listJournal`): 반환 타입 `StoredJournal`로 변경

### sqlite-approval-store.ts
- import 업데이트: 동일
- Device 메서드: `SELECT *` → `as DeviceRow` cast + StoredDevice 매핑 반환
- Seed 메서드: `SELECT *` → `as SeedRow` cast + StoredSeed 매핑 반환
- Policy 메서드: `SELECT *` → `as PolicyRow` cast + StoredPolicy 매핑 반환
- Journal 메서드: 반환 타입 `StoredJournal`로 변경
- `addSeed` 반환: `SeedRow` 구성 → `StoredSeed` 매핑

## 2. 완료 조건
- [ ] `json-approval-store.ts`에서 `SeedsFile.seeds: SeedRow[]`
- [ ] `json-approval-store.ts`에서 Device를 `Record<string, DeviceRow>`로 읽기
- [ ] `json-approval-store.ts`에서 Policy를 `Record<string, PolicyRow>`로 읽기
- [ ] 모든 반환 메서드에서 Row → camelCase 매핑 수행
- [ ] `sqlite-approval-store.ts`에서 동일한 패턴 적용
- [ ] `pnpm --filter guarded-wdk test` 통과

## 3. 롤백 방법
- `json-approval-store.ts`, `sqlite-approval-store.ts` 변경 revert

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── json-approval-store.ts    # 수정 - 매핑 로직 추가/변경
└── sqlite-approval-store.ts  # 수정 - 매핑 로직 추가/변경
```

### 참고할 기존 패턴
- `CronRow → StoredCron` 매핑 (이미 구현됨): `json-approval-store.ts:291-304`, `sqlite-approval-store.ts:332-346`

### Side Effect 위험
- JSON store의 on-disk format이 변경되지 않음 (TD-1)
- SQLite 스키마 변경 없음

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| json-approval-store.ts | 매핑 로직 + wrapper 타입 변경 | ✅ OK |
| sqlite-approval-store.ts | 매핑 로직 변경 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Device Row→StoredDevice 매핑 (json) | ✅ | OK |
| Device Row→StoredDevice 매핑 (sqlite) | ✅ | OK |
| Seed Row→StoredSeed 매핑 (json) | ✅ | OK |
| Seed Row→StoredSeed 매핑 (sqlite) | ✅ | OK |
| Policy Row→StoredPolicy 매핑 (json) | ✅ | OK |
| Policy Row→StoredPolicy 매핑 (sqlite) | ✅ | OK |
| Journal→StoredJournal rename (json) | ✅ | OK |
| Journal→StoredJournal rename (sqlite) | ✅ | OK |
| SeedsFile wrapper 변경 (TD-7) | ✅ json-approval-store.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 04: daemon camelCase 전환](step-04-daemon.md)
