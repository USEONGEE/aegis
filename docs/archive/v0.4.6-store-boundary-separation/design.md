# v0.4.6 Store 경계 분리 -- 설계 문서

## 요약

ApprovalStore 단일 추상 클래스(31개 메서드, 11개 테이블)를 **WdkStore**(10개 카테고리) + **DaemonStore**(cron 1개 카테고리)로 분리한다. rejection/journal 기록을 WDK 내부로 이동하여 역방향 쓰기 흐름을 제거하고, `getApprovalStore()` + `getBroker()` + `initWDK()` raw store 반환을 모두 제거하여 daemon이 facade 경유로만 WDK 데이터에 접근하게 강제한다. 컴파일 타임 + CI + 런타임(별도 SQLite) 3중 경계를 구축한다.

---

## 1. 해결 접근법

### 대안 비교

| 접근법 | 설명 | 장점 | 단점 | 판정 |
|--------|------|------|------|------|
| **A. 인터페이스 분리만** | ApprovalStore를 WdkStore/DaemonStore 인터페이스로 분리하되, 단일 SQLite 파일 유지 | 최소 변경 | 런타임 격리 없음, DB 테이블 공유 지속 | 기각 |
| **B. 완전 분리 (선택)** | 인터페이스 분리 + 별도 SQLite + 컴파일 타임 경계 + rejection/journal 내부화 | 근본 해결, 의존 방향 정리 | 변경 범위 큼 (PRD 기각 판단: breaking change 허용) | **채택** |
| **C. Proxy 패턴** | facade가 내부적으로 store를 proxy하여 daemon 접근 제한 | 런타임 방어 | 컴파일 타임 보장 없음, 런타임 오류 → 디버깅 어려움 | 기각 |

**판정 근거**: 프로젝트 원칙 "Breaking change 적극 허용" + "No Two-Way Implements". B안이 모든 근본 원인을 구조적으로 해결한다.

---

## 2. 아키텍처 개요

```
┌─────────────────────────────────────────────────┐
│  daemon                                          │
│                                                  │
│  tool-surface ──→ WdkFacade (읽기 전용 조회)     │
│  admin-server ──→ WdkFacade (읽기 전용 조회)     │
│  cron-scheduler ──→ DaemonStore (직접 소유)      │
│  execution-journal: 삭제 (WDK 내부화)             │
│                                                  │
│  ┌──────────────┐     ┌─────────────────────┐    │
│  │ DaemonStore  │     │ WdkFacade 인터페이스  │   │
│  │ (cron 전용)  │     │ (daemon이 아는 유일   │   │
│  │ daemon.db    │     │  한 WDK 접점)        │   │
│  └──────────────┘     └────────┬────────────┘    │
│                                │ facade 메서드    │
└────────────────────────────────┼──────────────────┘
                                 │
┌────────────────────────────────┼──────────────────┐
│  guarded-wdk                   │                   │
│                                ▼                   │
│  ┌────────────────────────────────────────────┐    │
│  │ createGuardedWDK() → GuardedWDKFacade       │   │
│  │  ├── getAccount()                           │   │
│  │  ├── loadPolicy()             ← NEW         │   │
│  │  ├── getPendingApprovals()    ← NEW         │   │
│  │  ├── listRejections()         ← NEW         │   │
│  │  ├── listPolicyVersions()     ← NEW         │   │
│  │  ├── listSigners()            ← NEW         │   │
│  │  ├── listWallets()            ← NEW         │   │
│  │  ├── listJournal()            ← NEW         │   │
│  │  ├── on() / off()                           │   │
│  │  └── dispose()                              │   │
│  └────────────┬───────────────────────────────┘    │
│               │ 내부                               │
│  ┌────────────▼───────────────────────────────┐    │
│  │ WdkStore                                    │   │
│  │  ├── master_seed, wallets, policies         │   │
│  │  ├── pending, history, signers, nonces      │   │
│  │  ├── policy_versions                        │   │
│  │  ├── rejection_history (자동 기록)           │   │
│  │  └── execution_journal (자동 기록)           │   │
│  │  wdk.db                                     │   │
│  └─────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

---

## 3. WdkStore / DaemonStore 인터페이스 설계

### 3.1 WdkStore (guarded-wdk 내부 전용)

ApprovalStore의 cron 4개 메서드를 제거하고, 나머지 27개 메서드를 그대로 유지한다. 클래스 이름만 변경한다.

```typescript
// packages/guarded-wdk/src/wdk-store.ts

export abstract class WdkStore {
  // --- Master Seed (2) ---
  abstract getMasterSeed (): Promise<MasterSeed | null>
  abstract setMasterSeed (mnemonic: string): Promise<void>

  // --- Wallets (4) ---
  abstract listWallets (): Promise<StoredWallet[]>
  abstract getWallet (accountIndex: number): Promise<StoredWallet | null>
  abstract createWallet (accountIndex: number, name: string, address: string): Promise<StoredWallet>
  abstract deleteWallet (accountIndex: number): Promise<void>

  // --- Active Policy (4) ---
  abstract loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null>
  abstract savePolicy (accountIndex: number, chainId: number, input: PolicyInput, description: string): Promise<void>
  abstract getPolicyVersion (accountIndex: number, chainId: number): Promise<number>
  abstract listPolicyChains (accountIndex: number): Promise<string[]>

  // --- Pending Requests (4) ---
  abstract loadPendingApprovals (accountIndex: number | null, type: string | null, chainId: number | null): Promise<PendingApprovalRequest[]>
  abstract loadPendingByRequestId (requestId: string): Promise<PendingApprovalRequest | null>
  abstract savePendingApproval (accountIndex: number, request: ApprovalRequest): Promise<void>
  abstract removePendingApproval (requestId: string): Promise<void>

  // --- History (2) ---
  abstract appendHistory (entry: HistoryEntry): Promise<void>
  abstract getHistory (opts: HistoryQueryOpts): Promise<HistoryEntry[]>

  // --- Signers (5) ---
  abstract saveSigner (publicKey: string, name: string | null): Promise<void>
  abstract getSigner (publicKey: string): Promise<StoredSigner | null>
  abstract listSigners (): Promise<StoredSigner[]>
  abstract revokeSigner (publicKey: string): Promise<void>
  abstract isSignerRevoked (publicKey: string): Promise<boolean>

  // --- Nonce (2) ---
  abstract getLastNonce (approver: string): Promise<number>
  abstract updateNonce (approver: string, nonce: number): Promise<void>

