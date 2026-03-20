# 설계 - v0.2.0

## 변경 규모
**규모**: 운영 리스크
**근거**: DB 스키마 전면 재설계, 4개 패키지 수정, 내부 API 변경 (ApprovalStore 인터페이스), 데이터 파기 (clean install)

---

## 문제 요약
1 니모닉에서 여러 지갑을 BIP-44로 파생하는 구조로 전환. 현재 "다중 니모닉 + 단일 활성 seed" 모델을 "단일 니모닉 + 다중 파생 계정" 모델로 교체. 동시에 metadata 제거, intentId 제거, 지갑 생명주기를 Unified SignedApproval로 통합.

> 상세: [README.md](README.md) 참조

## 접근법

**핵심 전략**: `seedId`(UUID, 니모닉 식별자)를 `accountIndex`(BIP-44 정수, 파생 계정 식별자)로 **전면 교체**.

현재 `seedId`가 모든 저장소의 FK로 작용하므로(policies, crons, journal, history, pending_requests), 이를 `accountIndex`로 바꾸면 기존 데이터 구조를 유지하면서 의미만 변경됨.

1. **Layer 0 (guarded-wdk)**: `StoredSeed[]` → `MasterSeed` + `StoredWallet[]`, ApprovalStore 메서드 재설계
2. **Layer 0 (canonical)**: `intentHash`에 `timestamp` 파라미터 추가
3. **Layer 1 (guarded-wdk)**: `ApprovalRequest`/`SignedApproval`에서 `metadata` 제거, `accountIndex`/`signerId`/`content` 승격
4. **daemon**: `WDKContext.seedId` 제거, 도구 호출 시 `accountIndex`로 계정 결정
5. **app**: 새 필드(`content`, `accountIndex`) 표시

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: seedId를 유지하고 파생 계정 테이블 추가 | 기존 FK 구조 변경 최소화 | seedId가 "니모닉 ID"라는 의미를 계속 가짐, 1개밖에 없는데 FK로 남음 | ❌ |
| B: seedId를 accountIndex로 전면 교체 | 의미가 명확, BIP-44 직결, active 개념 자연 소멸 | 모든 FK 변경 필요 (하지만 clean install이므로 문제 없음) | ✅ |
| C: walletId(UUID)를 새로 도입 | 기존 패턴(UUID FK) 유지 | accountIndex와 walletId 매핑이 불필요하게 추가됨, BIP-44와 거리 | ❌ |

**선택 이유**: B. clean install이므로 FK 전면 변경 비용이 없고, `accountIndex`가 BIP-44 derivation path(`m/44'/60'/{accountIndex}'/0/0`)와 직결되어 의미가 가장 명확.

## 기술 결정

| 결정 | 내용 | 근거 |
|------|------|------|
| 지갑 식별자 | `accountIndex: number` (0-based) | BIP-44 표준, 정수라 비교/정렬 용이 |
| 니모닉 저장 | `master_seed` 테이블 (row 1개) | 니모닉은 1개만 존재 |
| 정책 키 | `(accountIndex, chainId)` 복합 키 | 지갑별+체인별 정책 |
| Journal PK | `intentHash` (timestamp 포함) | intentId(UUID) 제거, 결정론적 PK |
| 승인 요청 | `metadata` 제거, `accountIndex`/`signerId`/`content` 정규 필드 | 타입 안전성 |
| 지갑 생명주기 | `ApprovalType`에 `wallet_create`/`wallet_delete` | Unified SignedApproval |
| 데이터 마이그레이션 | clean install (파기) | breaking change 허용 |

---

## 범위 / 비범위

**범위 (In Scope)**:
- guarded-wdk: 타입 재설계 + ApprovalStore 인터페이스 + 구현체(json/sqlite)
- canonical: `intentHash`에 timestamp 추가
- daemon: WDKContext/tool-surface/execution-journal/cron-scheduler/wdk-host/control-handler
- app: 새 필드 표시 (content, accountIndex)

**비범위 (Out of Scope)**:
- BIP-44 coin_type 분기 (단일 coin_type)
- App UI 리디자인
- relay 변경 (relay의 DeviceRecord는 별도 도메인)

