# 설계 - v0.1.8

## 변경 규모
**규모**: 일반 기능
**근거**: 2개 패키지(guarded-wdk, daemon) 수정, 내부 API 변경 (EvaluationResult 타입 확장, matchArgs 시그니처 변경, ApprovalRequested 이벤트 payload 확장, ToolResult 확장)

---

## 문제 요약
REQUIRE_APPROVAL 시 AI가 기존 정책 상태와 실패 원인을 모른다. EvaluationResult에 context를 추가하고 daemon까지 전달 경로를 확보한다.

> 상세: [README.md](README.md) 참조

## 접근법
- EvaluationResult에 `context: EvaluationContext | null` 필드 추가
- `matchArgs()`를 `FailedArg[]` 반환으로 변경하여 실패 상세 보존
- `evaluatePolicy()`에서 candidates(effective rules) + 모든 스킵된 rule의 실패 상세를 수집
- ApprovalRequested/PolicyEvaluated 이벤트에 context 포함
- PolicyRejectionError에 context 속성 추가하여 REJECT 경로도 daemon까지 전달
- daemon tool-surface.ts의 pending_approval/rejected 반환에 context 명시적 포함

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: EvaluationResult에 `context: T \| null` 추가 | 기존 시그니처 유지, 소비자 변경 최소, `matchedPermission: Rule \| null`과 동일 선례 | `T \| null`은 사실상 optional 의미이나 이미 존재하는 패턴 | ✅ |
| B: Discriminated Union | No Optional 원칙에 가장 충실, 컴파일 타임 안전성 | 소비자 3곳 대폭 수정, 과잉 설계 (REJECT도 결국 null 필요) | ❌ |
| C: Tuple 반환 (`{ result, context }`) | EvaluationResult 자체 미변경 | 시그니처 변경이 더 크고, 응집도 저하, Primitive First 위배 | ❌ |

**선택 이유**: A는 Primitive First(가장 단순한 변경), 기존 선례 준수(`matchedPermission: Rule | null`), 소비자 변경 최소(destructure에 `context` 하나 추가).

## 기술 결정

### TD-1: EvaluationContext + FailedArg + RuleFailure 타입

```typescript
// guarded-middleware.ts
export interface FailedArg {
  argIndex: string                        // matchArgs의 key (e.g. "0", "1")
  condition: string                       // ArgCondition.condition (e.g. "ONE_OF")
  expected: string | string[]             // ArgCondition.value
  actual: string                          // extractArg 결과
}

export interface RuleFailure {
  rule: Rule                              // 스킵된 rule
  failedArgs: FailedArg[]                 // 빈 배열 = args 통과, valueLimit 초과로 스킵
}

export interface EvaluationContext {
  target: string                          // tx.to (lowercase)
  selector: string                        // tx.data.slice(0, 10)
  effectiveRules: Rule[]                  // candidates (wildcard 포함, order 정렬)
  ruleFailures: RuleFailure[]             // 모든 스킵된 rule의 실패 상세
}
```

설계 근거:
- `effectiveRules`: evaluatePolicy()에서 수집하는 candidates 배열 그대로. AI가 "현재 어떤 규칙이 있는지" 파악.
- `ruleFailures`: **모든 스킵된 rule의 실패 상세를 보존**. 하나의 rule만 남기면 "가장 관련 있는 실패"가 임의적이므로, 정보 손실 없이 전체를 제공한다. 빈 배열 = 모든 rule이 매칭됨(REQUIRE_APPROVAL 성공 시 이전에 스킵된 rule이 없는 경우).
- `RuleFailure.failedArgs`: 빈 배열이면 args는 통과했지만 valueLimit 초과로 스킵된 것.
- No Optional: 모든 필드 required.
- HANDOVER의 `suggestion` 필드는 비목표 (PRD 명시). Raw data만.

### TD-2: matchArgs 반환 변경

**현재** (guarded-middleware.ts:193-201):
```typescript
function matchArgs (data: string, argConditions: Record<string, ArgCondition>): boolean
```

