# DoD (Definition of Done) - v0.1.7

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `JournalEntry` export가 `StoredJournal`로 rename됨 | `grep 'StoredJournal' packages/guarded-wdk/src/approval-store.ts` |
| F2 | `DeviceRecord` export가 `StoredDevice`로 rename되고 모든 필드가 camelCase | `grep -A5 'interface StoredDevice' packages/guarded-wdk/src/approval-store.ts` |
| F3 | `SeedRecord` export가 `StoredSeed`로 rename되고 모든 필드가 camelCase | `grep -A5 'interface StoredSeed' packages/guarded-wdk/src/approval-store.ts` |
| F4 | `StoredPolicy`의 모든 필드가 camelCase로 전환됨 | `grep -A6 'interface StoredPolicy' packages/guarded-wdk/src/approval-store.ts` |
| F5 | `store-types.ts`에 `DeviceRow`, `SeedRow`, `PolicyRow` internal 타입 추가됨 | `grep 'interface DeviceRow\|interface SeedRow\|interface PolicyRow' packages/guarded-wdk/src/store-types.ts` |
| F6 | `json-approval-store.ts`에서 Device/Seed/Policy/Journal 반환 시 Row → camelCase 매핑 수행 | 코드 리뷰: 각 메서드의 매핑 로직 확인 |
| F7 | `sqlite-approval-store.ts`에서 동일한 Row → camelCase 매핑 수행 | 코드 리뷰: 각 메서드의 매핑 로직 확인 |
| F8 | `index.ts`에서 `StoredJournal`, `StoredDevice`, `StoredSeed` export 및 구 이름(`JournalEntry`, `DeviceRecord`, `SeedRecord`) 미export | `grep -E 'StoredJournal\|StoredDevice\|StoredSeed\|JournalEntry\|DeviceRecord\|SeedRecord' packages/guarded-wdk/src/index.ts` |
| F9 | daemon의 snake_case 프로퍼티 접근이 모두 camelCase로 전환됨 | `grep -rE '\.(device_id\|public_key\|paired_at\|revoked_at\|seed_id\|created_at\|is_active\|policy_version\|updated_at\|policies_json\|signature_json)[^_]' packages/daemon/src/` 결과 0건 |
| F10 | daemon의 store 관련 `any` 제거: `admin-server.ts`의 변수(`devices: any[]`, `seeds: any[]`) 및 콜백(`(d: any)`, `(s: any)`), `wdk-host.ts`의 콜백(`(d: any)`), `control-handler.ts`의 변수/콜백 | `grep -nE 'devices: any\|seeds: any' packages/daemon/src/admin-server.ts` 0건 + `grep -nE '\(d: any\)' packages/daemon/src/wdk-host.ts packages/daemon/src/control-handler.ts` 0건 |
| F11 | `json-approval-store.ts`의 `SeedsFile.seeds`가 `SeedRow[]`, Device 내부가 `Record<string, DeviceRow>`, Policy 내부가 `Record<string, PolicyRow>` | `grep -E 'seeds: SeedRow\|Record<string, DeviceRow>\|Record<string, PolicyRow>' packages/guarded-wdk/src/json-approval-store.ts` 3건 매치 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk 테스트 전부 pass | `pnpm --filter guarded-wdk test` — 161 tests, 6 suites |
| N2 | `approval-store.ts` public 타입(StoredPolicy, StoredDevice, StoredSeed, StoredJournal)에 snake_case 필드가 없음 | `grep -A8 'interface Stored' packages/guarded-wdk/src/approval-store.ts` → underscore 필드 0건 |
| N3 | `store-types.ts` 신규 타입에 `@internal` JSDoc 주석 유지 | 코드 리뷰 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | SQLite SELECT * 결과를 Row 타입으로 cast 후 StoredXxx로 매핑 | 모든 필드가 정확히 매핑됨 | 기존 round-trip 테스트 통과 (saveDevice→getDevice, addSeed→getSeed 등) |
| E2 | JSON store에서 snake_case 데이터 write 후 read | Row 타입으로 쓰고, 매핑 후 camelCase StoredXxx로 반환 | 기존 round-trip 테스트 통과 |
| E3 | `StoredSeed.isActive`가 `boolean`으로 변환 | `is_active: 1` → `isActive: true`, `is_active: 0` → `isActive: false` | 기존 seed 테스트의 active/inactive 케이스 통과 |
| E4 | `StoredPolicy` camelCase 전환 후 daemon에서 policy 로드 | `policy.policiesJson`, `policy.policyVersion` 등으로 접근 | F9 grep 검증 (snake_case 잔존 0건) |
