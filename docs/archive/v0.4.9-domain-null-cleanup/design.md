# 설계 - v0.4.9

## 변경 규모
**규모**: 일반 기능
**근거**: 5개 패키지에 걸친 타입 변경, 내부 API 시그니처 변경 (loadPendingApprovals, listCrons), DU 신규 도입

---

## 문제 요약
도메인 모델 타입의 `| null` ~43건이 "No Optional" + "DU over Optional" 원칙을 위반. null이 "전체", "미서명", "해당 없음" 등 도메인 개념을 표현하는 데 오용되고 있음.

> 상세: [README.md](README.md) 참조

## 접근법

8가지 null 패턴을 4가지 해소 전략으로 분류하여 9개 Step으로 단계 실행:

| 전략 | 적용 대상 | 건수 |
|------|----------|------|
| **삭제** | Dead field (항상 null) | ~3 |
| **기본값** | 생성 시점에 fallback 확정 가능 | ~6 |
| **Filter 객체** | 쿼리 파라미터의 positional null | ~6 |
| **DU 전환** | 도메인 의미가 2개 이상인 null | ~23 |

Relay Envelope ~5건은 v0.4.9 scope 외. v0.4.8에서 채널별 타입 분리가 이미 진행되었으므로 별도 후속 Phase로 분리.

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: 전부 DU 전환 | 일관성 극대화 | chainId 필터, walletName 등에 과도한 DU. 코드 복잡성 증가 | ❌ |
| B: 패턴별 최적 전략 | 각 null의 의미에 맞는 해소. 불필요한 추상화 없음 | 전략이 4가지로 분산 | ✅ |
| C: 빈 객체 기본값 (EMPTY_CONTEXT 등) | null 없이 가능 | empty object anti-pattern. Primitive First 위반 | ❌ |

**선택 이유**: B — null의 의미가 패턴마다 다르므로 일괄 DU보다 의미에 맞는 전략이 적합. dead field는 삭제, fallback이 이미 있는 건 기본값, 쿼리 파라미터는 filter 객체, 진짜 도메인 상태는 DU.

## 기술 결정

1. **DU discriminant**: `kind` 필드 사용 (기존 프로젝트 컨벤션 — `ApprovalSubmitContext.kind`)
2. **Filter 파라미터**: optional property 허용 (쿼리 조건은 도메인 모델이 아님. 기존 `HistoryQueryOpts`, `JournalQueryOpts` 패턴과 일관)
3. **DB Row 타입 유지**: `store-types.ts`의 null은 유지. Store 구현체에서 도메인 타입으로 변환
4. **exhaustiveness check**: 모든 DU switch에 `never` 가드 필수
5. **wire breaking change 허용**: 동시 배포 전제. protocol 타입 직접 변경

---

## 범위 / 비범위

**범위(In Scope)**:
- 도메인 모델 `| null` ~38건 (총 발견 ~43건 중 Relay Envelope ~5건 제외, Step 1~9)
- 관련 테스트 업데이트
- protocol wire 타입 변경 (동시 배포)

**비범위(Out of Scope)**:
- DB Row 타입 (`store-types.ts`) — DB 경계, null 유지
- Relay Envelope DU — v0.4.8에서 채널별 타입 분리 완료. 별도 후속 Phase로 분리 (v0.4.9 scope 외)
- CI 체크 (null 재도입 방지) — 별도 Phase
- App UI state (`useState<T | null>`) — React 패턴
- `ActivityEvent.chainId` — App UI 경계, 이벤트 타입별 유무가 결정적이나 App store 설계와 충돌

## 아키텍처 개요

### 핵심 DU 3종

**1. EvaluationResult (Step 6 — 최고 가치)**

```typescript
type EvaluationResult =
  | AllowResult
  | SimpleRejectResult
  | DetailedRejectResult

interface AllowResult {
  kind: 'allow'
  matchedPermission: Rule
}

interface SimpleRejectResult {
  kind: 'reject'
  reason: string
}

interface DetailedRejectResult {
  kind: 'reject_with_context'
  reason: string
  context: EvaluationContext
}
```

`context: EvaluationContext | null` + `matchedPermission: Rule | null` 동시 해소.
영향: guarded-middleware → errors → tool-surface → protocol/events → app

**2. ChainScope (Step 5)**

```typescript
type ChainScope =
  | { kind: 'specific'; chainId: number }
  | { kind: 'all' }
```

`CronInput.chainId`, `QueuedMessage.chainId` 등에 적용.
`HistoryEntry.chainId`는 항상 number이므로 DU 불필요 — null 제거만.

**3. SignerStatus (Step 7)**

```typescript
type SignerStatus =
  | { kind: 'active' }
  | { kind: 'revoked'; revokedAt: number }
```

`StoredSigner.revokedAt: number | null` 대체.

### Filter 객체 전환 (Step 3)

```typescript
// Before: positional null
loadPendingApprovals(accountIndex: number | null, type: string | null, chainId: number | null)
listCrons(accountIndex: number | null)

// After: filter object (기존 *QueryOpts 패턴과 일관)
loadPendingApprovals(filter: PendingApprovalFilter)
listCrons(filter: CronFilter)
```

### App ApprovalRequest DU (Step 8)

