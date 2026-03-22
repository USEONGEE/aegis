# guarded-wdk 아키텍처 One-Pager

> AI의 tx 요청을 정책으로 판정하고, 중복 실행을 방지하며, 사람의 서명된 승인을 검증 후 도메인 작업을 수행하는 서명 엔진

---

## 개요

guarded-wdk는 WDK-APP 모노레포의 Layer 1 패키지로, `@tetherto/wdk` 위에 정책 기반 지갑 제어 레이어를 제공한다.
타입 의존성 그래프 기준 39 nodes, 84 edges, 13개 소스 파일로 구성.

v0.4.6에서 store 경계 분리 (ApprovalStore → WdkStore, cron 제거, journal 내부화), v0.4.7에서 dead export 정리.

---

## 도메인 Aggregate

### 1. 정책 (Policy)

> "온체인 tx의 실행 가능 여부를 규칙 기반으로 판정하는 체계"

Aggregate Root: `EvaluationResult` — `guarded-middleware.ts` (depth 4)
생애주기: Policy loaded → evaluate(tx) → ALLOW | REJECT → (REJECT 시 rejection 자동 기록)

```
  Transaction ──→ evaluatePolicy() ──→ [EvaluationResult]
   (internal)        (function)           (core, d4)
                        │                    │
                        │                    ├──→ Decision (enum, d0)
                        │                    ├──→ Rule (value, d1)
                        │                    └──→ EvaluationContext (value, d3)
                        │                           ├─→ Rule[]
                        │                           └─→ RuleFailure (d2)
                        │                                  └─→ FailedArg (d0)
                        │
                   Policy = CallPolicy | TimestampPolicy (d2)
                           │
                     CallPolicy ──→ PermissionDict (d0)
                     Rule ──→ ArgCondition (d0) + Decision (d0)

  SignTransactionResult (output, d0)
```

v0.4.6 변경: middleware에 `onRejection` 콜백 추가 — REJECT 시 `saveRejection()`을 WDK 내부에서 자동 호출. daemon이 직접 호출하던 것을 내부화.

### 2. 승인 (Approval)

> "사람이 Ed25519로 서명한, 도메인 작업 수행을 위한 인가 토큰"

Aggregate Root: `SignedApproval` — `wdk-store.ts` (depth 1)
생애주기: Request created → Pending → Signed → 6-step Verified → Domain ops → History recorded

```
  ApprovalSubmitContext ──→ submitApproval() ──→ [SignedApproval]
   (input, d0)                (broker)             (core, d1)
   = tx                                               │
   | policy_approval                                  ├──→ ApprovalType (enum, d0)
   | policy_reject                                    ├──→ targetHash, approver, sig
   | device_revoke                                    └──→ nonce + expiresAt
   | wallet_create
   | wallet_delete

  ApprovalRequest (input, d1) → PendingApprovalRequest (extends, d2)
  VerificationContext (input, d0) — broker 내부 전용
```

v0.4.6 변경: broker 접근이 `getApprovalBroker()` → facade 메서드(`submitApproval()`, `createApprovalRequest()`, `setTrustedApprovers()`)로 전환. daemon이 broker를 직접 참조하지 않음.

### 3. 저널 (Journal)

> "tx 실행 의도를 추적하고 중복 실행을 방지하는 인메모리 인덱스"

Aggregate Root: `ExecutionJournal` — `execution-journal.ts` (v0.4.6에서 daemon → wdk로 이동)
생애주기: received → settled | signed | failed | rejected

```
  TrackMeta ──→ [ExecutionJournal] ──→ JournalEntry
   (input)           │                    │
                     ├──→ _hashIndex      ├─ intentHash
                     │    (Map)           ├─ targetHash
                     │                    ├─ status
                     └──→ isDuplicate()   └─ txHash
                          (중복 체크)
```

- **이동 이유**: journal은 tx 실행의 중복 방지 기능. middleware가 tx를 실행하므로 WDK가 소유하는 게 맞음
- middleware에서 `isDuplicate()` 체크 → 중복 시 `DuplicateIntentError` throw
- `track()` + `updateStatus()` 자동 호출

### 4. 영속 (WdkStore)

> "정책, 월렛, 서명자, 승인 이력 등 WDK 도메인 상태의 추상 저장소"

