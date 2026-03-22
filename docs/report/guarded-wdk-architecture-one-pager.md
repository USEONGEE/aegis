# guarded-wdk 아키텍처 One-Pager

> AI의 tx 요청을 정책으로 판정하고, 사람의 서명된 승인을 검증 후 도메인 작업을 수행하는 서명 엔진

---

## 개요

guarded-wdk는 WDK-APP 모노레포의 Layer 1 패키지로, `@tetherto/wdk` 위에 정책 기반 지갑 제어 레이어를 제공한다.
타입 의존성 그래프 기준 44 nodes, 94 edges, 12개 소스 파일로 구성.

---

## 도메인 Aggregate

### 1. 정책 (Policy)

> "온체인 tx의 실행 가능 여부를 규칙 기반으로 판정하는 체계"

Aggregate Root: `EvaluationResult` — `guarded-middleware.ts` (depth 4)
생애주기: Policy loaded → evaluate(tx) → ALLOW | REJECT

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
                        │              └─→ { [target]: { [selector]: Rule[] } }
                        │
                     Rule ──→ ArgCondition (d0) + Decision (d0)

  SignTransactionResult (output, d0)
```

| 타입 | 역할 | 설명 |
|------|------|------|
| `Decision` | enum | `'ALLOW' \| 'REJECT'` — 정책 판정 결과 |
| `ArgCondition` | value | tx calldata 인자에 대한 조건 (`EQ`, `GT`, `ONE_OF` 등 8종) |
| `Rule` | value | `order` + `args` 조건 + `valueLimit` + `decision` — 단일 규칙 |
| `PermissionDict` | value | `target → selector → Rule[]` 3단계 딕셔너리 |
| `CallPolicy` | value | `type: 'call'` + `permissions: PermissionDict` — 컨트랙트 호출 정책 |
| `TimestampPolicy` | value | `type: 'timestamp'` + `validAfter/validUntil` — 시간 제약 정책 |
| `Policy` | enum | `CallPolicy \| TimestampPolicy` discriminated union |
| `FailedArg` | value | 매칭 실패한 인자 정보 (index, condition, expected vs actual) |
| `RuleFailure` | value | 실패한 Rule + 실패 인자 목록 |
| `EvaluationContext` | value | 평가 맥락 — 대상 target, selector, 적용된 규칙들, 실패 사유 |
| `EvaluationResult` | core | 최종 판정 — decision + matchedPermission + reason + context |
| `SignTransactionResult` | output | 서명 완료 tx — `signedTx` + `intentHash` + `requestId` |

### 2. 승인 (Approval)

> "사람이 Ed25519로 서명한, 도메인 작업 수행을 위한 인가 토큰"

Aggregate Root: `SignedApproval` — `approval-store.ts` (depth 1)
생애주기: Request created → Pending → Signed → 6-step Verified → Domain ops → History recorded

```
  ApprovalSubmitContext ──→ submitApproval() ──→ [SignedApproval]
   (input, d0)                (broker)             (core, d1)
   = tx                                               │
   | policy_approval                                  ├──→ ApprovalType (enum, d0)
   | policy_reject                                    ├──→ targetHash: string
   | device_revoke                                    ├──→ approver: publicKey
   | wallet_create                                    ├──→ sig: Ed25519 서명
   | wallet_delete                                    └──→ nonce + expiresAt

  ApprovalRequest (input, d1)
    └──→ PendingApprovalRequest (extends, d2) + walletName

  VerificationContext (input, d0)
    = { currentPolicyVersion, expectedTargetHash }

  ApprovalType = 'tx' | 'policy' | 'policy_reject'
               | 'device_revoke' | 'wallet_create' | 'wallet_delete'