**변경 후**:
```typescript
function matchArgs (data: string, argConditions: Record<string, ArgCondition>): FailedArg[]
// 빈 배열 = 모두 통과
```

구현:
```typescript
function matchArgs (data: string, argConditions: Record<string, ArgCondition>): FailedArg[] {
  const failures: FailedArg[] = []
  for (const [indexStr, cond] of Object.entries(argConditions)) {
    const index = parseInt(indexStr, 10)
    const actual = extractArg(data, index)
    if (actual === null) {
      failures.push({ argIndex: indexStr, condition: cond.condition, expected: cond.value, actual: 'null' })
      continue
    }
    if (!matchCondition(cond.condition, actual, cond.value)) {
      failures.push({ argIndex: indexStr, condition: cond.condition, expected: cond.value, actual })
    }
  }
  return failures
}
```

### TD-3: evaluatePolicy context 수집

핵심 변경:
1. 반환 타입에 `context: EvaluationContext | null` 추가
2. 조기 REJECT 6곳: `context: null` (no policies, too early, expired, no call policy, missing tx.to, missing tx.data)
3. candidates 수집 후 매칭 루프에서 **모든 스킵된 rule의 실패 상세를 `ruleFailures` 배열에 축적**
4. REQUIRE_APPROVAL 매칭: context 포함 (effectiveRules = candidates, ruleFailures = 이전 스킵된 것들)
5. AUTO 매칭: context = null
6. `no matching permission` REJECT: candidates > 0이면 context 포함

```typescript
export function evaluatePolicy (chainPolicies: ChainPolicies, chainId: number, tx: Transaction): EvaluationResult {
  // 조기 REJECT 6곳: { ..., context: null }

  // candidates 수집 (기존과 동일)
  const candidates: Rule[] = [...]

  // 매칭 루프
  const ruleFailures: RuleFailure[] = []
  for (const rule of candidates) {
    const failures = rule.args ? matchArgs(tx.data, rule.args) : []
    if (failures.length > 0) {
      ruleFailures.push({ rule, failedArgs: failures })
      continue
    }
    if (rule.valueLimit !== undefined && BigInt(tx.value || 0) > BigInt(rule.valueLimit)) {
      ruleFailures.push({ rule, failedArgs: [] })   // valueLimit 초과
      continue
    }

    // 매칭 성공
    return {
      decision: rule.decision,
      matchedPermission: rule,
      reason: 'matched',
      context: rule.decision === 'REQUIRE_APPROVAL'
        ? { target: txTo, selector: txSelector, effectiveRules: candidates, ruleFailures }
        : null   // AUTO → context 불필요
    }
  }

  // no matching permission
  return {
    decision: 'REJECT',
    matchedPermission: null,
    reason: 'no matching permission',
    context: candidates.length > 0
      ? { target: txTo, selector: txSelector, effectiveRules: candidates, ruleFailures }
      : null
  }
}
```

### TD-4: PolicyRejectionError에 context 추가

**현재** (errors.ts:8-12):
```typescript
export class PolicyRejectionError extends Error {
  constructor (reason?: string) {
    super(reason || 'Policy rejected the transaction.')
    this.name = 'PolicyRejectionError'
  }
}
```

**변경 후**:
```typescript
export class PolicyRejectionError extends Error {
  context: EvaluationContext | null
  constructor (reason: string, context: EvaluationContext | null) {
    super(reason || 'Policy rejected the transaction.')
    this.name = 'PolicyRejectionError'
    this.context = context
  }
}
```

middleware에서 throw 시 (3곳: line 335, 439, 530):
```typescript
// Before
throw new PolicyRejectionError(reason)

// After
throw new PolicyRejectionError(reason, context)
```

### TD-5: 이벤트 payload 확장

**PolicyEvaluated** (3곳: line 325, 429, 520):
```typescript
// Before
emitter.emit('PolicyEvaluated', {
  type: 'PolicyEvaluated', requestId, decision, matchedPermission, reason, timestamp: Date.now()
})

// After
emitter.emit('PolicyEvaluated', {
  type: 'PolicyEvaluated', requestId, decision, matchedPermission, reason, context, timestamp: Date.now()
})
```