## 가정/제약

- BIP-44 파생은 `@tetherto/wdk`의 기존 HD wallet 구현이 `accountIndex` 기반 파생을 지원한다고 가정
- SQLite TEXT 컬럼에서 accountIndex는 INTEGER로 저장 (seed_id TEXT → account_index INTEGER)
- 니모닉은 daemon 로컬에만 저장, relay/app으로 전송되지 않음
- clean install: 기존 DB 파일 삭제 후 재생성

## 아키텍처 개요

```
MasterSeed (1개, 니모닉 보유)
  │
  ├── Wallet 0 ("DeFi")    ── m/44'/60'/0'/0/0
  │     ├── Policy (chainId=1)
  │     ├── Policy (chainId=42161)
  │     ├── Cron[]
  │     └── Journal[]
  │
  ├── Wallet 1 ("Trading")  ── m/44'/60'/1'/0/0
  │     ├── Policy (chainId=1)
  │     └── Journal[]
  │
  └── Wallet 2 ("Savings")  ── m/44'/60'/2'/0/0
        └── Policy (chainId=1)

Daemon 시작:
  1. getMasterSeed() → 니모닉 로드
  2. listWallets() → 등록된 계정 목록
  3. 각 wallet의 정책 복원
  4. WDKContext 생성 (seedId 없음, 계정은 도구 호출 시 결정)

AI 도구 호출:
  sendTransaction({ chain, to, data, value, accountIndex: 0 })
  → WDK가 accountIndex 0의 파생 키로 서명
```

## 데이터 흐름

**TX 실행 (변경 후)**:
```
AI: sendTransaction({ chain: "ethereum", to: "0x...", data: "0x...", value: "0", accountIndex: 0 })
  │
  ├─ 1. intentHash = SHA-256(chainId + to + data + value + timestamp)
  ├─ 2. journal.track(intentHash, { accountIndex: 0, chainId: 1, targetHash })
  ├─ 3. account = wdk.getAccount("ethereum", accountIndex=0)  ← BIP-44 파생
  ├─ 4. evaluatePolicy(policies[0][1], chainId, tx)           ← wallet 0, chain 1의 정책
  │
  ├─ [AUTO] → account.sendTransaction(tx) → journal.updateStatus(intentHash, 'settled')
  │
  └─ [REQUIRE_APPROVAL] → ApprovalRequest {
       requestId, type: 'tx', chainId: 1, targetHash,
       accountIndex: 0, content: "AAVE에 1 ETH 공급 요청"    ← AI가 작성
     }
     → RN App에서 표시: "Wallet: DeFi (0) | AAVE에 1 ETH 공급 요청"
     → 사용자 승인 → SignedApproval → 실행
```

**지갑 생성 (신규)**:
```
사람 (RN App): "새 지갑 만들기" → accountIndex: 2, name: "Savings"
  │
  ├─ ApprovalRequest { type: 'wallet_create', accountIndex: 2, content: "Savings 지갑 생성" }
  ├─ 사용자 서명 → SignedApproval
  ├─ SignedApprovalBroker.resolve()
  │   └─ case 'wallet_create': store.createWallet(accountIndex, name)
  └─ 완료
```

## API/인터페이스 계약

### Layer 0 타입 변경

