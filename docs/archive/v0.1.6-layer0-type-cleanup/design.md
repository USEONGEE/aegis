# 설계 - v0.1.6

## 변경 규모
**규모**: 일반 기능
**근거**: 2개+ 컴포넌트(guarded-wdk, daemon) 수정, 내부 API 변경 (`ApprovalStore` 메서드 시그니처)

## 문제 요약
guarded-wdk Layer 0 타입 5개를 No Optional 원칙에 따라 리팩토링한다.
핵심 전략은 "입력(Input) / 저장(Stored) 분리"와 "@internal 누수 차단"이다.

> 상세: [README.md](README.md) 참조

## 접근법
- **입력/저장 분리**: caller가 제공하는 필드만 담은 Input 타입 + store가 관리하는 필드를 포함한 Stored 타입
- **@internal 누수 차단**: public API 반환 타입을 camelCase public 타입으로, store 구현체 내부에서 매핑
- **Breaking Change**: optional 제거, 타입 분리 — 소비자(daemon) 함께 수정

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: optional 유지 + 런타임 검증 | 변경 없음 | No Optional 원칙 위반 지속 | ❌ |
| B: 입력/저장 타입 분리 + 매핑 | 원칙 준수, 경계 명확 | store 구현체에 매핑 코드 추가 | ✅ |
| C: 모든 타입을 하나의 types.ts로 이동 | 파일 정리 | 변경 범위가 너무 넓음, 이번 scope 초과 | ❌ |

**선택 이유**: B가 최소 변경으로 원칙 준수 달성. 매핑 코드는 이미 `PendingApprovalRow → PendingApprovalRequest`에서 패턴 확립됨.

## 기술 결정
- 기존 `PendingApprovalRow → PendingApprovalRequest` 매핑 패턴을 CronRecord에도 적용
- `SignedPolicy`는 parsed form 입력(`PolicyInput`) + serialized 저장(`StoredPolicy`) 분리 (직렬화는 store 책임)
- `JournalEntry`는 `JournalInput`(생성) + `JournalEntry`(저장 결과)로 분리
- `CronInput`에서 store 책임 필드(`id`, `createdAt`) 제거, caller 필드 required화

---

## 1. SignedPolicy (approval-store.ts:31)

### Before

```ts
export interface SignedPolicy {
  policies_json?: string
  signature_json?: string
  policies?: unknown[]
  signature?: Record<string, unknown>
  [key: string]: unknown
}

export interface StoredPolicy extends SignedPolicy {
  seed_id: string
  chain_id: number
  policy_version: number
  updated_at: number
}
```

**문제:**
- parsed(`policies`, `signature`)와 serialized(`policies_json`, `signature_json`)가 한 타입에 혼합
- index signature `[key: string]: unknown`으로 아무 필드나 통과
- `StoredPolicy`가 extends하므로 모든 문제를 상속

### After

```ts
/** savePolicy() 입력: caller가 parsed 형태로 제공, store가 직렬화 */
export interface PolicyInput {
  policies: unknown[]
  signature: Record<string, unknown>
}

/** loadPolicy() 반환: store가 관리하는 필드 추가 */
export interface StoredPolicy {
  seed_id: string
  chain_id: number
  policies_json: string
  signature_json: string
  policy_version: number
  updated_at: number
}
```

**변경 근거:**
- caller(daemon, factory)는 parsed 정책 객체를 다루므로 입력은 parsed form이 자연스러움
- 직렬화(`JSON.stringify`)는 store 경계에서 처리 — caller에게 저장 포맷 지식을 요구하지 않음
- `StoredPolicy`는 extends 제거, 독립 타입으로 DB row와 1:1 대응
- index signature `[key: string]: unknown` 제거
- `SignedPolicy` → `PolicyInput`으로 rename하여 역할을 명확히 함