Aggregate Root: `WdkStore` — `wdk-store.ts` (abstract class, v0.4.6에서 ApprovalStore → WdkStore 개명)
생애주기: init() → CRUD → dispose()

```
                        [WdkStore]  (port, abstract)
                             │
  ┌──────────────────────────┼──────────────────────────┐
  │            │             │            │             │
  ▼            ▼             ▼            ▼             ▼
MasterSeed  StoredWallet  StoredPolicy  StoredSigner  StoredJournal
 (value)     (value)      (value, d1)    (value)      (value, d2)

  HistoryEntry, RejectionEntry, PolicyVersionEntry

  Implementations: JsonWdkStore, SqliteWdkStore
```

v0.4.6 변경:
- **Cron 전면 제거**: `CronInput`/`StoredCron` 타입 + `saveCron()`, `listCrons()`, `removeCron()`, `updateCronLastRun()` 메서드 전부 삭제 → daemon의 DaemonStore에서 자체 정의
- **이름 변경**: ApprovalStore → WdkStore, SqliteApprovalStore → SqliteWdkStore, JsonApprovalStore → JsonWdkStore

### 5. 암호 (Crypto)

> "Ed25519 서명 검증 프리미티브"

Aggregate Root: `verify` — `crypto-utils.ts` (function)
생애주기: 정적

```
  message + sig + publicKey ──→ verify() → boolean
```

v0.4.7 변경: `sign()`, `generateKeyPair()`, `KeyPair` 타입을 **internal로 전환**. 공개 API는 `verify()`만 남음. WDK 외부에서 서명을 생성할 필요가 없기 때문.

---

## 도메인 관계 맵

```
  ┌────────┐                  ┌────────┐
  │ Policy │──onRejection──→ │WdkStore│
  │  정책   │                  │  영속   │
  └───┬────┘                  └───┬────┘
      │                           ▲
      │ loadPolicy()              │ appendHistory()
      │                           │ saveRejection()
      │                      ┌────┴───┐
      │                      │Approval│
      │                      │  승인   │
      │                      └───┬────┘
      │                           │ verify(sig)
      │                      ┌────▼───┐
      │                      │ Crypto │
      │                      │  암호   │
      │                      └────────┘
      │
      │ isDuplicate()
      │ track()
  ┌───▼────┐
  │Journal │
  │  저널   │
  └────────┘
```

- **Policy → WdkStore**: 정책 로드 + REJECT 시 rejection 자동 기록 (v0.4.6 내부화)
- **Policy → Journal**: tx 실행 전 isDuplicate() 체크, 실행 후 track/updateStatus (v0.4.6 내부화)
- **Approval → WdkStore**: 승인 처리 시 pending/history/signer/policy CRUD
- **Approval → Crypto**: 6-step 검증에서 verify()
- **Approval → Policy**: policy_approval 시 정책 저장 (broker 내부화)

---

## 기능 축

```
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │  1. 정책 평가     │  │  2. 승인 처리     │  │  3. 보호 조립     │
  │"tx를 허용하는가?" │  │"서명이 유효한가?" │  │"WDK를 어떻게     │
  │ [Policy+WdkStore │  │[Approval+Crypto  │  │ 안전하게 감싸나?" │
  │    +Journal]      │  │    +WdkStore]     │  │[Policy+Approval  │
  │                  │  │                   │  │ +WdkStore+Journal]│
  └────────┬─────────┘  └────────┬──────────┘  └────────┬─────────┘
           │                     │                      │
           ▼                     ▼                      ▼
     ALLOW/REJECT           Events emitted        GuardedWDKFacade
```

### 축 1. 정책 평가 (Policy Evaluation)

> "AI가 보낸 tx를 현재 정책으로 허용해도 되는가?"

v0.4.6 변경: rejection 기록 + journal 추적이 middleware 내부로 통합.

```
  Transaction ──→ journal.isDuplicate() ──→ 중복이면 DuplicateIntentError
      │
      ▼ (신규)
  journal.track(intentHash) → status: 'received'
      │
      ▼
  policyResolver(chainId) → evaluatePolicy() → Decision
      │                                           │
      ├─ ALLOW → rawSend() → journal.updateStatus('settled', txHash)
      │
      └─ REJECT → onRejection(saveRejection) → PolicyRejectionError
```

### 축 2. 승인 처리 (Approval Processing)