```

| 타입 | 역할 | 설명 |
|------|------|------|
| `ApprovalType` | enum | 6종 승인 유형 |
| `SignedApproval` | core | 서명된 승인 — type, requestId, chainId, targetHash, approver, sig, nonce, expiresAt, policyVersion, content |
| `ApprovalRequest` | input | 승인 요청 — requestId, type, chainId, targetHash, accountIndex, content, createdAt |
| `PendingApprovalRequest` | value | ApprovalRequest + walletName — pending 상태로 store에 저장 |
| `ApprovalSubmitContext` | input | 6-variant DU — kind별 도메인 작업에 필요한 데이터 (policies, description 등) |
| `VerificationContext` | input | 검증 맥락 — currentPolicyVersion, expectedTargetHash |

### 3. 원장 (Ledger)

> "정책, 월렛, 서명자, 승인 이력 등 모든 영속 상태의 추상 저장소"

Aggregate Root: `ApprovalStore` — `approval-store.ts` (abstract class, max depth)
생애주기: init() → CRUD operations → dispose()

```
                        [ApprovalStore]  (port, abstract)
                             │
  ┌──────────────────────────┼──────────────────────────┐
  │            │             │            │             │
  ▼            ▼             ▼            ▼             ▼
MasterSeed  StoredWallet  StoredPolicy  StoredSigner  StoredCron
 (value)     (value)      (value, d1)    (value)      (value, d1)
                           extends                     extends
                          PolicyInput                 CronInput

  HistoryEntry (value, d2) → ApprovalType + HistoryAction + SignedApproval
  StoredJournal (value, d2) extends JournalInput → JournalStatus + txHash
  RejectionEntry (value, d0)
  PolicyVersionEntry (value, d0)

  Implementations: JsonApprovalStore, SqliteApprovalStore
```

| 타입 | 역할 | 설명 |
|------|------|------|
| `ApprovalStore` | port | 추상 클래스 — seed, wallet, policy, pending, history, signer, nonce, cron, journal, rejection, policyVersion |
| `MasterSeed` | value | HD 월렛 시드 — mnemonic + createdAt |
| `StoredWallet` | value | BIP-44 월렛 — accountIndex, name, address |
| `PolicyInput` → `StoredPolicy` | input/value | 정책 저장 — policies[] + signature + accountIndex, chainId, policyVersion |
| `StoredSigner` | value | Ed25519 서명자 — publicKey, name, registeredAt, revokedAt |
| `CronInput` → `StoredCron` | input/value | 반복 작업 — sessionId, interval, prompt |
| `JournalInput` → `StoredJournal` | input/value | tx 실행 저널 — intentHash, status, txHash |
| `JournalStatus` | enum | `'received' \| 'settled' \| 'signed' \| 'failed' \| 'rejected'` |
| `HistoryEntry` | value | 승인 이력 — type, action(approved/rejected), signedApproval 포함 |
| `RejectionEntry` | value | 정책 거부 이력 — reason, context, policyVersion |
| `PolicyVersionEntry` | value | 정책 버전 이력 — version, description, diff |

### 4. 암호 (Crypto)

> "Ed25519 키 생성, 서명, 검증 프리미티브"

Aggregate Root: `verify` — `crypto-utils.ts` (function)
생애주기: 정적 (상태 없음)

```
  generateKeyPair() ──→ KeyPair (value)
  message + secretKey ──→ sign() ──→ sig
  message + sig + publicKey ──→ verify() → boolean
```

| 타입 | 역할 | 설명 |
|------|------|------|
| `KeyPair` | value | publicKey + secretKey (hex string) |
| `verify()` | function | tweetnacl Ed25519 서명 검증 |
| `sign()` | function | tweetnacl Ed25519 서명 생성 |
| `generateKeyPair()` | function | Ed25519 키쌍 생성 |

---

## 도메인 관계 맵

```
  ┌────────┐                  ┌────────┐
  │ Policy │                  │Approval│
  │  정책   │                  │  승인   │
  └───┬────┘                  └───┬────┘
      │                           │
      │  loadPolicy()             │  verifyApproval()
      │                           │  submitApproval()
      ▼                           ▼
  ┌────────┐                  ┌────────┐
  │ Ledger │◄────────────────│ Crypto │
  │  원장   │  verify(sig)    │  암호   │
  └────────┘                  └────────┘