### 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `approval-store.ts` | `SignedPolicy` → `PolicyInput` rename, `StoredPolicy` extends 제거 후 독립 타입 |
| `approval-store.ts` | `savePolicy` 시그니처: `SignedPolicy` → `PolicyInput` |
| `json-approval-store.ts:101-113` | `savePolicy`: `PolicyInput`에서 `JSON.stringify(input.policies)` / `JSON.stringify(input.signature)` 수행 |
| `json-approval-store.ts:95-98` | `loadPolicy`: 반환은 `StoredPolicy` 그대로 (이미 serialized 형태로 저장) |
| `sqlite-approval-store.ts:147-168` | `savePolicy`: `JSON.stringify(input.policies)` / `JSON.stringify(input.signature)` 수행 |
| `sqlite-approval-store.ts:140-145` | `loadPolicy`: SELECT 결과를 `StoredPolicy`로 cast (변경 없음) |
| `guarded-wdk-factory.ts:95` | `stored.policies` → `JSON.parse(stored.policies_json)` 변경 |
| `guarded-wdk-factory.ts:156` | `newPolicies as PolicyInput` 캐스트 |
| `daemon/wdk-host.ts:80-94` | 복원 로직: `JSON.parse(stored.policies_json)` 사용, `stored.policies` fallback 제거 |
| `daemon/wdk-host.ts:163` | `store.savePolicy(seedId, chainId, { policies, signature })` — caller는 parsed 형태 그대로 전달 |
| `daemon/tool-surface.ts:479-480` | `policy?.policies` → `JSON.parse(policy.policies_json)` 변경 |
| `index.ts` | `SignedPolicy` export → `PolicyInput` export, `StoredPolicy` export 유지 |
| `tests/factory.test.ts:224,231,302` | `stored.policies` 접근 → `JSON.parse(stored.policies_json)` 변경 |
| `daemon/tests/tool-surface.test.ts:52,203` | mock에서 parsed `policies` → `policies_json` string으로 변경 |

### 위험: 중간
- sqlite 스키마 변경 없음 (이미 `policies_json`, `signature_json` 컬럼)
- factory.ts, factory.test.ts, tool-surface.test.ts에서 `stored.policies` parsed form 직접 접근 → `JSON.parse(stored.policies_json)` 변경 필요
- Breaking Change 허용이므로 JSON store 기존 데이터 마이그레이션 불필요

---

## 2. CronInput (approval-store.ts:77)

### Before

```ts
export interface CronInput {
  id?: string
  sessionId?: string
  interval: string
  prompt: string
  chainId?: number | null
  createdAt?: number
}
```

**문제:**
- `id`, `createdAt`는 store가 생성하는데 caller 입력에 포함
- `sessionId`는 daemon에서 항상 필수로 전달하는데 optional
- `chainId`는 `number | null`에 optional까지 3중 상태

### After

```ts
/** saveCron() 입력: caller가 제공하는 필드만 */
export interface CronInput {
  sessionId: string        // was optional
  interval: string
  prompt: string
  chainId: number | null   // was optional + null
}
```

**변경 근거:**
- `id`: store가 `randomUUID()`로 생성 -> 입력에서 제거
- `createdAt`: store가 `Date.now()`로 생성 -> 입력에서 제거
- `sessionId`: daemon `tool-surface.ts:536`에서 항상 제공, `cron-scheduler.ts:135` CronRegistration에서도 필수 -> required
- `chainId`: `null`은 "특정 체인 없음"을 의미하므로 `number | null`로 유지하되 optional 제거

### 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `approval-store.ts` | `CronInput` 정의 변경 |
| `approval-store.ts:161` | `saveCron` 시그니처 변경 없음 (이미 `_seedId: string, _cron: CronInput`) |
| `json-approval-store.ts:286-299` | `saveCron`: `cron.id || randomUUID()` -> `randomUUID()`, `cron.sessionId || ''` -> `cron.sessionId`, `cron.createdAt || Date.now()` -> `Date.now()`, `cron.chainId ?? null` -> `cron.chainId` |
| `sqlite-approval-store.ts:328-342` | 동일 변경 |
| `daemon/tool-surface.ts:534-540` | `saveCron` 호출: `id` 제거, `chainId`는 이미 number or null 제공 |
| `index.ts` | export 변경 없음 |
| 테스트 (`json-approval-store.test.ts`, `sqlite-approval-store.test.ts`) | `saveCron` 호출에서 `id` 제거, `sessionId` 필수화에 따라 누락 케이스 수정, `chainId` 누락 시 `null` 명시 |

### 위험: 낮음
- Breaking change이지만 caller가 2곳(tool-surface, 테스트)뿐이고 모두 수정 범위가 명확

---

## 3. JournalEntry (approval-store.ts:94)

### Before

```ts
export interface JournalEntry {
  intentId?: string
  seedId?: string
  chainId: number
  targetHash?: string
  status: string
  txHash?: string | null
  createdAt?: number
  updatedAt?: number
}
```