> "사람의 서명된 승인이 유효하면, 어떤 도메인 작업을 수행하는가?"

구조 동일 (v0.4.2에서 확정). daemon은 facade 메서드(`submitApproval()`)로만 접근.

### 축 3. 보호 조립 (Guard Assembly)

> "WDK account를 어떻게 감싸서 AI에게 안전하게 노출하는가?"

v0.4.6 변경: factory가 **facade 메서드 10+개**를 노출. `getApprovalBroker()`, `getApprovalStore()` 제거.

```
  GuardedWDKConfig ──→ createGuardedWDK() ──→ GuardedWDKFacade
                           │
                           │ 조립:
                           │ 1. new WDK(seed)
                           │ 2. new EventEmitter (단일)
                           │ 3. wdkStore.init()
                           │ 4. new SignedApprovalBroker
                           │ 5. new ExecutionJournal + recover()
                           │ 6. registerMiddleware (journal + onRejection 주입)
                           │
                           ▼
                     GuardedWDKFacade
                       ├─ getAccount(), getAccountByPath()
                       ├─ on(), off(), dispose()
                       │
                       ├─ 승인: submitApproval(), createApprovalRequest()
                       │        setTrustedApprovers(), getPendingApprovals()
                       │
                       ├─ 조회: loadPolicy(), getPolicyVersion()
                       │        listSigners(), listWallets()
                       │        listRejections(), listPolicyVersions()
                       │        listJournal()
                       │
                       └─ 기록: saveRejection()
```

daemon은 이 facade만 사용. store/broker에 직접 접근 불가.

---

## 시나리오

**시나리오 1: AI가 DeFi tx를 실행 (happy path)**

AI가 `GuardedAccount.sendTransaction(tx)` 호출
  → [Journal] isDuplicate() → 신규 → track() (Journal: → received)
  → [정책 평가] evaluatePolicy() → ALLOW
  → rawSendTransaction() → { hash, fee }
  → [Journal] updateStatus('settled', txHash) (Journal: received → settled)
  → emit IntentProposed → PolicyEvaluated → ExecutionBroadcasted

**시나리오 2: 중복 tx 거부 (v0.4.6 신규)**

AI가 같은 tx를 다시 요청
  → [Journal] isDuplicate(targetHash) → true
  → throw DuplicateIntentError(dedupKey, intentHash)
  → tx 실행하지 않음

**시나리오 3: 정책 위반 tx 거부 + 자동 기록**

AI가 GuardedAccount.sendTransaction(tx) 호출
  → [정책 평가] evaluatePolicy() → REJECT
  → [onRejection] saveRejection() 자동 호출 (v0.4.6: daemon이 하던 것을 WDK가 직접)
  → throw PolicyRejectionError(reason, context)

---

## 설계 분석 메모

### v0.4.6 Store 경계 분리 결과

| 항목 | Before | After |
|------|--------|-------|
| Store 이름 | ApprovalStore | WdkStore |
| Cron | WdkStore에 포함 | 제거 → DaemonStore |
| Journal | daemon 소유 | WDK로 이동 (middleware 내부화) |
| Rejection 기록 | daemon이 직접 호출 | middleware onRejection 콜백으로 자동 |
| Broker 접근 | `getApprovalBroker()` | facade: `submitApproval()` 등 |
| Store 접근 | `getApprovalStore()` | facade: `loadPolicy()` 등 10개 메서드 |

### VerificationContext 간접층 문제 (미해결)

`ApprovalSubmitContext` → `VerificationContext` 변환이 여전히 존재. `currentPolicyVersion`이 항상 null인 dead 필드. 후속 정리 대상.

### Dead Export 타입 gap 패턴 (해결됨)

`FailedArg`, `RuleFailure`는 `PolicyRejectionError.context: EvaluationContext | null`을 통해 타입 체인이 연결됨. 이전에 `context: unknown`이었던 것이 구체 타입으로 좁혀져서 소비자(daemon)가 타입 안전하게 접근 가능. dead export가 아니라 정상적으로 참조되는 상태.

---

**작성일**: 2026-03-22 KST
**갱신일**: 2026-03-22 KST — v0.4.6 store 경계 분리 + v0.4.7 dead export 정리 반영. 도메인 5개(Policy/Approval/Journal/WdkStore/Crypto), Journal 도메인 신규 추가, Cron 제거, facade 메서드 확장