```typescript
// === 신규 ===

export interface MasterSeed {
  mnemonic: string        // 암호화된 BIP-39 니모닉
  createdAt: number
}

export interface StoredWallet {
  accountIndex: number    // PK, BIP-44 account index (0-based)
  name: string            // 사람이 붙인 이름
  address: string         // 파생된 주소 (표시용)
  createdAt: number
}

// === 변경 ===

// ApprovalType 확장 (device_revoke 유지 — 기존 코드/app과 정합성)
export type ApprovalType = 'tx' | 'policy' | 'policy_reject' | 'device_revoke'
                         | 'wallet_create' | 'wallet_delete'

// ApprovalRequest — metadata 제거, 필드 승격
export interface ApprovalRequest {
  requestId: string
  type: ApprovalType
  chainId: number
  targetHash: string
  accountIndex: number    // 신규: 어떤 지갑
  content: string         // 신규: AI→사람 메시지 (metadata 대체)
  createdAt: number
  // metadata 제거
}

// SignedApproval — metadata 제거, 필드 승격
export interface SignedApproval {
  type: ApprovalType
  requestId: string
  chainId: number
  targetHash: string
  approver: string
  signerId: string
  accountIndex: number    // 신규
  policyVersion: number
  expiresAt: number
  nonce: number
  sig: string
  content: string         // 신규
  // metadata 제거
}

// StoredPolicy — seedId → accountIndex
export interface StoredPolicy {
  accountIndex: number    // was: seedId
  chainId: number
  policiesJson: string
  signatureJson: string
  policyVersion: number
  updatedAt: number
}

// HistoryEntry — seedId → accountIndex
export interface HistoryEntry {
  accountIndex: number    // was: seedId
  requestId?: string
  type: ApprovalType
  chainId?: number | null
  targetHash: string
  approver: string
  signerId: string
  action: HistoryAction
  content?: string        // 신규: 이력에도 AI 메시지 보존
  signedApproval?: SignedApproval
  timestamp: number
}

// JournalInput — intentId → intentHash, seedId → accountIndex
export interface JournalInput {
  intentHash: string      // was: intentId (이제 PK)
  accountIndex: number    // was: seedId
  chainId: number
  targetHash: string
  status: JournalStatus
}

// StoredJournal — 동일 변경
export interface StoredJournal {
  intentHash: string      // PK (was: intentId)
  accountIndex: number    // was: seedId
  chainId: number
  targetHash: string
  status: JournalStatus
  txHash: string | null
  createdAt: number
  updatedAt: number
}

// StoredCron — seedId → accountIndex
export interface StoredCron {
  id: string
  accountIndex: number    // was: seedId
  sessionId: string
  interval: string
  prompt: string
  chainId: number | null
  createdAt: number
  lastRunAt: number | null
  isActive: boolean
}

// PendingApprovalRequest — seedId → accountIndex
export interface PendingApprovalRequest extends ApprovalRequest {
  // accountIndex는 ApprovalRequest에서 상속
  // seedId 제거
}

// QueryOpts — seedId → accountIndex
export interface HistoryQueryOpts {
  accountIndex?: number   // was: seedId
  type?: ApprovalType
  chainId?: number
  limit?: number
}

export interface JournalQueryOpts {
  accountIndex?: number   // was: seedId
  status?: JournalStatus
  chainId?: number
  limit?: number
}
```

### ApprovalStore 메서드 변경

```typescript
export abstract class ApprovalStore {
  // === 제거 ===
  // listSeeds, getSeed, addSeed, removeSeed, setActiveSeed, getActiveSeed

  // === 신규: Master Seed ===
  async getMasterSeed (): Promise<MasterSeed | null> { throw new Error('Not implemented') }
  async setMasterSeed (_mnemonic: string): Promise<void> { throw new Error('Not implemented') }

  // === 신규: Wallets ===
  async listWallets (): Promise<StoredWallet[]> { throw new Error('Not implemented') }
  async getWallet (_accountIndex: number): Promise<StoredWallet | null> { throw new Error('Not implemented') }
  async createWallet (_accountIndex: number, _name: string, _address: string): Promise<StoredWallet> { throw new Error('Not implemented') }
  async deleteWallet (_accountIndex: number): Promise<void> { throw new Error('Not implemented') }

  // === 변경: seedId → accountIndex ===
  async loadPolicy (_accountIndex: number, _chainId: number): Promise<StoredPolicy | null> { ... }
  async savePolicy (_accountIndex: number, _chainId: number, _input: PolicyInput): Promise<void> { ... }
  async getPolicyVersion (_accountIndex: number, _chainId: number): Promise<number> { ... }
  async listPolicyChains (_accountIndex: number): Promise<string[]> { ... }

  async loadPendingApprovals (_accountIndex: number | null, _type: string | null, _chainId: number | null): Promise<PendingApprovalRequest[]> { ... }
  async savePendingApproval (_accountIndex: number, _request: ApprovalRequest): Promise<void> { ... }

  async saveCron (_accountIndex: number, _cron: CronInput): Promise<string> { ... }
  async listCrons (_accountIndex?: number): Promise<StoredCron[]> { ... }

  // === 변경: intentId → intentHash ===
  async getJournalEntry (_intentHash: string): Promise<StoredJournal | null> { ... }
  async saveJournalEntry (_entry: JournalInput): Promise<void> { ... }
  async updateJournalStatus (_intentHash: string, _status: JournalStatus, _txHash?: string): Promise<void> { ... }
  async listJournal (_opts: JournalQueryOpts): Promise<StoredJournal[]> { ... }

  // History, Signers, Nonce — seedId 제거, 나머지 동일
  // ...
}
```