**문제:**
- `intentId`, `seedId`, `targetHash`는 daemon `execution-journal.ts:109`에서 항상 필수 제공
- `txHash`는 성공 시에만 존재하는데 입력/결과 구분 없이 한 타입에 혼합
- `createdAt`, `updatedAt`는 store가 생성하는데 입력에 포함
- daemon에 중복 `JournalEntry` 타입 존재 (`execution-journal.ts:7`)

### After

```ts
/** saveJournalEntry() 입력: caller가 제공하는 필드만 */
export interface JournalInput {
  intentId: string        // was optional
  seedId: string          // was optional
  chainId: number
  targetHash: string      // was optional
  status: string
}

/** getJournalEntry()/listJournal() 반환: store가 관리하는 필드 추가 */
export interface JournalEntry {
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

**변경 근거:**
- `JournalInput`: 생성 시 caller가 반드시 알고 있는 5개 필드만
- `JournalEntry`: 저장 후 store가 관리하는 `txHash`, `createdAt`, `updatedAt` 포함, 모두 required
- `txHash`는 `null`이 기본값 (store가 `null`로 초기화), `updateJournalStatus`로 나중에 설정
- daemon의 중복 `JournalEntry`는 `JournalInput`을 import해서 대체 (또는 자체 local interface 유지)

### 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `approval-store.ts` | `JournalInput` 신규, `JournalEntry` 재정의 |
| `approval-store.ts:177` | `saveJournalEntry(_entry: JournalInput)` 시그니처 변경 |
| `approval-store.ts:176,179` | `getJournalEntry`, `listJournal` 반환은 `JournalEntry`로 유지 |
| `json-approval-store.ts:394-407` | `saveJournalEntry`: `entry.intentId || ''` -> `entry.intentId`, fallback 전부 제거 |
| `sqlite-approval-store.ts:436-451` | 동일 변경 |
| `json-approval-store.ts:378-391, 420-444` | `getJournalEntry`/`listJournal` 반환: 이미 모든 필드 포함, 타입만 `JournalEntry`로 맞춤 |
| `sqlite-approval-store.ts:421-433, 460-478` | 동일 |
| `daemon/execution-journal.ts:7-14` | 로컬 `JournalEntry` 타입을 guarded-wdk의 `JournalInput` (또는 자체 유지)으로 대체 가능. 별도 판단 필요 |
| `daemon/execution-journal.ts:29-38` | 로컬 `ApprovalStore` interface의 `saveJournalEntry` 파라미터 타입 갱신 |
| `daemon/execution-journal.ts:109-115` | `_store.saveJournalEntry` 호출은 이미 모든 필수 필드 제공 -> 변경 없음 |
| `index.ts` | `JournalInput` export 추가 |
| 테스트 | `saveJournalEntry` 호출에서 optional이었던 `intentId`, `seedId`, `targetHash`가 필수화 -- 이미 모든 테스트에서 제공중이므로 변경 최소 |

### 위험: 낮음
- daemon `execution-journal.ts`에 로컬 `JournalEntry` 중복이 있으므로 daemon 쪽은 별도로 정리할지 이번 scope에서 결정 필요
- 추천: daemon 로컬 타입은 유지하되 `saveJournalEntry` 인라인 타입을 `JournalInput`과 호환되게 조정

---

## 4. PendingApprovalRow (store-types.ts:7) - public API 누수 차단

### Before

```ts
// store-types.ts (의도: @internal)
export interface PendingApprovalRow { ... }

// approval-store.ts
async loadPendingByRequestId(_requestId: string): Promise<PendingApprovalRow | null>
```

**문제:**
- `PendingApprovalRow`는 `@internal` snake_case row 타입인데, `loadPendingByRequestId()` 반환 타입으로 public API에 누출
- daemon `control-handler.ts:42`에서 이 row shape(`pending.target_hash`, `pending.chain_id` 등)에 직접 의존

### After

```ts
// approval-store.ts - 반환 타입 변경
async loadPendingByRequestId(_requestId: string): Promise<PendingApprovalRequest | null>