**ApprovalRequested** (3곳: line 346, 450, 541):
```typescript
// Before
emitter.emit('ApprovalRequested', {
  type: 'ApprovalRequested', requestId, target, selector, targetHash, timestamp: Date.now()
})

// After
emitter.emit('ApprovalRequested', {
  type: 'ApprovalRequested', requestId, target, selector, targetHash, context, timestamp: Date.now()
})
```

### TD-6: Daemon tool-surface.ts 전달 경로

**ToolResult 확장**:
```typescript
export interface ToolResult {
  // ... 기존 필드들
  context?: unknown  // EvaluationContext | null
}
```

daemon은 현재 guarded-wdk의 타입을 import하지 않는 loose-coupling 구조. `context`는 `unknown`으로 pass-through.

**명시적 null 보장**: daemon 반환 시 항상 `context: ... ?? null`로 명시하여, 소비자가 `context` 부재(undefined)와 `context: null`을 구분할 필요 없도록 한다.

**pending_approval 반환** (3곳: line 355-359, 447, 662-666):
```typescript
// Before
return { status: 'pending_approval', requestId, intentHash: hash }

// After
return { status: 'pending_approval', requestId, intentHash: hash, context: result.evt?.context ?? null }
```

**rejected 반환** (3곳: line 361-363, 449-450, 669-671):
```typescript
// Before
return { status: 'rejected', reason: err.message, intentHash: hash }

// After
return { status: 'rejected', reason: err.message, intentHash: hash, context: err.context ?? null }
```

### TD-7: guarded-wdk index.ts export 추가

```typescript
export type { EvaluationContext, FailedArg, RuleFailure } from './guarded-middleware.js'
```

---

## API/인터페이스 계약

### EvaluationResult (guarded-wdk → 내부/daemon)

| 필드 | Before | After |
|------|--------|-------|
| decision | `Decision` | 변경 없음 |
| matchedPermission | `Rule \| null` | 변경 없음 |
| reason | `string` | 변경 없음 |
| context | - | `EvaluationContext \| null` (신규) |

### ApprovalRequested 이벤트 (guarded-wdk → daemon)

| 필드 | Before | After |
|------|--------|-------|
| type, requestId, target, selector, targetHash, timestamp | 기존 | 변경 없음 |
| context | - | `EvaluationContext` (신규, REQUIRE_APPROVAL이므로 항상 존재) |

### PolicyEvaluated 이벤트 (guarded-wdk → app/listeners)

| 필드 | Before | After |
|------|--------|-------|
| type, requestId, decision, matchedPermission, reason, timestamp | 기존 | 변경 없음 |
| context | - | `EvaluationContext \| null` (신규) |

### PolicyRejectionError (guarded-wdk → daemon catch)

| 필드 | Before | After |
|------|--------|-------|
| message, name | 기존 | 변경 없음 |
| context | - | `EvaluationContext \| null` (신규) |

### ToolResult (daemon → AI)

| 필드 | Before | After |
|------|--------|-------|
| status, requestId, intentHash, reason, ... | 기존 | 변경 없음 |
| context | - | `unknown` (신규, 실제론 `EvaluationContext \| null`) |

**반환값에 context가 포함되는 status**:
- `pending_approval`: `context ?? null`
- `rejected`: `context ?? null`
- `executed`, `signed`, `error`, `approval_timeout`: context 없음 (기존 패턴 유지)

---

## 범위 / 비범위

### 범위 (In Scope)
- `EvaluationContext`, `FailedArg`, `RuleFailure` 타입 정의
- `matchArgs` 반환 타입 변경 (boolean → FailedArg[])
- `evaluatePolicy` context 수집 + 반환
- `PolicyRejectionError` context 속성 추가
- `PolicyEvaluated`, `ApprovalRequested` 이벤트 payload 확장
- daemon `ToolResult` context 필드 추가 + 전달
- index.ts export 추가
- 기존 테스트 assertion에 context 검증 추가