### canonical 변경

```typescript
// Before
export function intentHash({ chainId, to, data, value }: IntentInput): string

// After — timestamp 추가
export interface IntentInput {
  chainId: number
  to: string
  data: string
  value?: string | number | bigint | null
  timestamp: number         // 신규
}
export function intentHash({ chainId, to, data, value, timestamp }: IntentInput): string
```

### daemon 변경

```typescript
// WDKContext — seedId 제거
export interface WDKContext {
  wdk: WDKInstance
  broker: any
  store: any
  logger: Logger
  journal: ExecutionJournal | null
  relayClient?: RelayClient
  // seedId 제거
  // account 제거 (도구 호출 시 accountIndex로 생성)
}

// Tool 시그니처 — accountIndex 추가
// sendTransaction({ chain, to, data, value, accountIndex })
// signTransaction({ chain, to, data, value, accountIndex })
// transfer({ chain, token, recipient, amount, accountIndex })
// registerCron({ interval, prompt, chain, sessionId, accountIndex })
// putPolicy({ chain, policies, accountIndex })

// ExecutionJournal — seedId 제거, 전체 wallet 관리
export class ExecutionJournal {
  constructor (store: ApprovalStore, logger: Logger)  // seedId 파라미터 제거
}

// CronScheduler — seedId 제거, 전체 cron 관리
export class CronScheduler {
  constructor (store: CronStore, wdkContext: WDKContext, ...)  // seedId 파라미터 제거
}
```

### wallet_create/wallet_delete용 typed payload

`content`는 사람이 읽는 메시지 전용. 기계가 소비하는 데이터는 `ApprovalRequest`/`SignedApproval`의 정규 필드로 처리.

`wallet_create`에 필요한 `name`은 `content`에서 꺼내지 않는다. 대신:
- `targetHash` = `SHA-256(accountIndex + name)` (지갑 생성 의도의 canonical hash)
- `content` = "Savings 지갑을 생성합니다" (사람이 읽는 메시지)
- `accountIndex` = 생성할 지갑 인덱스 (ApprovalRequest 정규 필드)
- `name`은 `pending_requests.wallet_name`에 저장 (단일 진실 원천)

```typescript
// wallet_create 처리
case 'wallet_create': {
  const accountIndex = signedApproval.accountIndex
  // name은 pending_requests.wallet_name에서 (단일 진실 원천)
  const pending = await this._store.loadPendingByRequestId(requestId)
  const name = pending?.walletName || `Wallet ${accountIndex}`
  const address = deriveAddress(masterSeed, accountIndex)
  await this._store.createWallet(accountIndex, name, address)
  break
}

// wallet_delete 처리 — hard delete + cascade
case 'wallet_delete': {
  const accountIndex = signedApproval.accountIndex
  // 트랜잭션으로 관련 데이터 일괄 삭제 (기존 removeSeed 패턴 동일)
  await this._store.deleteWallet(accountIndex)
  // deleteWallet 내부에서:
  //   DELETE FROM policies WHERE account_index = ?
  //   DELETE FROM pending_requests WHERE account_index = ?
  //   DELETE FROM crons WHERE account_index = ?
  //   DELETE FROM execution_journal WHERE account_index = ?
  //   DELETE FROM wallets WHERE account_index = ?
  //   approval_history는 보존 (감사 이력)
  break
}
```