// PendingApprovalRow는 store-types.ts에 @internal로 유지 (내부 전용)
// PendingApprovalRequest는 이미 public 타입으로 존재 (camelCase)
```

**변경 근거:**
- public API는 camelCase public 타입(`PendingApprovalRequest`)을 반환해야 함
- store 구현체에서 snake_case -> camelCase 매핑 추가

### 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `approval-store.ts:136` | 반환 타입 `PendingApprovalRow` -> `PendingApprovalRequest` |
| `json-approval-store.ts:151-153` | `loadPendingByRequestId`: raw row를 찾은 뒤 `PendingApprovalRequest`로 매핑 후 반환 |
| `sqlite-approval-store.ts:204-208` | 동일: SELECT row를 `PendingApprovalRequest`로 매핑 |
| `daemon/control-handler.ts:42` | 로컬 `ApprovalStoreReader` interface의 `loadPendingByRequestId` 반환 타입을 camelCase로 변경 |
| `daemon/control-handler.ts:111-116, 145-151` | `pending.target_hash` -> `pending.targetHash`, `pending.seed_id` -> `pending.seedId`, `pending.chain_id` -> `pending.chainId` |

### 위험: 중간
- daemon `control-handler.ts`가 snake_case 필드에 직접 접근하므로 반드시 함께 수정 필요
- 누락 시 런타임에 `undefined` 접근으로 조용히 실패할 수 있음

---

## 5. CronRecord (store-types.ts:32) - CronRow rename + public StoredCron 도입

### Before

```ts
// store-types.ts (의도: @internal)
export interface CronRecord { ... }

// approval-store.ts
async listCrons(_seedId?: string): Promise<CronRecord[]>
```

**문제:**
- `CronRecord`는 `@internal` snake_case row인데 `listCrons()` 반환 타입으로 public API에 누출
- daemon `cron-scheduler.ts:100-112`에서 `cron.is_active`, `cron.session_id`, `cron.chain_id`, `cron.last_run_at` 등 snake_case 직접 접근
- daemon `tool-surface.ts:553`에서 `store.listCrons(seedId)` 결과를 그대로 API 응답으로 반환 (snake_case 노출)

### After

```ts
// store-types.ts (@internal)
export interface CronRow {     // rename from CronRecord
  id: string
  seed_id: string
  session_id: string
  interval: string
  prompt: string
  chain_id: number | null
  created_at: number
  last_run_at: number | null
  is_active: number
}

// approval-store.ts (public)
export interface StoredCron {
  id: string
  seedId: string
  sessionId: string
  interval: string
  prompt: string
  chainId: number | null
  createdAt: number
  lastRunAt: number | null
  isActive: boolean            // number -> boolean (public에서는 의미적 타입)
}

