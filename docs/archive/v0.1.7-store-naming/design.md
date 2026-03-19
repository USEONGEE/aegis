# 설계 - v0.1.7

## 변경 규모
**규모**: 일반 기능
**근거**: 2개+ 컴포넌트(guarded-wdk, daemon) 수정, 내부 API 변경 (public 타입 rename + camelCase 전환)

## 문제 요약
Layer 0 Store 읽기 타입 네이밍이 불일치: `StoredCron` vs `JournalEntry` vs `DeviceRecord` vs `SeedRecord` + `StoredPolicy` snake_case 누수.
`Stored*` 패턴으로 통일 + 모든 public 타입 camelCase 전환.

> 상세: [README.md](README.md) 참조

## 접근법
- v0.1.6 Step E (CronRecord → CronRow + StoredCron) 패턴을 **3개 타입에 반복 적용**
- `StoredPolicy`는 이미 `Stored*` 네이밍이므로 **camelCase 전환만**
- 각 타입마다: (1) Row 내부 타입 추가 (2) public 타입 camelCase 재정의 (3) store 구현체에 매핑 추가 (4) daemon snake_case 접근 수정

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: 현상 유지 | 변경 없음 | 네이밍 불일치 지속, snake_case 누수 | ❌ |
| B: Row + Stored 매핑 패턴 반복 | v0.1.6 검증된 패턴, 최소 리스크 | 매핑 코드 추가 (boilerplate) | ✅ |
| C: 전체 타입을 types.ts 하나로 통합 | 파일 정리 | 이번 scope 초과, 구조 변경 큼 | ❌ |

**선택 이유**: B는 v0.1.6에서 CronRow+StoredCron으로 이미 검증된 패턴. 동일 패턴 반복이므로 리스크 최소.

## 기술 결정

### TD-1: JSON on-disk format은 snake_case 유지
JSON store의 `devices.json`, `seeds.json`, `policies.json` 파일 내 데이터는 **snake_case 그대로 유지**.
- JSON store 내부에서 Row 타입(snake_case)으로 읽고 → StoredXxx(camelCase)로 매핑하여 반환
- 이유: SQLite 컬럼과 동일한 snake_case를 내부 저장 포맷으로 통일. on-disk format은 internal 구현 세부사항.
- on-disk format이 변경되지 않으므로 기존 JSON 파일과 완전 호환. 마이그레이션 불필요.

### TD-2: DeviceRecord → DeviceRow + StoredDevice
```ts
// store-types.ts (@internal)
interface DeviceRow {
  device_id: string
  public_key: string
  name: string | null
  paired_at: number
  revoked_at: number | null
}

// approval-store.ts (public)
interface StoredDevice {
  deviceId: string
  publicKey: string
  name: string | null
  pairedAt: number
  revokedAt: number | null
}
```

### TD-3: SeedRecord → SeedRow + StoredSeed
```ts
// store-types.ts (@internal)
interface SeedRow {
  id: string
  name: string
  mnemonic: string
  created_at: number
  is_active: number
}

// approval-store.ts (public)
interface StoredSeed {
  id: string
  name: string
  mnemonic: string
  createdAt: number
  isActive: boolean  // number → boolean (public에서 의미적 타입)
}
```

### TD-4: JournalEntry → StoredJournal (rename only)
```ts
// approval-store.ts (public) - 이미 camelCase
interface StoredJournal {
  intentId: string
  seedId: string
  chainId: number
  targetHash: string
  status: string
  txHash: string | null
  createdAt: number
  updatedAt: number
}
```
JournalEntry는 이미 camelCase이므로 rename만 수행. StoredJournalEntry(store-types.ts)는 이미 존재하므로 Row 타입 추가 불필요.

### TD-5: StoredPolicy camelCase 전환
```ts
// store-types.ts (@internal) - 신규
interface PolicyRow {
  seed_id: string
  chain_id: number
  policies_json: string
  signature_json: string
  policy_version: number
  updated_at: number
}

// approval-store.ts (public) - camelCase 전환
interface StoredPolicy {
  seedId: string
  chainId: number
  policiesJson: string
  signatureJson: string
  policyVersion: number
  updatedAt: number
}
```