```

- **Policy → Ledger** : 정책 평가 시 `loadPolicy()`로 현재 정책을 로드한다 (소비)
- **Approval → Ledger** : 승인 처리 시 pending/history/signer/policy 등 CRUD를 수행한다 (소비+전이)
- **Approval → Crypto** : 6-step 검증에서 `verify()`로 Ed25519 서명을 검증한다 (소비)
- **Approval → Policy** : policy_approval 승인 시 정책을 저장한다 (전이: 정책 변경)

---

## 기능 축

```
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │  1. 정책 평가     │  │  2. 승인 처리     │  │  3. 보호 조립     │
  │"tx를 허용하는가?" │  │"서명이 유효한가?" │  │"WDK를 어떻게     │
  │ [Policy+Ledger]  │  │[Approval+Crypto  │  │ 안전하게 감싸나?" │
  │                  │  │    +Ledger]       │  │[Policy+Approval  │
  │                  │  │                   │  │    +Ledger]       │
  └────────┬─────────┘  └────────┬──────────┘  └────────┬─────────┘
           │                     │                      │
           ▼                     ▼                      ▼
     ALLOW/REJECT           Events emitted        GuardedWDKFacade
```

### 축 1. 정책 평가 (Policy Evaluation)

> "AI가 보낸 tx를 현재 정책으로 허용해도 되는가?"

```
  Transaction ──→ policyResolver(chainId) ──→ evaluatePolicy() ──→ Decision
      │              │                           │
      │              └─ store.loadPolicy()        ├─ ALLOW → rawSend()
      │                 + validatePolicies()      └─ REJECT → throw
      │                                              PolicyRejectionError
      ├─ TimestampPolicy 먼저 체크 (시간 범위)
      └─ CallPolicy 매칭: target → selector → Rule[] → order 순 평가
```

매칭 로직: exactTarget[exactSelector] → exactTarget[*] → wildTarget[exactSelector] → wildTarget[*] → order 순 정렬 → args 조건 + valueLimit 검사 → 첫 매칭 Rule의 decision 반환

| 컴포넌트 | 위치 | 도메인 | 역할 | 설명 |
|----------|------|--------|------|------|
| `evaluatePolicy()` | `guarded-middleware.ts:221` | Policy | function | Policy[] + chainId + tx → EvaluationResult |
| `matchCondition()` | `guarded-middleware.ts:182` | Policy | function | 8종 비교 연산, BigInt 지원 |
| `matchArgs()` | `guarded-middleware.ts:205` | Policy | function | calldata offset 기반 인자 추출 → ArgCondition 매칭 |
| `validatePolicies()` | `guarded-middleware.ts:156` | Policy | function | Policy[] 구조 검증 |
| `permissionsToDict()` | `guarded-middleware.ts:165` | Policy | function | Permission 배열 → PermissionDict 변환 |

### 축 2. 승인 처리 (Approval Processing)

> "사람의 서명된 승인이 유효하면, 어떤 도메인 작업을 수행하는가?"

```
  SignedApproval + ApprovalSubmitContext
      │
      ▼
  verifyApproval() ── 6-step 검증 ──
      │  1. approver ∈ trustedApprovers?
      │  2. approver not revoked?
      │  3. Ed25519 sig verify (crypto)
      │  4. expiresAt > now?
      │  5. nonce > lastNonce? (replay 방지)
      │  6. type별 targetHash/policyVersion 검증
      │
      ▼ (실패 시 → emit ApprovalFailed + throw)
  submitApproval() ── 도메인 작업 (type별 switch) ──
      │
      ├─ policy       → savePolicy() + removePending → PolicyApplied
      ├─ policy_reject→ removePending → ApprovalRejected
      ├─ device_revoke→ revokeSigner() + setTrusted → SignerRevoked
      ├─ wallet_create→ createWallet() + removePending → WalletCreated
      └─ wallet_delete→ deleteWallet() + removePending → WalletDeleted
      │
      ▼
  appendHistory() → emit ApprovalVerified → emit domain events