// approval-store.ts
async listCrons(_seedId?: string): Promise<StoredCron[]>
```

**변경 근거:**
- `CronRecord` -> `CronRow`: internal row 임을 명확히 하고, "Record"는 public 느낌이므로 "Row"로 변경
- `StoredCron`: public camelCase 타입, `listCrons` 반환용
- `isActive`: store 내부는 `INTEGER 0/1`이지만 public에서는 `boolean`이 자연스러움

### 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `store-types.ts` | `CronRecord` -> `CronRow` rename |
| `approval-store.ts` | `StoredCron` 신규, `listCrons` 반환 타입 변경, import `CronRow` |
| `json-approval-store.ts:278-284` | `listCrons`: `CronRow[]`로 내부 읽기 후 `StoredCron[]`으로 매핑 반환 |
| `sqlite-approval-store.ts:321-326` | 동일: SELECT 결과를 `StoredCron[]`으로 매핑 |
| `json-approval-store.ts:286-315` | `saveCron`, `removeCron`, `updateCronLastRun`: 내부에서 `CronRow[]`로 타입 변경 |
| `sqlite-approval-store.ts:328-349` | 동일 |
| `daemon/cron-scheduler.ts:39` | `CronStore.listCrons` 반환 타입을 `any[]` → `StoredCron[]`로 변경 (snake_case 접근을 컴파일 에러로 검출하기 위해 필수) |
| `daemon/cron-scheduler.ts:100-112` | `cron.is_active` -> `cron.isActive`, `cron.session_id` -> `cron.sessionId`, `cron.chain_id` -> `cron.chainId`, `cron.last_run_at` -> `cron.lastRunAt` |
| `daemon/tool-surface.ts:553-554` | `store.listCrons(seedId)` 반환이 camelCase가 되므로 그대로 API 응답으로 사용 가능 |
| `index.ts` | `StoredCron` export 추가 |
| 테스트 | `crons[0].last_run_at` -> `crons[0].lastRunAt` 등 assertion 변경 |

### 위험: 중간
- daemon `cron-scheduler.ts`의 `start()`에서 snake_case 직접 접근이 다수 -> 모두 camelCase로 변경 필요
- `isActive` 타입이 `number` -> `boolean`으로 변경되므로 `if (cron.is_active)` -> `if (cron.isActive)` (동작은 동일하지만 타입 레벨에서 변경)

---

## 변경 순서 (의존성 고려)

### Step A: SignedPolicy → PolicyInput 분리 (독립, 의존 없음)

**이유:** 다른 타입에 의존하지 않고, 다른 타입도 이것에 의존하지 않음
**수정 파일:** 5개 (guarded-wdk) + 2개 (daemon) + 테스트 4개

1. `approval-store.ts`: `SignedPolicy` → `PolicyInput { policies, signature }`, `StoredPolicy` extends 제거 → 독립 타입
2. `json-approval-store.ts`: `savePolicy` — `JSON.stringify(input.policies/signature)` 수행, `loadPolicy` — `StoredPolicy` 반환 유지
3. `sqlite-approval-store.ts`: 동일
4. `guarded-wdk-factory.ts:95`: `stored.policies` → `JSON.parse(stored.policies_json)`, `:156` `as PolicyInput`
5. `index.ts`: `SignedPolicy` export → `PolicyInput` export
6. `daemon/wdk-host.ts:87,163`: `stored.policies` fallback 제거, `savePolicy` 호출은 parsed 형태 그대로
7. `daemon/tool-surface.ts:480`: `policy?.policies` → `JSON.parse(policy.policies_json)`
8. 테스트: `json-approval-store.test.ts`, `sqlite-approval-store.test.ts` (savePolicy 입력을 parsed 형태로), `factory.test.ts`, `daemon/tool-surface.test.ts`

**노력:** 중 | **위험:** 중간

### Step B: JournalEntry 분리 -> JournalInput + JournalEntry (독립)

**이유:** daemon에 중복 타입이 있지만 import 관계는 없으므로 독립 수행 가능
**수정 파일:** 4개 (guarded-wdk) + 1개 (daemon, 선택)

1. `approval-store.ts`: `JournalInput` 신규, `JournalEntry` 재정의, `saveJournalEntry` 시그니처 변경
2. `json-approval-store.ts`: `saveJournalEntry` fallback 제거, 반환 매핑 확인
3. `sqlite-approval-store.ts`: 동일
4. `index.ts`: `JournalInput` export 추가
5. daemon: `execution-journal.ts` 로컬 타입은 유지 (자체 interface이므로 이번에 안 건드려도 됨)
6. 테스트: 변경 최소 (이미 필수 필드 제공중)

**노력:** 소 | **위험:** 낮음

### Step C: CronInput optional 정리 (독립)

**이유:** `CronInput`은 `saveCron` 입력에만 사용, 다른 타입에 의존 없음
**수정 파일:** 4개 (guarded-wdk) + 테스트

1. `approval-store.ts`: `CronInput` 재정의
2. `json-approval-store.ts`: `saveCron` fallback 제거
3. `sqlite-approval-store.ts`: 동일
4. 테스트: `id` 제거, `chainId` 누락 시 `null` 명시, `sessionId` 필수화

**노력:** 소 | **위험:** 낮음

### Step D: PendingApprovalRow public 누수 차단

**이유:** `loadPendingByRequestId` 반환 타입 변경 -> daemon `control-handler.ts` 수정 필요
**수정 파일:** 3개 (guarded-wdk) + 1개 (daemon)

1. `approval-store.ts`: `loadPendingByRequestId` 반환 타입 `PendingApprovalRequest`로 변경
2. `json-approval-store.ts`: `loadPendingByRequestId`에서 매핑 추가
3. `sqlite-approval-store.ts`: 동일
4. `daemon/control-handler.ts`: 로컬 `ApprovalStoreReader` interface 수정 + snake_case -> camelCase 접근 변경

**노력:** 중 | **위험:** 중간 (daemon 수정 누락 시 런타임 에러)

### Step E: CronRecord -> CronRow + StoredCron (D 이후 권장)

**이유:** D의 "internal -> public 매핑" 패턴과 동일하므로 D 이후에 하면 패턴이 확립됨
**수정 파일:** 4개 (guarded-wdk) + 2개 (daemon) + 테스트

1. `store-types.ts`: `CronRecord` -> `CronRow` rename
2. `approval-store.ts`: `StoredCron` 신규, `listCrons` 반환 타입 변경
3. `json-approval-store.ts`: `listCrons` 매핑, 내부 `CronRow` 사용
4. `sqlite-approval-store.ts`: 동일
5. `daemon/cron-scheduler.ts`: snake_case -> camelCase 접근 변경
6. `daemon/tool-surface.ts`: 이미 `any` 타입이므로 변경 최소
7. `index.ts`: `StoredCron` export 추가
8. 테스트: `last_run_at` -> `lastRunAt` 등

**노력:** 중 | **위험:** 중간 (daemon 수정 범위가 넓음)

### 권장 실행 순서

```
A (SignedPolicy) ─┐
B (JournalEntry) ─┼─ 독립 실행 가능, 병렬 가능
C (CronInput) ────┘
       │
       ▼