### TD-6: daemon 명시적 `any` 제거 + 타입 좁히기 (snake_case 잔존 검출)
daemon의 `admin-server.ts`, `wdk-host.ts`, `control-handler.ts`에서 store 메서드 반환값을 `any`로 받고 있어 tsc가 snake_case 접근을 검출 못 함.
- `admin-server.ts`의 `const devices: any[]`, `const seeds: any[]` → 명시적 `any` 제거
- `wdk-host.ts`의 `(d: any)` 콜백 파라미터 → 명시적 `any` 제거
- `control-handler.ts`의 로컬 인터페이스 반환 타입을 guarded-wdk public 타입으로 좁힘
- daemon 로컬 인터페이스(ApprovalStoreReader 등)의 반환 타입을 `StoredDevice[]`, `StoredSeed[]`, `StoredPolicy` 등으로 좁힘
- 명시적 `any` 제거 + 타입 좁히기로 tsc --noEmit이 snake_case 접근을 컴파일 에러로 검출 가능
- 추가로 DoD에 grep 기반 snake_case 잔존 검사 포함

### TD-7: JSON store 내부 wrapper 타입 변경
`SeedsFile` interface의 `seeds: SeedRecord[]`를 `seeds: SeedRow[]`로 변경.
Device용 `Record<string, DeviceRecord>` 내부 타입도 `Record<string, DeviceRow>`로 변경.
Policy용 `Record<string, StoredPolicy>` 내부 타입도 `Record<string, PolicyRow>`로 변경.
이는 모두 json-approval-store.ts 내부의 private 타입이므로 외부 영향 없음.

### TD-8: ApprovalStore 추상 클래스 시그니처 변경
- `getDevice() → StoredDevice | null`
- `listDevices() → StoredDevice[]`
- `listSeeds() → StoredSeed[]`
- `getSeed() → StoredSeed | null`
- `addSeed() → StoredSeed`
- `getActiveSeed() → StoredSeed | null`
- `getJournalEntry() → StoredJournal | null`
- `listJournal() → StoredJournal[]`
- `loadPolicy() → StoredPolicy | null` (camelCase 전환)

---

## 범위 / 비범위

### 범위 (In Scope)
- `JournalEntry` → `StoredJournal` rename
- `DeviceRecord` → `StoredDevice` rename + camelCase 전환
- `SeedRecord` → `StoredSeed` rename + camelCase 전환
- `StoredPolicy` camelCase 전환 + PolicyRow 내부 타입 추가
- store 구현체(json/sqlite)에서 row → camelCase 매핑 추가
- daemon snake_case 접근 → camelCase 전환
- index.ts export 업데이트
- 테스트 assertion 변경

### 비범위 (Out of Scope)
- `HistoryEntry`: Layer 2 타입, 이번 scope 아님
- `HistoryQueryOpts`/`JournalQueryOpts`: 조회 필터, 변경 없음
- DB 스키마 변경: snake_case 컬럼 유지
- JSON on-disk format 변경: snake_case 유지

## 아키텍처 개요

```
Public API (camelCase)           Internal (snake_case)
─────────────────────            ────────────────────
StoredDevice                     DeviceRow (store-types.ts)
StoredSeed                       SeedRow (store-types.ts)
StoredJournal                    StoredJournalEntry (store-types.ts, 기존)
StoredPolicy (camelCase)         PolicyRow (store-types.ts)
                  ↑ mapping ↑
          json-approval-store.ts
          sqlite-approval-store.ts
```

## 테스트 전략

### 기존 테스트 수정
- Device 관련 assertion: `device.device_id` → `device.deviceId` 등
- Seed 관련 assertion: `seed.created_at` → `seed.createdAt` 등
- Journal 관련: `JournalEntry` 타입 참조 → `StoredJournal`
- Policy 관련 assertion: `policy.seed_id` → `policy.seedId` 등
- daemon snake_case 접근 전환

### 검증 방법
1. `pnpm --filter guarded-wdk test` — 161 tests, 6 suites 전부 pass
2. `pnpm --filter daemon exec tsc -- --noEmit` — 타입 에러 0
3. `git diff --stat` — 변경 범위 확인

### 추가 테스트 불필요
기존 테스트가 모든 store 메서드의 round-trip을 검증.
타입 rename + camelCase 전환이므로 동작 변경 없음.

---

## 리스크/오픈 이슈

| 리스크 | 영향 | 완화 |
|--------|------|------|
| daemon snake_case 접근 누락 | 런타임 undefined | TD-6: daemon `any` 좁히기 + tsc 검출 + grep 잔존 검사 |
| SQLite SELECT * cast 오류 | 런타임 필드 불일치 | Row 타입으로 cast 후 명시적 매핑 |
| JSON on-disk format | 호환성 | TD-1: snake_case 유지 → 기존 데이터와 완전 호환 (필드명 변경 없음) |