```

원자성: 도메인 처리 완료 후 best-effort emit. 리스너 예외는 삼킴.

| 컴포넌트 | 위치 | 도메인 | 역할 | 설명 |
|----------|------|--------|------|------|
| `SignedApprovalBroker` | `signed-approval-broker.ts:40` | Approval | core | 승인 생명주기 — createRequest, submitApproval, getPendingApprovals |
| `verifyApproval()` | `approval-verifier.ts:32` | Approval | function | 6단계 검증 — trust → revoke → sig → expiry → nonce → type-specific |
| `computeApprovalHash()` | `approval-verifier.ts:21` | Approval | function | sig 제외 필드 → canonicalJSON → SHA-256 |
| `ApprovalSubmitContext` | `signed-approval-broker.ts:29` | Approval | input | 6-variant DU, No Optional 원칙 적용 |

### 축 3. 보호 조립 (Guard Assembly)

> "WDK account를 어떻게 감싸서 AI에게 안전하게 노출하는가?"

```
  GuardedWDKConfig ──→ createGuardedWDK() ──→ GuardedWDKFacade
                           │                       │
                           │ 1. new WDK(seed)      ├─ getAccount()
                           │ 2. new EventEmitter   ├─ getApprovalBroker()
                           │ 3. store.init()       ├─ getApprovalStore()
                           │ 4. new Broker         ├─ on()/off()
                           │ 5. registerWallet     └─ dispose()
                           │ 6. registerProtocol
                           │ 7. registerMiddleware
                           │    (createGuardedMiddleware)
                           ▼
                     GuardedAccount (래핑된 account)
                       ├─ sendTransaction → 정책 평가 → rawSend
                       ├─ transfer → ERC-20 변환 → 정책 평가 → rawTransfer
                       ├─ signTransaction → 정책 평가 → rawSign
                       ├─ sign → ForbiddenError (차단)
                       ├─ signTypedData → ForbiddenError (차단)
                       ├─ dispose → ForbiddenError (차단)
                       └─ keyPair → ForbiddenError (getter 차단)
```

단일 emitter: factory가 생성 → broker + middleware 공유

| 컴포넌트 | 위치 | 도메인 | 역할 | 설명 |
|----------|------|--------|------|------|
| `createGuardedWDK()` | `guarded-wdk-factory.ts:44` | All | function | WDK + emitter + broker + middleware 조립 → GuardedWDKFacade |
| `createGuardedMiddleware()` | `guarded-middleware.ts:327` | Policy | function | account 래핑 — tx 메서드에 정책 삽입, 위험 메서드 차단 |
| `GuardedAccount` | `guarded-middleware.ts:70` | Policy | port | 래핑된 account 인터페이스 |
| `pollReceipt()` | `guarded-middleware.ts:305` | Policy | function | tx broadcast 후 60초간 receipt 폴링 → ExecutionSettled |

---

## 시나리오

```
  createGuardedWDK() → [보호 조립] → GuardedWDKFacade
                                        │
                    ┌───────────────────┤
                    ▼                   ▼
  AI tx 요청 → [정책 평가] → ALLOW    사람 서명 → [승인 처리] → domain ops
                    │                                    │
                    └────── Ledger (store) ──────────────┘