D (PendingApprovalRow) ── 패턴 확립
       │
       ▼
E (CronRecord → CronRow + StoredCron) ── D와 동일 패턴
```

A, B, C는 순서 무관하고 각각 독립이므로 병렬 또는 임의 순서로 가능.
D, E는 "internal row -> public mapped type" 패턴이 동일하므로 D를 먼저 하고 E에서 동일 패턴 적용.

---

## 위험 평가

| Step | 위험 | 주요 위험 요소 | 완화 방안 |
|------|------|---------------|----------|
| A | 중간 | factory.ts + factory.test.ts + tool-surface.test.ts가 parsed form 직접 접근 | 컴파일 에러로 검출 가능, 테스트 전략에 명시 |
| B | 낮음 | daemon 중복 JournalEntry 타입 | daemon 로컬 타입 유지, 이번에 건드리지 않음 |
| C | 낮음 | 테스트에서 id 없이 saveCron 호출 | sqlite 테스트에 1건 있음 (auto-generates id 테스트), 수정 필요 |
| D | 중간 | control-handler.ts snake_case 접근 3곳 | 컴파일 에러로 검출 가능 (TS strict) |
| E | 중간 | cron-scheduler.ts snake_case 접근 6곳 + `CronStore.listCrons`가 `any[]` | `CronStore` 반환 타입을 `StoredCron[]`로 좁혀야 컴파일 에러 검출 가능 |

### 전체 위험 완화

1. **각 Step마다 `pnpm --filter guarded-wdk test` 실행**: 154 tests 전부 pass 확인
2. **각 Step마다 `pnpm --filter daemon tsc --noEmit` 실행**: daemon 타입 체크
3. **Step D, E 이후 daemon 통합 테스트 확인**
4. **롤백**: 각 Step은 하나의 git commit, revert 가능

---

## 테스팅 전략

### 기존 테스트 수정

| 테스트 파일 | Step | 예상 변경 |
|------------|------|----------|
| `json-approval-store.test.ts` policy 섹션 | A | `savePolicy` 입력을 `{ policies: [...], signature: {...} }` parsed 형태로 변경 |
| `sqlite-approval-store.test.ts` policy 섹션 | A | 동일 |
| `factory.test.ts:224,231,302` | A | `stored.policies` → `JSON.parse(stored.policies_json)` |
| `daemon/tests/tool-surface.test.ts:52,203` | A | mock에서 parsed `policies` → `policies_json` string |
| `json-approval-store.test.ts` crons 섹션 | C | `id` 필드 제거 (3건), `chainId` null 명시, `sessionId` 필수화 |
| `json-approval-store.test.ts` crons 섹션 | E | `last_run_at` -> `lastRunAt`, `is_active` 접근 제거 |
| `sqlite-approval-store.test.ts` crons 섹션 | C | 동일 + `saveCron auto-generates id` 테스트 수정 |
| `sqlite-approval-store.test.ts` crons 섹션 | E | `last_run_at` -> `lastRunAt`, `is_active` -> `isActive` |
| `json-approval-store.test.ts` journal 섹션 | B | 변경 최소 (이미 필수 필드 제공중) |
| `sqlite-approval-store.test.ts` journal 섹션 | B | 동일 |

### 추가 테스트 불필요
- 기존 테스트가 모든 store 메서드의 round-trip을 검증
- 타입 리팩토링이므로 동작 변경 없음, 기존 테스트 통과가 충분한 검증

---

## 성공 지표

1. `pnpm --filter guarded-wdk test` -- 154 tests, 6 suites 전부 pass
2. `pnpm --filter daemon tsc --noEmit` -- 타입 에러 0
3. `approval-store.ts` public API에 `@internal` store-types.ts의 타입이 반환 타입으로 노출되지 않음
4. `approval-store.ts`에 `?` optional 필드가 남아있지 않음 (대상 5개 타입 한정)
5. `guarded-wdk/src/index.ts`의 public export에 snake_case 타입이 추가되지 않음