  // --- Execution Journal (4) ---
  abstract getJournalEntry (intentHash: string): Promise<StoredJournal | null>
  abstract saveJournalEntry (entry: JournalInput): Promise<void>
  abstract updateJournalStatus (intentHash: string, status: JournalStatus, txHash: string | null): Promise<void>
  abstract listJournal (opts: JournalQueryOpts): Promise<StoredJournal[]>

  // --- Rejection History (2) ---
  abstract saveRejection (entry: RejectionEntry): Promise<void>
  abstract listRejections (opts: RejectionQueryOpts): Promise<RejectionEntry[]>

  // --- Policy Versions (1) ---
  abstract listPolicyVersions (accountIndex: number, chainId: number): Promise<PolicyVersionEntry[]>

  // --- Lifecycle (2) ---
  abstract init (): Promise<void>
  abstract dispose (): Promise<void>
}
// 합계: 32개 메서드 (cron 4개 제거, abstract로 전환)
```

**변경점 vs 현재 ApprovalStore**:
- cron 4개 메서드(`listCrons`, `saveCron`, `removeCron`, `updateCronLastRun`) 제거
- `abstract` 키워드 사용 (현재는 throw 기본 구현) -- 구현 누락을 컴파일 타임에 잡기 위함
- `deleteWallet()`에서 cron 삭제 로직 제거

**결정: abstract vs throw 기본 구현**

현재 ApprovalStore는 모든 메서드가 `throw new Error('Not implemented')` 기본 구현을 가진다. 이것은 구현 누락을 런타임에서야 발견하게 만든다. `abstract`로 전환하면 구현체가 메서드를 빠뜨릴 경우 컴파일 에러가 발생한다. 프로젝트의 TypeScript strict 모드와 부합하므로 `abstract`로 전환한다.

### 3.2 DaemonStore (daemon 패키지 소유)

```typescript
// packages/daemon/src/daemon-store.ts

export interface DaemonStore {
  listCrons (accountIndex: number | null): Promise<StoredCron[]>
  saveCron (accountIndex: number, cron: CronInput): Promise<string>
  removeCron (cronId: string): Promise<void>
  updateCronLastRun (cronId: string, timestamp: number): Promise<void>
  init (): Promise<void>
  dispose (): Promise<void>
}
```

**결정: abstract class vs interface**

DaemonStore는 `interface`로 정의한다. 이유:
1. 메서드 6개로 작다
2. daemon 패키지 내부에서만 사용
3. 테스트 mock 작성이 더 쉽다
4. 구현체가 1개뿐이므로 상속 계층 불필요

**타입 소속**: `CronInput`, `StoredCron` 타입은 현재 guarded-wdk의 `approval-store.ts`에 정의되어 있다. daemon이 guarded-wdk에서 이 타입을 import하면 순환 의존이 아닌 단방향 의존(daemon -> guarded-wdk)이므로 그대로 유지한다. 다만 향후 cron 타입을 daemon 패키지로 이동할 수 있도록 `@wdk-app/canonical` 패키지로 extract하는 옵션을 남겨둔다.

**결정: cron 타입 위치**

v0.4.6 scope에서는 `CronInput`/`StoredCron`을 guarded-wdk에서 export 유지한다. daemon이 guarded-wdk를 이미 의존하고 있으므로 추가 의존이 생기지 않는다. canonical로의 이동은 별도 phase에서 검토한다.

### 3.3 SqliteWdkStore 구현

현재 `SqliteApprovalStore`를 `SqliteWdkStore`로 리네임하고 cron 관련 코드를 제거한다.

- `_createTables()`에서 `crons` 테이블 DDL 제거
- `deleteWallet()` 트랜잭션에서 crons 삭제 제거
- cron 4개 메서드 제거
- `extends WdkStore` (현재 `extends ApprovalStore`)

### 3.4 SqliteDaemonStore 구현

```typescript
// packages/daemon/src/sqlite-daemon-store.ts

import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { chmodSync } from 'node:fs'
import type { DaemonStore } from './daemon-store.js'
import type { CronInput, StoredCron } from '@wdk-app/guarded-wdk'

export class SqliteDaemonStore implements DaemonStore {
  private _dbPath: string
  private _db: Database.Database | null

  constructor (dbPath: string) {
    this._dbPath = dbPath
    this._db = null
  }