### wallet_delete 데이터 보존 정책

| 테이블 | 삭제 | 이유 |
|--------|------|------|
| `wallets` | 삭제 | 지갑 자체 제거 |
| `policies` | 삭제 | 지갑 없으면 정책도 의미 없음 |
| `pending_requests` | 삭제 | 미처리 요청 폐기 |
| `crons` | 삭제 | 예약 실행 중단 |
| `execution_journal` | 삭제 | 실행 이력 (운영용, 감사 아님) |
| `approval_history` | **보존** | 감사 이력 — 삭제된 wallet이라도 "누가 뭘 승인했는지" 기록 유지 |

hard delete. soft delete/archived 모델은 사용하지 않음 (No Fallback 원칙).

## 데이터 모델/스키마

### SQLite 스키마 (신규)

```sql
-- 니모닉 1개만 저장
CREATE TABLE master_seed (
  id INTEGER PRIMARY KEY CHECK (id = 1),    -- row 1개 강제
  mnemonic TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- BIP-44 파생 계정
CREATE TABLE wallets (
  account_index INTEGER PRIMARY KEY,         -- BIP-44 index
  name TEXT NOT NULL,
  address TEXT NOT NULL,                      -- 파생 주소 (표시용)
  created_at INTEGER NOT NULL
);

-- 정책: seedId → account_index
CREATE TABLE policies (
  account_index INTEGER NOT NULL REFERENCES wallets(account_index),
  chain_id INTEGER NOT NULL,
  policies_json TEXT NOT NULL,
  signature_json TEXT NOT NULL,
  policy_version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_index, chain_id)
);

-- 대기 중 승인 요청 (metadata_json 제거, FK 없음)
-- wallet_create는 아직 존재하지 않는 accountIndex를 참조하므로 FK를 걸지 않는다.
-- "요청"은 확정된 상태가 아니며, broker가 resolve할 때 유효성을 검증한다.
CREATE TABLE pending_requests (
  request_id TEXT PRIMARY KEY,
  account_index INTEGER NOT NULL,                -- FK 없음 (wallet_create 지원)
  type TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  target_hash TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  wallet_name TEXT,                              -- wallet_create 전용 (nullable)
  created_at INTEGER NOT NULL
);

-- 승인 이력
CREATE TABLE approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_index INTEGER NOT NULL,
  type TEXT NOT NULL,
  chain_id INTEGER,
  target_hash TEXT NOT NULL,
  approver TEXT NOT NULL,
  signer_id TEXT NOT NULL,
  action TEXT NOT NULL,
  content TEXT,
  signed_approval_json TEXT,
  timestamp INTEGER NOT NULL
);

-- 서명자 (변경 없음)
CREATE TABLE signers (
  signer_id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  name TEXT,
  registered_at INTEGER NOT NULL,
  revoked_at INTEGER
);

-- 예약 실행
CREATE TABLE crons (
  id TEXT PRIMARY KEY,
  account_index INTEGER NOT NULL REFERENCES wallets(account_index),
  session_id TEXT NOT NULL,
  interval TEXT NOT NULL,
  prompt TEXT NOT NULL,
  chain_id INTEGER,
  created_at INTEGER NOT NULL,
  last_run_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- 실행 저널: intentId → intent_hash PK
CREATE TABLE execution_journal (
  intent_hash TEXT PRIMARY KEY,              -- was: intent_id
  account_index INTEGER NOT NULL,            -- was: seed_id
  chain_id INTEGER NOT NULL,
  target_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  tx_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 논스
CREATE TABLE nonces (
  approver TEXT NOT NULL,
  signer_id TEXT NOT NULL,
  last_nonce INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (approver, signer_id)
);
```

## 테스트 전략