### 비범위 (Out of Scope)
- suggestion 필드: daemon 레이어 책임 (Primitive First)
- AI 정책 수정 로직: 별도 Phase
- ToolResult의 구조적 리팩토링: 기존 loose bag 패턴 유지
- RN App 코드 변경: ActivityEvent.details가 `Record<string, unknown>`이므로 변경 불필요

## 아키텍처 개요

```
evaluatePolicy()
  ├── 조기 REJECT: context = null
  ├── candidates 수집 (wildcard 포함)
  ├── matchArgs() → FailedArg[] (실패 상세 보존)
  ├── ruleFailures 축적 (모든 스킵된 rule)
  ├── 매칭 성공:
  │     ├── AUTO: context = null
  │     └── REQUIRE_APPROVAL: context = { effectiveRules, ruleFailures }
  └── no matching permission:
        └── context = { effectiveRules, ruleFailures }

전달 경로:
  evaluatePolicy() → context
    ├── PolicyEvaluated 이벤트 → context (app ActivityScreen 등)
    ├── REJECT → PolicyRejectionError.context → daemon catch → { status: 'rejected', context }
    └── REQUIRE_APPROVAL
          ├── ApprovalRequested 이벤트 → context → daemon Promise.race → { status: 'pending_approval', context }
          └── AI가 context를 보고 정책 수정 판단
```

## 데이터 흐름

```
1. evaluatePolicy(policies, chainId, tx)
   → EvaluationResult { decision, matchedPermission, reason, context }

2a. REQUIRE_APPROVAL:
   middleware → emit PolicyEvaluated { ..., context }
   middleware → emit ApprovalRequested { ..., context }
   daemon tool-surface: Promise.race → evt.context
   → return { status: 'pending_approval', requestId, context: evt.context ?? null }
   → AI receives context → 정책 수정 판단

2b. REJECT (no matching permission):
   middleware → emit PolicyEvaluated { ..., context }
   middleware → throw PolicyRejectionError(reason, context)
   daemon tool-surface: catch → err.context
   → return { status: 'rejected', reason, context: err.context ?? null }
   → AI receives context → 정책 수정 판단

2c. AUTO / 조기 REJECT:
   context = null → 기존 흐름 유지
```

## 테스트 전략

### 기존 테스트 수정
- `evaluate-policy.test.ts`: 모든 assertion에 `context` 필드 검증 추가
  - AUTO 케이스: `context: null`
  - REQUIRE_APPROVAL 케이스: `context.effectiveRules` 존재, `context.ruleFailures` 내용 검증
  - 조기 REJECT 케이스: `context: null`
  - `no matching permission` REJECT: `context.effectiveRules` 존재, `context.ruleFailures` 모든 실패 상세 검증
- `integration.test.ts`: ApprovalRequested 이벤트에 context 존재 검증

### matchArgs 단위 테스트 추가
- 빈 배열 반환 (모든 조건 통과)
- FailedArg 반환 (EQ 실패, ONE_OF 실패)
- extractArg null 케이스

### 검증 방법
1. `npm --prefix packages/guarded-wdk test` — 전체 테스트 pass
2. `npx tsc --noEmit -p packages/daemon/tsconfig.json` — 타입 에러 0

---

## 리스크/오픈 이슈

| 리스크 | 영향 | 완화 |
|--------|------|------|
| matchArgs 시그니처 변경 | evaluatePolicy 내부 로직 오류 가능 | 빈 배열/non-empty 분기를 명확히 테스트 |
| PolicyRejectionError constructor 변경 | 기존 throw 사이트가 context 없이 호출하면 undefined | 모든 throw 사이트를 명시적으로 수정 |
| candidates가 빈 배열일 때 context | no matching permission이지만 candidates 0 → context null | candidates.length > 0 체크로 처리 |
| daemon pass-through 타입 안전성 | context를 unknown으로 전달 | 기존 daemon loose-coupling 패턴 유지, `?? null`로 명시적 null 보장 |
| ruleFailures 배열 크기 | 많은 rule이 있으면 ruleFailures가 클 수 있음 | 현실적으로 대부분 정책에 rule 수가 적음 (10개 미만) |