  async init (): Promise<void> {
    this._db = new Database(this._dbPath)
    chmodSync(this._dbPath, 0o600)
    this._db.pragma('journal_mode = WAL')
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS crons (
        id TEXT PRIMARY KEY,
        account_index INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        interval TEXT NOT NULL,
        prompt TEXT NOT NULL,
        chain_id INTEGER,
        created_at INTEGER NOT NULL,
        last_run_at INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1
      );
    `)
  }

  async dispose (): Promise<void> {
    if (this._db) { this._db.close(); this._db = null }
  }

  // listCrons, saveCron, removeCron, updateCronLastRun --
  // SqliteApprovalStore의 cron 구현을 그대로 이동
}
```

### 3.5 JsonWdkStore / JsonDaemonStore

`JsonApprovalStore`를 동일하게 분리:
- `JsonWdkStore`: cron 메서드/파일 제거, `extends WdkStore`
- `JsonDaemonStore`: cron 메서드만 포함, `implements DaemonStore`

테스트에서 JsonApprovalStore를 광범위하게 사용하므로, **ApprovalStore backward compat re-export는 만들지 않는다** (No Backward Compatibility 원칙). 모든 테스트를 WdkStore/DaemonStore로 전환한다.

---

## 3.6 데이터 모델 변경: targetHash → dedupKey rename

**결정**: `targetHash`를 `dedupKey`로 전면 rename한다.

**근거**: 현재 `targetHash`는 `intentHash(timestamp 포함)`로 생성되어 동일 tx여도 매번 달라져 dedup 키 역할을 하지 못한다. v0.4.6에서 `dedupKey = hash(chainId, to, data, value)` (timestamp 제외)로 의미를 근본 변경하므로, 필드명도 함께 변경하여 혼동을 방지한다. DB 폐기 정책이므로 스키마 변경 비용 없음.

**영향 범위**: `JournalInput`, `StoredJournal`, `RejectionEntry`, SQLite 컬럼, JSON 파일 키, 테스트 기대값

```typescript
// 변경 전 (현재)
interface JournalInput {
  intentHash: string      // PK
  accountIndex: number
  chainId: number
  targetHash: string      // = intentHash (timestamp 포함, dedup 불가)
  status: JournalStatus
}

// 변경 후
interface JournalInput {
  intentHash: string      // PK (시도별 고유, timestamp 포함)
  accountIndex: number
  chainId: number
  dedupKey: string        // 안정 키 (timestamp 제외, dedup 기준)
  status: JournalStatus
}
```

```typescript
// 변경 전
interface RejectionEntry {
  intentHash: string
  accountIndex: number
  chainId: number
  targetHash: string
  reason: string
  context: unknown
  policyVersion: number
  rejectedAt: number
}

// 변경 후
interface RejectionEntry {
  intentHash: string      // 시도별 고유
  accountIndex: number
  chainId: number
  dedupKey: string        // 안정 키
  reason: string
  context: unknown
  policyVersion: number
  rejectedAt: number
}
```

SQLite 컬럼:
- `execution_journal.target_hash` → `execution_journal.dedup_key`
- `rejection_history.target_hash` → `rejection_history.dedup_key`

---

## 4. Rejection / Journal 내부화 메커니즘

### 4.1 Rejection 내부화

**현재 흐름** (역방향):
```
middleware.evaluatePolicy() → throw PolicyRejectionError
  ↓ (에러 전파)
daemon/tool-surface.ts catch → store.getPolicyVersion() + store.saveRejection()
```

**목표 흐름** (WDK 자체 완결):
```
middleware 내부 → evaluatePolicy() → REJECT →
  middleware가 직접 store.saveRejection() + throw PolicyRejectionError
```

**훅 포인트: `createGuardedMiddleware()` 내부**

`guarded-middleware.ts`의 `account.sendTransaction`, `account.transfer`, `account.signTransaction` 각각에서 `evaluatePolicy()` 호출 후 REJECT 판정 시, throw 직전에 rejection 기록을 삽입한다.

**transfer / signTransaction에서의 dedupKey/intentHash**: 3개 래퍼 모두 동일하게 `dedupKey` + `intentHash`를 로컬에서 계산한다. transfer는 내부적으로 sendTransaction의 축약형이므로 동일한 dedup/journal/rejection 흐름을 적용한다. journal 대상은 `sendTransaction`, `transfer`, `signTransaction` 모두 포함.

```typescript
// guarded-middleware.ts -- createGuardedMiddleware() 변경 사항

interface MiddlewareConfig {
  policyResolver: (chainId: number) => Promise<Policy[]>
  emitter: EventEmitter
  chainId: number
  getAccountIndex: () => number
  // NEW: rejection 기록 콜백
  onRejection: (entry: RejectionEntry) => Promise<void>
  // NEW: policyVersion 조회 콜백
  getPolicyVersion: (accountIndex: number, chainId: number) => Promise<number>
}
```

**결정: store 직접 주입 vs 콜백**

콜백 방식을 채택한다. 이유:
1. middleware는 현재 store를 import하지 않으며, CI 체크(`middlewareNoDirectStore`)가 이를 강제한다
2. 콜백은 기존 `policyResolver` 패턴과 일관적이다
3. WdkStore 타입을 middleware에 노출하지 않아도 된다

**구현 상세**:

rejection 기록은 journal track 이후 수행한다 (dedupKey와 intentHash를 journal에서 이미 생성).

```typescript
// sendTransaction 래퍼 내부
if (decision === 'REJECT') {
  const accountIndex = getAccountIndex()
  const pv = await getPolicyVersion(accountIndex, chainId)

  // dkey, iHash는 함수 상단에서 이미 계산됨 (journal 참조)
  if (journal) await journal.updateStatus(iHash, 'rejected')

  await onRejection({
    intentHash: iHash,
    accountIndex,
    chainId,
    dedupKey: dkey,
    reason,
    context,
    policyVersion: pv,
    rejectedAt: Date.now()
  }).catch(() => { /* best-effort, 실패해도 에러는 throw */ })

  // intentHash를 에러에 포함하여 daemon에 전달
  throw new PolicyRejectionError(reason, context, iHash)
}
```

**PolicyRejectionError 확장**: daemon이 응답에 intentHash를 포함해야 하므로, middleware가 authoritative intentHash를 에러에 실어 올린다.

```typescript
// packages/guarded-wdk/src/errors.ts
export class PolicyRejectionError extends Error {
  context: unknown
  intentHash: string
  constructor (reason: string, context: unknown, intentHash: string) {
    super(reason)
    this.name = 'PolicyRejectionError'
    this.context = context
    this.intentHash = intentHash
  }
}
```

**factory 연결** (`guarded-wdk-factory.ts`):

```typescript
wdk.registerMiddleware(chainKey, createGuardedMiddleware({
  policyResolver: async (chainId) => { /* 기존 */ },
  emitter,
  chainId: Number(chainKey),
  getAccountIndex: () => currentAccountIndex,
  // NEW
  onRejection: async (entry) => { await approvalStore.saveRejection(entry) },
  getPolicyVersion: async (acctIdx, cId) => { return approvalStore.getPolicyVersion(acctIdx, cId) }
}))
```

**daemon 측 변경**: tool-surface.ts에서 rejection 저장 코드 전체 제거.
- `sendTransaction` catch 블록: `store.getPolicyVersion()` + `store.saveRejection()` 삭제
- `transfer` catch 블록: 동일 삭제
- `signTransaction` catch 블록: 동일 삭제
- `ToolStorePort`에서 `saveRejection`, `getPolicyVersion` 제거

### 4.2 Journal 내부화

**현재 흐름** (daemon 관리):
```
daemon/index.ts → new ExecutionJournal(store, logger)
daemon/tool-surface.ts → journal.track(), journal.updateStatus(), journal.isDuplicate()
```

**목표 흐름** (WDK 미들웨어 내부):
```
middleware 내부 → sendTransaction 래퍼:
  1. intentHash 계산
  2. isDuplicate 체크 → 중복이면 조기 반환 (결과: { duplicate: true })
  3. saveJournalEntry(status: 'received')
  4. 실행 시도
  5. 성공: updateJournalStatus('settled', hash)
  6. 실패: updateJournalStatus('failed' or 'rejected')
```

**훅 포인트: `createGuardedMiddleware()` 내부 -- sendTransaction/signTransaction 래퍼**

```typescript
interface MiddlewareConfig {
  // ... 기존 + rejection 콜백
  // NEW: journal 콜백
  journal: {
    isDuplicate: (dedupKey: string) => boolean
    track: (intentHash: string, meta: { accountIndex: number; chainId: number; dedupKey: string }) => Promise<void>
    updateStatus: (intentHash: string, status: JournalStatus, txHash: string | null) => Promise<void>
  } | null
}
```

**결정: ExecutionJournal 클래스를 WDK로 이동 vs 콜백 인터페이스**

콜백 인터페이스를 채택한다. 이유:
1. ExecutionJournal의 인메모리 캐시(hashIndex, statusIndex)는 daemon 프로세스 생명주기에 종속되므로 WDK 내부로 이동하는 것이 자연스럽지 않다
2. 그러나 journal의 영속 데이터(store 기록)는 WDK 도메인이다

**재분석**: 위 논리에 모순이 있다. journal을 "WDK 내부화"한다는 PRD 결정과, "인메모리 캐시가 daemon 생명주기 종속"이라는 판단이 충돌한다.

**수정된 설계**:

ExecutionJournal 클래스 자체를 guarded-wdk 패키지로 이동한다. 이유:
1. journal의 본질은 "WDK가 실행한 tx의 생명주기 추적 + 중복 방지"이다
2. 인메모리 캐시는 WDK 초기화 시 store에서 recover한다
3. daemon은 journal에 직접 접근하지 않는다 -- facade를 통해 `listJournal()`만 읽기 가능

**구현 상세**:

1. `ExecutionJournal` 클래스를 `packages/guarded-wdk/src/execution-journal.ts`로 이동
2. `createGuardedMiddleware()`에 journal 인스턴스를 주입
3. middleware 내부에서 `sendTransaction`/`signTransaction` 래퍼가 journal 호출
4. daemon의 `execution-journal.ts` 삭제
5. daemon의 tool-surface.ts에서 journal 관련 코드 전체 제거

```typescript
// guarded-middleware.ts
interface MiddlewareConfig {
  policyResolver: (chainId: number) => Promise<Policy[]>
  emitter: EventEmitter
  chainId: number
  getAccountIndex: () => number
  onRejection: (entry: RejectionEntry) => Promise<void>
  getPolicyVersion: (accountIndex: number, chainId: number) => Promise<number>
  journal: ExecutionJournal | null   // NEW
}
```

**결정: dedupKey와 intentHash 분리**

현재 `intentHash({ chainId, to, data, value, timestamp })` 함수는 `timestamp`를 포함하므로, 동일한 tx를 다시 보내도 매번 해시가 달라져 dedup이 구조적으로 불가능하다. 이는 현재 daemon 구현의 기존 버그이며, journal 내부화 시 함께 수정한다.

- **`dedupKey`** = `hash(chainId, to, data, value)` — 안정 키, timestamp 제외. journal dedup에 사용
- **`intentHash`** = `intentHash({ chainId, to, data, value, timestamp })` — 시도별 고유 식별자, journal 레코드 PK

`@wdk-app/canonical`에 `dedupKey()` 함수를 추가한다:
```typescript
// packages/canonical/src/index.ts
export function dedupKey({ chainId, to, data, value }: Omit<IntentInput, 'timestamp'>): string {
  const normalized = { chainId, data: normalizeAddress(data), to: normalizeAddress(to), value: normalizeValue(value) }
  return '0x' + sha256(JSON.stringify(normalized, Object.keys(normalized).sort()))
}
```

Middleware 내부 sendTransaction:
```typescript
account.sendTransaction = async (tx) => {
  const policyArr = await policyResolver(chainId)
  const accountIndex = getAccountIndex()

  // dedupKey: 안정 키 (timestamp 없음)
  const dkey = dedupKey({ chainId, to: tx.to!, data: tx.data!, value: String(tx.value || '0') })
  // intentHash: 시도별 고유 식별자
  const iHash = intentHash({ chainId, to: tx.to!, data: tx.data!, value: String(tx.value || '0'), timestamp: Date.now() })

  // Journal: 중복 체크 (dedupKey 기준)
  if (journal && journal.isDuplicate(dkey)) {
    throw new DuplicateIntentError(dkey, iHash)
  }

  // Journal: track (intentHash를 PK로, dedupKey를 dedup 인덱스로)
  if (journal) await journal.track(iHash, { accountIndex, chainId, dedupKey: dkey })

  // emit IntentProposed
  emitter.emit('IntentProposed', { ... })

  // Policy evaluation
  const { decision, reason, context } = evaluatePolicy(policyArr, chainId, tx)
  emitter.emit('PolicyEvaluated', { ... })

  if (decision === 'REJECT') {
    if (journal) await journal.updateStatus(iHash, 'rejected')
    await onRejection({
      intentHash: iHash, accountIndex, chainId, dedupKey: dkey,
      reason, context, policyVersion: await getPolicyVersion(accountIndex, chainId), rejectedAt: Date.now()
    }).catch(() => {})
    throw new PolicyRejectionError(reason, context, iHash)
  }

  // 실행
  try {
    const result = await rawSendTransaction(tx)
    if (journal) await journal.updateStatus(iHash, 'settled', result.hash)
    emitter.emit('ExecutionBroadcasted', { ... })
    return result
  } catch (err) {
    if (journal) await journal.updateStatus(iHash, 'failed')
    emitter.emit('ExecutionFailed', { ... })
    throw err
  }
}
```

**에러에 intentHash를 실어 올리기**: middleware가 authoritative intentHash를 에러 객체에 포함하여 daemon에 전달한다.

```typescript
// packages/guarded-wdk/src/errors.ts
export class DuplicateIntentError extends Error {
  dedupKey: string
  intentHash: string
  constructor (dedupKey: string, intentHash: string) {
    super(`Duplicate intent: ${dedupKey}`)
    this.name = 'DuplicateIntentError'
    this.dedupKey = dedupKey
    this.intentHash = intentHash
  }
}
```

daemon의 tool-surface.ts에서:
```typescript
} catch (err) {
  if (err.name === 'DuplicateIntentError') {
    return { status: 'duplicate', dedupKey: err.dedupKey, intentHash: err.intentHash }
  }
  if (err.name === 'PolicyRejectionError') {
    // rejection 저장 코드 삭제됨 -- WDK가 이미 기록함
    // intentHash는 에러 객체에서 가져옴 (middleware가 authoritative)
    return { status: 'rejected', reason: errMsg(err), intentHash: err.intentHash, context: err.context ?? null }
  }
  // ...
}
```

**ExecutionJournal 변경점**: 인메모리 dedup 인덱스를 `dedupKey`로 keying한다 (기존 `targetHash` → `dedupKey`).
```typescript
class ExecutionJournal {
  private dedupIndex = new Map<string, string>() // dedupKey → intentHash

  isDuplicate (dedupKey: string): boolean {
    return this.dedupIndex.has(dedupKey)
  }

  async track (intentHash: string, meta: { accountIndex: number; chainId: number; dedupKey: string }) {
    this.dedupIndex.set(meta.dedupKey, intentHash)
    await this.store.saveJournalEntry({ intentHash, ...meta, status: 'received' })
  }
}
```

---

## 5. Facade 확장 API 설계

### 5.1 GuardedWDKFacade 인터페이스 변경

```typescript
// packages/guarded-wdk/src/guarded-wdk-factory.ts

interface GuardedWDKFacade {
  // --- 기존 유지 ---
  getAccount (chain: string, index: number): Promise<IWalletAccountWithProtocols>
  getAccountByPath (chain: string, path: string): Promise<IWalletAccountWithProtocols>
  getFeeRates (chain: string): Promise<FeeRates>
  on (type: string, handler: (...args: unknown[]) => void): void
  off (type: string, handler: (...args: unknown[]) => void): void
  dispose (): void

  // --- 제거 ---
  // getApprovalBroker (): SignedApprovalBroker   ← 삭제
  // getApprovalStore (): ApprovalStore           ← 삭제

  // --- 신규: daemon → WDK 읽기 경유 ---
  loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null>
  getPendingApprovals (accountIndex: number | null, type: string | null, chainId: number | null): Promise<PendingApprovalRequest[]>
  listRejections (opts: RejectionQueryOpts): Promise<RejectionEntry[]>
  listPolicyVersions (accountIndex: number, chainId: number): Promise<PolicyVersionEntry[]>
  listSigners (): Promise<StoredSigner[]>
  listWallets (): Promise<StoredWallet[]>
  listJournal (opts: JournalQueryOpts): Promise<StoredJournal[]>

  // --- 신규: broker 기능 facade 흡수 ---
  submitApproval (signedApproval: SignedApproval, context: ApprovalSubmitContext): Promise<void>
  createApprovalRequest (type: ApprovalType, opts: CreateRequestOptions): Promise<ApprovalRequest>
  setTrustedApprovers (approvers: string[]): Promise<void>
}
```

### 5.2 daemon 포트 인터페이스 변경

기존 3개 포트를 facade 메서드에 맞게 재정의한다.

```typescript
// packages/daemon/src/ports.ts -- 변경 후

// ToolStorePort → WdkFacadePort (tool-surface용)
export interface WdkFacadePort {
  loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null>
  getPendingApprovals (accountIndex: number | null, type: string | null, chainId: number | null): Promise<PendingApprovalRequest[]>
  listRejections (opts: RejectionQueryOpts): Promise<RejectionEntry[]>
  listPolicyVersions (accountIndex: number, chainId: number): Promise<PolicyVersionEntry[]>
  createApprovalRequest (type: ApprovalType, opts: CreateRequestOptions): Promise<ApprovalRequest>
}

// AdminStorePort → AdminFacadePort (admin-server용)
export interface AdminFacadePort {
  listSigners (): Promise<StoredSigner[]>
  listWallets (): Promise<StoredWallet[]>
  listJournal (opts: JournalQueryOpts): Promise<StoredJournal[]>
}

// ToolStorePort의 cron 메서드 → DaemonStore로 이동
// ApprovalBrokerPort → 제거 (facade.createApprovalRequest로 대체)

// CronStore 인터페이스는 cron-scheduler.ts 로컬에서 DaemonStore와 동일하므로 DaemonStore로 대체
```

### 5.3 ToolExecutionContext 변경

**결정: WDKInstance와 GuardedWDKFacade 통합**

`getApprovalBroker()`와 `getApprovalStore()`를 제거하면 WDKInstance는 facade의 부분집합이 된다. 따라서 **단일 `facade` 객체**로 통합한다. daemon이 아는 WDK 접점은 `GuardedWDKFacade` 하나뿐이다.

```typescript
// packages/daemon/src/tool-surface.ts

export interface ToolExecutionContext {
  facade: WdkFacadePort          // WDK 접점 통합 (getAccount + 읽기 + 승인)
  cronStore: DaemonStore         // cron 직접 접근
  logger: Logger
  // journal 제거 -- WDK 내부화
}
```

### 5.4 daemon/index.ts 변경

```typescript
// 변경 전
const { wdk, broker, store } = await initWDK(config, logger)
const journal = new ExecutionJournal(store, logger)
const ctx = { wdk, broker, store, logger, journal }
const cronScheduler = new CronScheduler(store, ...)
const adminServer = new AdminServer({ ... }, { store, journal, ... })

// 변경 후
const { facade } = await initWDK(config, logger)
const daemonStore = new SqliteDaemonStore(daemonDbPath)
await daemonStore.init()
const ctx = { facade, cronStore: daemonStore, logger }
const cronScheduler = new CronScheduler(daemonStore, ...)
const adminServer = new AdminServer({ ... }, { facade, cronScheduler, relayClient, logger })
```

### 5.5 wdk-host.ts 변경

```typescript
// 변경 후
export interface WDKInitResult {
  facade: GuardedWDKFacade | null   // 단일 접점 (WDKInstance + store/broker 통합)
}

export async function initWDK (config: DaemonConfig, logger: Logger): Promise<WDKInitResult> {
  // 아래 옵션 C 참조: store를 boot 단계에서 생성하고, facade 반환 후 참조를 폐기
}
```

**문제: master_seed 부트스트랩**

현재 `initWDK()`는 store를 먼저 생성하고 `getMasterSeed()`로 시드 유무를 확인한 후, 시드가 있으면 `createGuardedWDK()`를 호출한다. store가 facade 뒤로 숨으면 이 부트스트랩 흐름이 깨진다.

**해결**: `createGuardedWDK()`의 config에서 `seed` 파라미터를 선택적으로 만드는 대신(No Optional 원칙 위반), 두 단계로 분리한다:

```typescript
// 옵션 A: factory에 "seed-less" 모드 추가
// → No Optional 위반. 기각.

// 옵션 B: store 경로를 factory에 전달하고, factory가 내부에서 seed 확인
// → factory의 책임이 너무 커짐. 기각.

// 옵션 C (채택): wdk-host가 store를 생성하되, facade를 만든 후 store 참조를 폐기
export async function initWDK (config: DaemonConfig, logger: Logger): Promise<WDKInitResult> {
  const dbPath = resolveDbPath(config.storePath, 'wdk.db')
  await mkdir(dirname(dbPath), { recursive: true })

  // 1. store 생성 (boot 전용 -- facade 생성 후 폐기)
  const store = new SqliteWdkStore(dbPath)
  await store.init()

  // 2. seed 확인
  const masterSeed = await store.getMasterSeed()
  if (!masterSeed) {
    // seed 없으면 store를 facade 없이 반환할 수 없음
    // → 별도 "no-seed" 반환 타입
    await store.dispose()
    return { facade: null }
  }

  // 3. signers 로드 (trustedApprovers)
  const signers = await store.listSigners()
  const trustedApprovers = signers.filter(s => !s.revokedAt).map(s => s.publicKey)

  // 4. store를 dispose하지 않고 factory에 전달 (factory가 소유권 획득)
  const wdkFacade = await createGuardedWDK({
    seed: masterSeed.mnemonic,
    wallets: {},
    protocols: {},
    approvalStore: store,   // factory 내부에서만 사용
    trustedApprovers
  })

  // 5. store 참조를 로컬에서 폐기 -- facade만 반환
  // (store 인스턴스 자체는 factory 내부에서 계속 사용됨)

  return { facade: wdkFacade }
}
```

**결정**: WDKInstance와 GuardedWDKFacade를 합쳐서 반환한다. 현재 WDKInstance는 `getAccount | getApprovalBroker | getApprovalStore | on | off | dispose`인데, `getApprovalBroker`와 `getApprovalStore`가 제거되면 WDKInstance는 facade의 부분집합이 된다. 따라서 하나의 facade 객체로 통합한다.

```typescript
export interface WDKInitResult {
  facade: GuardedWDKFacade | null
}
```

---

## 6. 경계 강제 방법

### 6.0 경계 강제 범위 정의

**목표**: daemon에서 WdkStore 구현체의 **runtime import를 차단**한다.

**범위 제한**: `restricted-usage.ts` 프레임워크는 `import type`과 type-only named import를 의도적으로 건너뛴다 (`isTypeOnly()` 체크). 이는 올바른 동작이다 — type-only import는 컴파일 후 제거되므로 런타임 경계에 무해하다. daemon이 WdkStore의 **타입**을 참조하는 것은 허용하되, **인스턴스를 생성하거나 메서드를 호출**하는 것을 차단한다.

**강제 수준 정리**:
| 레벨 | 수단 | 보장 |
|------|------|------|
| **Runtime import 차단** | CI restricted-usage 체크 | daemon에서 WdkStore 인스턴스 생성/호출 불가 |
| **물리적 DB 분리** | 별도 SQLite 파일 | 같은 DB 파일 공유 불가 |
| **Type boundary** | facade 인터페이스로 노출 | daemon은 facade 타입만 직접 참조 |

### 6.1 기존 CI 인프라 활용

프로젝트에 이미 `scripts/check/` CI 인프라가 있다:
- `responsibility-boundary.ts`: 메서드 호출/import 제한 체크
- `package-exports-boundary.ts`: deep import 차단
- `restricted-usage.ts`: 공통 프레임워크

### 6.2 새 CI 체크 추가

`restricted-usage.ts` 프레임워크의 `shouldCheck` 동작:
- `allow`: 화이트리스트 — 이 파일들만 사용 허용 (나머지 모두 차단)
- `deny`: 블랙리스트 — 이 파일들에서 사용 차단 (나머지 허용)
- **둘 다 repo-relative exact match** (glob 미지원)
- `packages: ['daemon']`으로 범위를 daemon 소스만으로 제한

```typescript
// scripts/check/checks/daemon/no-direct-wdk-store.ts

export const noDaemonDirectStoreAccess = createRestrictedUsageCheck({
  name: 'daemon/no-direct-wdk-store-access',
  packages: ['daemon'],
  rules: [
    // WdkStore 타입 import 금지 (wdk-host.ts boot 예외)
    { kind: 'import', symbolName: 'WdkStore', fromModules: ['@wdk-app/guarded-wdk'] },
    { kind: 'import', symbolName: 'SqliteWdkStore', fromModules: ['@wdk-app/guarded-wdk'],
      allow: ['packages/daemon/src/wdk-host.ts'] },
    { kind: 'import', symbolName: 'JsonWdkStore', fromModules: ['@wdk-app/guarded-wdk'] },

    // 구 ApprovalStore import 금지 (삭제 후에도 실수 방지)
    { kind: 'import', symbolName: 'ApprovalStore', fromModules: ['@wdk-app/guarded-wdk'] },
    { kind: 'import', symbolName: 'SqliteApprovalStore', fromModules: ['@wdk-app/guarded-wdk'] },
    { kind: 'import', symbolName: 'JsonApprovalStore', fromModules: ['@wdk-app/guarded-wdk'] },

    // getApprovalStore / getBroker 메서드 호출 금지
    { kind: 'method-call', methodName: 'getApprovalStore' },
    { kind: 'method-call', methodName: 'getApprovalBroker' },
  ]
})
```

### 6.3 index.ts export 정리

```typescript
// packages/guarded-wdk/src/index.ts

// 제거:
// export { ApprovalStore }
// export { JsonApprovalStore }
// export { SqliteApprovalStore }

// 추가:
export { WdkStore } from './wdk-store.js'
export { SqliteWdkStore } from './sqlite-wdk-store.js'
export { JsonWdkStore } from './json-wdk-store.js'
```

**단, daemon 패키지에서 WdkStore를 import하면 CI 체크가 실패하도록 설정한다.** daemon이 알아야 하는 것은 facade 인터페이스뿐이다.

### 6.4 guarded-wdk의 public export에서 store 구현체 제거 검토

daemon이 store를 직접 사용하지 않으므로, `SqliteWdkStore`와 `JsonWdkStore`를 public export에서 제거하는 것도 가능하다. 그러나:
- wdk-host.ts에서 `new SqliteWdkStore(dbPath)`로 생성해야 한다 (boot 단계)
- 테스트에서 store를 직접 사용한다

**결정**: `SqliteWdkStore`는 export 유지하되, CI 체크로 daemon에서의 import를 차단한다. 단, `wdk-host.ts`는 boot 전용으로 예외를 둔다.

이미 6.2의 CI 체크에서 `SqliteWdkStore`에 `allow: ['packages/daemon/src/wdk-host.ts']`를 설정하여 boot 전용 예외를 적용했다.

---

## 7. 단계별 구현 순서

### Step 1: WdkStore 추상 클래스 추출 + SqliteWdkStore/JsonWdkStore 리네임

**scope**: guarded-wdk 패키지만 변경, daemon 무변경

1. `packages/guarded-wdk/src/wdk-store.ts` 생성: ApprovalStore에서 cron 4개 메서드 제거, abstract 키워드 적용
2. `SqliteApprovalStore` → `SqliteWdkStore` 리네임, `extends WdkStore`, cron 메서드/DDL 제거
3. `JsonApprovalStore` → `JsonWdkStore` 리네임, `extends WdkStore`, cron 메서드/파일 제거
4. `store-types.ts`에서 `CronRow`는 유지 (daemon에서 사용, canonical로 이동 전까지)
5. `index.ts` export 변경: `ApprovalStore` → `WdkStore`, `SqliteApprovalStore` → `SqliteWdkStore` 등
6. **backward compat**: `ApprovalStore`를 `WdkStore`의 alias로 re-export -- **No**. 원칙에 따라 alias 생성하지 않음. 모든 참조를 한 번에 변경.
7. guarded-wdk 테스트 전체 업데이트
8. CI 통과 확인

**노력**: 중간 (리네임 + 테스트 업데이트)
**위험**: 낮음 (guarded-wdk 내부만 변경)

### Step 2: DaemonStore 추출 + SqliteDaemonStore 구현

**scope**: daemon 패키지 + guarded-wdk cron 타입 export

1. `packages/daemon/src/daemon-store.ts` 인터페이스 정의
2. `packages/daemon/src/sqlite-daemon-store.ts` 구현 (SqliteApprovalStore의 cron 메서드 복사)
3. `cron-scheduler.ts`의 로컬 `CronStore` 인터페이스를 `DaemonStore`로 교체
4. `daemon/index.ts`에서 `SqliteDaemonStore` 생성 + cron-scheduler에 주입
5. daemon 테스트 업데이트

**노력**: 낮음 (인터페이스 + 복사)
**위험**: 낮음

### Step 3: Rejection 내부화

**scope**: guarded-wdk (middleware + factory) + daemon (tool-surface)

1. `guarded-middleware.ts`의 `MiddlewareConfig`에 `onRejection` + `getPolicyVersion` 콜백 추가
2. sendTransaction/transfer/signTransaction 래퍼에서 REJECT 시 `onRejection` 호출 삽입
3. `guarded-wdk-factory.ts`에서 middleware config에 콜백 연결
4. `daemon/tool-surface.ts`에서 rejection 저장 코드 제거 (3곳)
5. `ToolStorePort`에서 `saveRejection`, `getPolicyVersion` 제거
6. daemon 테스트 업데이트: rejection mock 제거
7. guarded-wdk 테스트: middleware rejection 기록 검증 테스트 추가

**노력**: 중간
**위험**: 중간 -- 미들웨어 동작 변경. 기존 rejection 데이터 형식 유지 확인 필요.

### Step 4: Journal 내부화

**scope**: guarded-wdk (middleware + factory + ExecutionJournal 이동) + daemon (tool-surface + index + execution-journal 삭제)

1. `packages/daemon/src/execution-journal.ts`를 `packages/guarded-wdk/src/execution-journal.ts`로 이동
   - store 인터페이스를 WdkStore 메서드로 교체
   - Logger를 선택적으로 만들거나 콜백으로 교체 (guarded-wdk는 pino 의존 없음)
2. `DuplicateIntentError` 추가 (`errors.ts`)
3. `guarded-middleware.ts`의 `MiddlewareConfig`에 `journal` 추가
4. sendTransaction/signTransaction 래퍼에서 journal 호출 삽입
5. `guarded-wdk-factory.ts`에서 journal 인스턴스 생성 + middleware에 주입
6. `daemon/tool-surface.ts`에서 journal 관련 코드 전체 제거
7. `daemon/index.ts`에서 `ExecutionJournal` import 및 생성 제거
8. `daemon/execution-journal.ts` 파일 삭제
9. daemon 테스트 업데이트

**Logger 의존 문제**: guarded-wdk는 현재 pino를 의존하지 않는다. ExecutionJournal은 pino Logger를 사용한다.

**해결**: journal 내부에서 logger를 선택적 콜백으로 교체한다:
```typescript
interface JournalLogger {
  info (obj: Record<string, unknown>, msg: string): void
  error (obj: Record<string, unknown>, msg: string): void
}
```
factory에서 emitter 기반 로깅으로 교체하거나, 무작동 logger를 기본값으로 사용한다.

**노력**: 높음 (파일 이동 + 미들웨어 변경 + 에러 클래스 추가 + 테스트 전면 수정)
**위험**: 높음 -- journal은 중복 실행 방지를 담당하므로 회귀 시 실제 tx 중복 실행 가능.

### Step 5: Facade 확장 + getApprovalStore/getBroker 제거

**scope**: guarded-wdk (factory) + daemon (모든 파일)

1. `GuardedWDKFacade` 인터페이스에 신규 메서드 추가 (loadPolicy, getPendingApprovals, listRejections, listPolicyVersions, listSigners, listWallets, listJournal, submitApproval, createApprovalRequest, setTrustedApprovers)
2. `createGuardedWDK()` 반환 객체에 구현 추가 (store/broker 호출을 래핑)
3. `getApprovalBroker()`, `getApprovalStore()` 제거
4. daemon의 `WDKInstance` 타입 변경
5. daemon의 `ports.ts` 변경: ToolStorePort → WdkFacadePort, AdminStorePort → AdminFacadePort, ApprovalBrokerPort 제거
6. daemon의 `wdk-host.ts` 변경: `WDKInitResult`에서 store/broker 제거
7. daemon의 `index.ts` 변경: facade 기반 context 구성
8. daemon의 `tool-surface.ts` 변경: store/broker 대신 facade 사용
9. daemon의 `admin-server.ts` 변경: facade 사용
10. daemon의 `control-handler.ts` 변경: broker 대신 facade.submitApproval 사용
11. guarded-wdk `index.ts`에서 `SignedApprovalBroker` export 유지 (내부에서 사용되지만, control-handler가 타입으로 참조하지 않도록)

**결정: SignedApprovalBroker export 유지 여부**

현재 daemon의 `control-handler.ts`와 `wdk-host.ts`가 `SignedApprovalBroker`를 직접 import한다:
- `control-handler.ts`: `ControlHandlerDeps.broker: SignedApprovalBroker` 타입으로 사용
- `wdk-host.ts`: `new SignedApprovalBroker(...)` 생성자 호출 (mock WDK)

facade 전환 후:
- `control-handler.ts`는 facade의 `submitApproval()` 메서드만 사용 -- broker 타입 불필요
- `wdk-host.ts`의 mock WDK도 facade 인터페이스를 mock -- broker 직접 생성 불필요

따라서 `SignedApprovalBroker`를 public export에서 제거할 수 있다. 그러나 이것은 이번 Step의 scope를 넘어서므로, **export는 유지하되 daemon에서의 import를 CI로 차단**하는 방식으로 진행한다. 후속 phase에서 export 정리.

**노력**: 높음 (daemon 전 파일 수정)
**위험**: 높음 -- 모든 daemon-WDK 상호작용이 변경됨. 기능 회귀 가능.

### Step 6: CI 경계 체크 추가 + 런타임 DB 분리

1. `scripts/check/checks/daemon/no-direct-wdk-store.ts` 추가
2. `scripts/check/registry.ts`에 등록
3. daemon의 DB 경로 분리: `wdk.db` (WDK) + `daemon.db` (DaemonStore)
4. config에 `daemonStorePath` 추가
5. 기존 DB 파일 삭제 안내 문서

**노력**: 낮음
**위험**: 낮음

### Step 7: 정리 + 테스트 보강

1. ApprovalStore 클래스 삭제 (WdkStore로 완전 대체 확인 후)
2. daemon의 execution-journal.ts 삭제 확인
3. 사용하지 않는 import/export 정리
4. dead-exports CI 체크 재실행
5. 통합 테스트 작성: daemon → facade → WDK store 전체 흐름

**노력**: 중간
**위험**: 낮음

---

## 8. 리스크 분석

### 8.1 Critical

| 리스크 | 영향 | 완화 방안 |
|--------|------|-----------|
| Journal 내부화 후 중복 tx 실행 | 실제 자산 손실 가능 | Step 4 전후 반드시 journal dedup 테스트 작성. isDuplicate 동작을 단위 테스트 + 통합 테스트로 검증 |
| Rejection 내부화 후 기록 누락 | 정책 위반 추적 불가 | onRejection 콜백 실패 시에도 PolicyRejectionError는 throw (best-effort 기록). 테스트로 기록 확인 |

### 8.2 Major

| 리스크 | 영향 | 완화 방안 |
|--------|------|-----------|
| Facade 메서드 누락으로 daemon 기능 손실 | daemon 도구가 작동 안 함 | Step 5에서 facade 메서드를 현재 daemon의 모든 store/broker 호출과 1:1 매핑 확인. 체크리스트 작성 |
| JsonWdkStore 테스트 대량 실패 | CI 파괴 | Step 1에서 리네임과 동시에 모든 테스트 파일 업데이트. 병합 전 전체 테스트 통과 필수 |
| control-handler의 broker 직접 접근 제거 시 승인 기능 깨짐 | 앱에서 승인 불가 | Step 5에서 control-handler 변경 시 기존 control-handler.test.ts의 모든 케이스 통과 확인 |

### 8.3 Minor

| 리스크 | 영향 | 완화 방안 |
|--------|------|-----------|
| Logger 의존 (pino) 문제 | guarded-wdk에 pino 의존 추가 필요 | JournalLogger 인터페이스로 추상화하여 pino 의존 회피 |
| CronRow 타입 위치 (guarded-wdk에 잔류) | 의미적 불일치 | v0.4.6 scope 밖. 후속 phase에서 canonical로 이동 |
| 기존 DB 폐기로 개발 데이터 손실 | 개발 편의성 저하 | README에 DB 재생성 절차 문서화 |

### 8.4 롤백 전략

각 Step은 독립 커밋으로 관리한다. Step N이 실패하면:
- Step N의 커밋을 revert
- Step N-1 상태에서 원인 분석 후 재시도
- Step 3-4 (rejection/journal 내부화)가 가장 위험하므로, 이 구간에서는 feature branch를 사용

---

## 9. 테스트 전략

### 9.1 단위 테스트

| 대상 | 파일 | 검증 항목 |
|------|------|-----------|
| SqliteWdkStore | `sqlite-wdk-store.test.ts` | 기존 sqlite-approval-store.test.ts에서 cron 테스트 제거 + WdkStore 타입 확인 |
| JsonWdkStore | `json-wdk-store.test.ts` | 기존 json-approval-store.test.ts에서 cron 테스트 제거 |
| SqliteDaemonStore | `sqlite-daemon-store.test.ts` | cron CRUD, 별도 DB 파일 생성 확인 |
| Middleware rejection | `guarded-middleware.test.ts` | REJECT 시 onRejection 콜백 호출 확인, 콜백 실패 시에도 에러 throw 확인 |
| ExecutionJournal (WDK 내부) | `execution-journal.test.ts` | 기존 테스트를 guarded-wdk로 이동, WdkStore mock 사용 |
| DuplicateIntentError | `errors.test.ts` | 에러 클래스 속성 확인 |

### 9.2 통합 테스트

| 대상 | 검증 항목 |
|------|-----------|
| Facade → WdkStore | facade.loadPolicy() → store.loadPolicy() 위임 확인 |
| Middleware rejection flow | evaluatePolicy REJECT → store에 rejection 기록 → PolicyRejectionError throw → daemon catch 후 반환 |
| Middleware journal flow | sendTransaction → journal.track → 실행 → journal.updateStatus 확인 |
| Middleware dedup flow | 동일 intent 두 번 → 두 번째에서 DuplicateIntentError |
| daemon → facade 전체 | tool-surface가 facade만으로 모든 기능 수행 |

### 9.3 CI 검증

| 체크 | 예상 결과 |
|------|-----------|
| `daemon/no-direct-wdk-store-access` | daemon에서 WdkStore/SqliteWdkStore import 시 실패 (wdk-host.ts 예외) |
| `guarded-wdk/responsibility-boundary` | 기존 체크 모두 통과 |
| `cross/package-exports-boundary` | deep import 없음 |
| `typescript-compile` | 전체 패키지 컴파일 성공 |

---

## 10. 성공 지표

1. daemon 코드에서 `WdkStore`, `SqliteWdkStore`, `ApprovalStore`, `SqliteApprovalStore` import가 0건 (wdk-host.ts boot 예외 제외)
2. daemon 코드에서 `store.saveRejection`, `store.saveJournalEntry`, `store.updateJournalStatus` 호출이 0건
3. daemon 코드에서 `getApprovalStore()`, `getBroker()` 호출이 0건
4. `wdk.db`와 `daemon.db`가 별도 파일로 존재
5. CI 체크 18개 + 신규 1개 = 19개 중 17개 이상 PASS (기존 2개 FAIL은 dead-exports 관련으로 별도 phase)
6. 전체 테스트 스위트 통과
7. rejection/journal이 WDK 미들웨어 내부에서 자동 기록됨을 테스트로 증명