| 레벨 | 대상 | 범위 |
|------|------|------|
| Unit | `ApprovalStore` (json/sqlite) | MasterSeed CRUD, Wallet CRUD, seedId→accountIndex 전환된 모든 메서드 |
| Unit | `SignedApprovalBroker` | wallet_create/wallet_delete 처리, metadata 제거 후 정규 필드 검증 |
| Unit | `intentHash` (canonical) | timestamp 포함 시 동일 tx가 다른 해시 생성 확인 |
| Unit | `evaluatePolicy` | accountIndex 기반 정책 로드+평가 |
| Integration | daemon tool-surface | sendTransaction/signTransaction에 accountIndex 전달, 정상 실행 |
| Integration | daemon boot | getMasterSeed → listWallets → 정책 복원 → WDKContext 생성 |
| Integration | ExecutionJournal | intentHash PK 기반 dedup, 다중 wallet journal 관리 |

기존 테스트(161 passed, 6 suites)는 seedId→accountIndex 변경에 맞춰 전부 수정.

## 실패/에러 처리

| 상황 | 처리 |
|------|------|
| 미등록 accountIndex로 도구 호출 | `WalletNotFoundError` throw (신규 에러) |
| MasterSeed 미설정 상태에서 도구 호출 | `NoMasterSeedError` throw (신규 에러) |
| wallet_delete 시 해당 wallet에 pending approval 존재 | 에러 throw, 삭제 거부 |
| wallet_create 시 이미 존재하는 accountIndex | 에러 throw |
| intentHash 충돌 (동일 tx + 동일 timestamp, 극히 희박) | 기존 레코드 유지, duplicate 반환 |

## 보안/권한

| 항목 | 설계 |
|------|------|
| AI 지갑 접근 | 등록된 accountIndex만 사용 가능, 미등록 → 에러 |
| 지갑 생성/삭제 | `wallet_create`/`wallet_delete` ApprovalType → 사람 서명 필수 |
| 니모닉 접근 | daemon 로컬만, relay/app으로 전송 안 됨 |
| derivation path | AI에게 노출 안 됨, accountIndex만 알 수 있음 |
| 정책 격리 | 지갑별 독립 정책, wallet A의 정책이 wallet B에 영향 없음 |

## 성능/스케일

N/A: 로컬 daemon + SQLite. wallet 수는 실질적으로 10개 미만. 성능 이슈 없음.

## 롤아웃/롤백 계획

N/A: clean install (데이터 파기). 롤백 = 이전 버전 바이너리로 복원 + 재초기화.

## 관측성

N/A: 로컬 daemon. 기존 pino 로거로 충분.

## seedId 교체 매트릭스

모든 `seedId` 사용처를 전수 파악한 교체 계획:

### guarded-wdk

| 파일 | 현재 seedId 사용 | 변경 |
|------|-----------------|------|
| `approval-store.ts` | `StoredSeed`, seed CRUD 메서드 6개 | `MasterSeed` + `StoredWallet` + wallet CRUD로 교체 |
| `approval-store.ts` | `loadPolicy(seedId, chainId)` 등 policy 메서드 4개 | `accountIndex` 파라미터로 교체 |
| `approval-store.ts` | `savePendingApproval(seedId, request)` | `accountIndex` 파라미터로 교체 |
| `approval-store.ts` | `loadPendingApprovals(seedId, ...)` | `accountIndex` 파라미터로 교체 |
| `approval-store.ts` | `saveCron(seedId, cron)`, `listCrons(seedId)` | `accountIndex` 파라미터로 교체 |
| `approval-store.ts` | `HistoryEntry.seedId`, `HistoryQueryOpts.seedId` | `.accountIndex`로 교체 |
| `approval-store.ts` | `StoredCron.seedId`, `StoredPolicy.seedId` | `.accountIndex`로 교체 |
| `approval-store.ts` | `JournalInput.seedId`, `StoredJournal.seedId` | `.accountIndex`로 교체 |
| `approval-store.ts` | `PendingApprovalRequest.seedId` | 제거 (accountIndex는 ApprovalRequest에서 상속) |
| `signed-approval-broker.ts` | `metadata?.seedId as string` | `signedApproval.accountIndex` 직접 접근 |
| `signed-approval-broker.ts` | `metadata?.signerId as string` (device_revoke) | `signedApproval.signerId` 직접 접근 (이미 정규 필드) |
| `json-approval-store.ts` | seed CRUD 구현 + seeds.json | master_seed.json + wallets.json으로 교체 |
| `sqlite-approval-store.ts` | seeds 테이블 + seed CRUD 구현 | master_seed + wallets 테이블로 교체 |
| `store-types.ts` | `SeedRow` | `WalletRow`로 교체 |