```typescript
type ApprovalRequest =
  | (ApprovalRequestBase & { type: 'tx' })
  | (ApprovalRequestBase & { type: 'policy' })
  | (ApprovalRequestBase & { type: 'policy_reject' })
  | (ApprovalRequestBase & { type: 'device_revoke'; targetPublicKey: string })
  | (ApprovalRequestBase & { type: 'wallet_create' })
  | (ApprovalRequestBase & { type: 'wallet_delete' })
```

`targetPublicKey: string | null` 제거. device_revoke에서만 필수.

## 테스트 전략

| 레벨 | 범위 |
|------|------|
| Unit | `evaluate-policy.test.ts` — 모든 DU variant 검증, `approval-broker.test.ts` — walletName 기본값, store 테스트 — null DB row 변환 |
| Integration | `integration.test.ts` — policy evaluation → rejection → event 경로 |
| Type-level | `tsc --noEmit` — 컴파일 타임 체크, `never` exhaustiveness guard |

## 리스크/오픈 이슈

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Step 6 (EvaluationResult DU)이 가장 큰 변경 | guarded-wdk 핵심 경로 + protocol wire | 독립 커밋, Step 1-5 후 진행 |
| protocol/events.ts wire 변경 | app 이벤트 소비 코드 수정 필요 | 동시 배포 전제, breaking 허용 |
| DB 기존 데이터의 null row | Store 읽기 시 변환 필요 | Store 구현에서 fallback 매핑 |
| Relay Envelope | v0.4.9 scope 외 | 별도 후속 Phase로 분리 |

---

## 구현 순서

```
Step 1: Dead field + VerificationContext DU [Very Low Risk]
  └ currentPolicyVersion 삭제, getStatus() 삭제
  └ expectedTargetHash: VerificationTarget DU 전환

Step 2: Default value conversions   [Low Risk]
  └ walletName, signer name → string, NullLogger

Step 3: Filter param consolidation  [Low Risk]
  └ loadPendingApprovals, listCrons → filter object

Step 4: History null removal        [Low Risk]
  └ signedApproval: always present, chainId: always number

Step 5: Cron ChainScope DU          [Medium Risk]
  └ CronInput, QueuedMessage → ChainScope

Step 6: EvaluationResult DU         [High Risk] ← 최고 가치
  └ context + matchedPermission 동시 해소

Step 7: Signer Status DU            [Medium Risk] (depends on Step 2)
  └ revokedAt → SignerStatus

Step 8: App ApprovalRequest DU      [Low Risk]
  └ targetPublicKey → device_revoke 전용

Step 9: Tool result null cleanup    [Medium Risk]
  └ hash, fee, signedTx → non-null

```

의존성: Step 7만 Step 2에 의존 (StoredSigner.name이 먼저 non-null이어야 함). 나머지 모두 독립.
권장: 1-4 (warm-up) → 5 → 6 (핵심) → 7-9

Relay Envelope DU는 v0.4.9 scope 외. 별도 후속 Phase에서 처리.

---

## 주요 계약 변경 (Before/After)

### 1. VerificationContext (Step 1)

```typescript
// BEFORE
interface VerificationContext {
  currentPolicyVersion: number | null   // dead field
  expectedTargetHash: string | null     // null = skip
}

// AFTER
type VerificationTarget =
  | { kind: 'verify_hash'; expectedTargetHash: string }
  | { kind: 'skip_hash' }
```

### 2. loadPendingApprovals (Step 3)

```typescript
// BEFORE
loadPendingApprovals(accountIndex: number | null, type: string | null, chainId: number | null)

// AFTER
interface PendingApprovalFilter { accountIndex?: number; type?: ApprovalType; chainId?: number }
loadPendingApprovals(filter: PendingApprovalFilter)
```

### 3. EvaluationResult (Step 6)

```typescript
// BEFORE
interface EvaluationResult {
  decision: Decision
  matchedPermission: Rule | null
  reason: string
  context: EvaluationContext | null
}

// AFTER
type EvaluationResult = AllowResult | SimpleRejectResult | DetailedRejectResult
// kind: 'allow' → matchedPermission 필수
// kind: 'reject' → reason만
// kind: 'reject_with_context' → reason + context 필수
```

### 4. StoredSigner (Step 2 + 7)

```typescript
// BEFORE
interface StoredSigner {
  name: string | null; revokedAt: number | null
}

// AFTER
interface StoredSigner {
  name: string; status: SignerStatus  // { kind: 'active' } | { kind: 'revoked'; revokedAt: number }
}
```

### 5. HistoryEntry (Step 4)

```typescript
// BEFORE
interface HistoryEntry {
  chainId: number | null
  signedApproval: SignedApproval | null
}

// AFTER (null path 없음 — 타입만 변경)
interface HistoryEntry {
  chainId: number              // signedApproval.chainId에서 항상 유래
  signedApproval: SignedApproval
}
```

Legacy null DB row 처리: `signedApproval`에서 `chainId` 복원. 복원 불가 row는 assert로 감지 (bogus sentinel 사용하지 않음).

> 상세 리팩토링 계획: [refactoring plan](../../refactoring/domain-null-removal-refactor-plan-2026-03-22.md) 참조