```

**시나리오 1: AI가 DeFi tx를 실행 (happy path)**

AI가 `GuardedAccount.sendTransaction({ to, data, value })` 호출
  → [보호 조립] middleware가 가로챔
  → [정책 평가] `policyResolver(chainId)` → `evaluatePolicy()` → ALLOW (Policy: loaded → evaluated)
  → `rawSendTransaction()` → `{ hash, fee }`
  → emit IntentProposed → PolicyEvaluated → ExecutionBroadcasted
  → `pollReceipt()` → ExecutionSettled (Ledger: journal updated)

**시나리오 2: 사람이 정책을 변경**

Daemon이 `broker.createRequest('policy', opts)` → PendingPolicyRequested emit
  → App이 사용자에게 표시 → 사용자가 Ed25519로 서명
  → [승인 처리] `broker.submitApproval(signedApproval, { kind: 'policy_approval', policies, description })`
  → `verifyApproval()` 6-step 통과 (Approval: pending → verified)
  → `savePolicy()` + `removePending()` + `appendHistory()` (Ledger: policy updated, history created)
  → emit ApprovalVerified → PolicyApplied

**시나리오 3: 정책 위반 tx 거부 (unhappy path)**

AI가 `GuardedAccount.sendTransaction(tx)` 호출
  → [정책 평가] `evaluatePolicy()` → REJECT (Policy: evaluated → rejected)
  → emit IntentProposed → PolicyEvaluated(REJECT)
  → throw `PolicyRejectionError(reason, context)`
  → context에 target, selector, effectiveRules, ruleFailures 포함 — AI가 왜 거부됐는지 진단 가능

---

## 설계 분석 메모

### verifyApproval() 6-step 검증 파이프라인

`approval-verifier.ts:32-106`. 순서: "누가 → 진짜 서명했나 → 유효한가 → 맞는 대상인가"

| Step | 검증 내용 | 실패 시 | 목적 |
|------|----------|---------|------|
| 1 | `approver ∈ trustedApprovers` | `UntrustedApproverError` | 사전 등록된 서명자만 허용 |
| 2 | `store.isSignerRevoked(approver)` | `SignerRevokedError` | 해지된 서명자 거부 |
| 3 | `verify(canonicalHash, sig, approver)` | `SignatureError` | Ed25519 서명 위조 방지 |
| 4 | `expiresAt > now` | `ApprovalExpiredError` | 캡처된 승인 무기한 재사용 방지 |
| 5 | `nonce > lastNonce` | `ReplayError` | 동일 서명 중복 제출 방지 |
| 6 | type별 `targetHash`/`policyVersion` 비교 | `SignatureError` | 승인 대상 일치 확인 |

Step 1~5는 모든 ApprovalType에 공통. Step 6만 type별 분기.

### VerificationContext 간접층 문제

현재 흐름:
```
daemon → ApprovalSubmitContext → broker → VerificationContext 변환 → verifyApproval()
```

문제점:
1. `currentPolicyVersion`이 **항상 null** — dead 필드
2. `expectedTargetHash`가 null이면 스킵 — 사실상 optional 패턴 (No Optional 원칙 위반)
3. `verifyApproval()`의 Step 6이 type별 switch를 하는데, `ApprovalSubmitContext`가 이미 kind별 데이터를 갖고 있음 — 같은 분기를 두 곳에서 수행
4. `verifyApproval()`의 외부 사용자가 **없음** — broker 전용

개선 방향: `VerificationContext` 제거, `verifyApproval()`이 `ApprovalSubmitContext`를 직접 받으면 변환 코드 제거 + kind narrowing으로 null 체크 불필요.

단, Step 1~5가 전 타입 공통이므로 OOP 구현체 분리(strategy)는 과잉 — DU + switch가 이 규모에서 더 단순.

### Dead Export 타입 gap 패턴

`FailedArg`, `RuleFailure`는 dead-exports 체크에 잡히지만 **런타임에서는 사용 중**:
```
matchArgs() → FailedArg[] 생성
  → evaluatePolicy() → RuleFailure[] 수집 → EvaluationContext에 담김
    → PolicyRejectionError(reason, context: unknown) → daemon이 catch
```

소비자(daemon)가 `context: unknown`으로 받아서 타입을 import하지 않을 뿐. export 제거하면 나중에 타입 좁히기가 불가능해짐.

이 패턴("런타임 사용 O, 타입 import X")이 126건 dead export 중 얼마나 되는지가 dead-exports 분류 작업의 핵심.
→ 분류 작업 위임서: `docs/handover/dead-exports-triage.md`

---

**작성일**: 2026-03-22 KST
**갱신일**: 2026-03-22 KST — 설계 분석 메모 추가 (verifyApproval 6-step, VerificationContext 문제, dead export 타입 gap)