### daemon

| 파일 | 현재 seedId 사용 | 변경 |
|------|-----------------|------|
| `index.ts:36` | `const { seedId } = await initWDK(...)` | seedId 제거, WDKContext에서도 제거 |
| `index.ts:40-41` | `new ExecutionJournal(store, seedId, logger)` | seedId 파라미터 제거 |
| `index.ts:64` | `wdkContext.seedId = seedId!` | 제거 |
| `index.ts:144-146` | `new CronScheduler(store, seedId, ...)` | seedId 파라미터 제거 |
| `wdk-host.ts` | `getActiveSeed()` → seedId 추출 | `getMasterSeed()` → 니모닉 로드, wallet 목록은 별도 |
| `wdk-host.ts` | `listPolicyChains(seedId)` → 정책 복원 | `listWallets()` → 각 wallet별 정책 복원 |
| `tool-surface.ts:25-34` | `WDKContext.seedId` | 제거 |
| `tool-surface.ts:264` | `const { seedId } = wdkContext` | 제거, accountIndex는 args에서 받음 |
| `tool-surface.ts:273` | `journal.track(intentId, { seedId, ... })` | `intentHash` PK + `accountIndex` |
| `tool-surface.ts:514-519` | `metadata: { seedId, reason, policies }` | `accountIndex` 정규 필드 + `content` |
| `tool-surface.ts:531-546` | `store.saveCron(seedId, ...)` | `accountIndex` 파라미터 |
| `tool-surface.ts:553-571` | `store.listCrons(seedId)` 등 | `accountIndex` 필터 |
| `tool-surface.ts:465-500` | `store.loadPolicy(seedId, ...)` 등 | `accountIndex` 파라미터 |
| `execution-journal.ts` | `constructor(store, seedId, logger)` + `this._seedId` | seedId 제거, 전체 wallet journal 관리 |
| `cron-scheduler.ts` | `constructor(store, seedId, ...)` + `this._seedId` | seedId 제거, 전체 cron 관리 |
| `control-handler.ts:76` | `device_revoke` 처리 | 명칭 유지 (`device_revoke`) |
| `control-handler.ts:157,208` | metadata에서 seedId 접근 | accountIndex 정규 필드 접근 |
| `admin-server.ts:186,245` | seed_list, getActiveSeed | listWallets, getMasterSeed로 교체 |

### canonical

| 파일 | 현재 | 변경 |
|------|------|------|
| `index.ts:74` | `intentHash({ chainId, to, data, value })` | `timestamp` 파라미터 추가 |

### app (최소 연동)

| 파일 | 현재 | 변경 |
|------|------|------|
| `types.ts` | `ApprovalType` 정의 | `wallet_create`/`wallet_delete` 추가 |
| `SignedApprovalBuilder.ts` | metadata 접근 | accountIndex/content 정규 필드 접근 |
| `RelayClient.ts` | metadata 전달 | accountIndex/content 전달 |
| 승인 UI | metadata 없음 | content 표시 + wallet 이름 표시 |

## 리스크/오픈 이슈

| 리스크 | 영향 | 대응 |
|--------|------|------|
| `@tetherto/wdk`의 HD wallet이 accountIndex 기반 파생을 지원하지 않을 수 있음 | 블로커 | Step 5 초기에 검증, 미지원 시 직접 BIP-44 파생 구현 |
| wallet_create에서 address 파생 시점 | 설계 | createWallet 시 address를 미리 파생해서 저장 (표시용) |
| `content` 필드 길이 제한 | UX | SQLite TEXT 무제한, 하지만 RN App 표시 시 truncation 필요 |
