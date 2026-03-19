# DoD (Definition of Done) - v0.1.8

## 기능 완료 조건

### guarded-wdk 타입 정의

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `EvaluationResult`에 `context: EvaluationContext \| null` 필드가 존재 | `grep -A4 'interface EvaluationResult' packages/guarded-wdk/src/guarded-middleware.ts` → context 필드 확인 |
| F2 | `EvaluationContext` 인터페이스에 `target`, `selector`, `effectiveRules`, `ruleFailures` 필드가 모두 존재하고 optional(`?:`) 없음 | `grep -A5 'interface EvaluationContext' packages/guarded-wdk/src/guarded-middleware.ts` |
| F3 | `RuleFailure` 인터페이스에 `rule`, `failedArgs` 필드가 존재하고 optional 없음 | `grep -A3 'interface RuleFailure' packages/guarded-wdk/src/guarded-middleware.ts` |
| F4 | `FailedArg` 인터페이스에 `argIndex`, `condition`, `expected`, `actual` 필드가 존재하고 optional 없음 | `grep -A5 'interface FailedArg' packages/guarded-wdk/src/guarded-middleware.ts` |
| F5 | `matchArgs()`가 `FailedArg[]`를 반환 (boolean이 아님) | `grep 'function matchArgs' packages/guarded-wdk/src/guarded-middleware.ts` → `: FailedArg[]` 확인 |

### guarded-wdk evaluatePolicy 동작

| # | 조건 | 검증 방법 |
|---|------|----------|
| F6 | 조기 REJECT 6곳 모두 `context: null` 반환 | evaluate-policy.test.ts: 각 조기 REJECT 케이스(no policies, too early, expired, no call policy, missing tx.to, missing tx.data)에서 `expect(result.context).toBeNull()` |
| F7 | REQUIRE_APPROVAL 매칭 시 context에 `effectiveRules` (Rule[]) 와 `ruleFailures` (RuleFailure[]) 포함 | evaluate-policy.test.ts: REQUIRE_APPROVAL 테스트에서 context 필드 검증 |
| F8 | AUTO 매칭 시 `context: null` | evaluate-policy.test.ts: AUTO 테스트에서 `expect(result.context).toBeNull()` |
| F9 | `no matching permission` REJECT 시 candidates > 0이면 context 포함, ruleFailures에 모든 스킵된 rule의 실패 상세 존재 | evaluate-policy.test.ts: REJECT 테스트에서 `ruleFailures.length` 와 내용 검증 |

### guarded-wdk 이벤트/에러

| # | 조건 | 검증 방법 |
|---|------|----------|
| F10 | `PolicyRejectionError`에 `context` 속성 존재하고 constructor가 `(reason, context)` 형태 | `grep -A4 'class PolicyRejectionError' packages/guarded-wdk/src/errors.ts` |
| F11 | middleware의 `throw PolicyRejectionError` 3곳 모두 2인자(reason, context) 전달 | `grep -n 'PolicyRejectionError(reason' packages/guarded-wdk/src/guarded-middleware.ts` → 3건, 모두 `, context)` |
| F12 | `PolicyEvaluated` 이벤트 payload에 `context` 포함 (3곳: sendTransaction, transfer, signTransaction) | integration.test.ts: sendTransaction AUTO 경로에서 `PolicyEvaluated.context === null` 검증 + 코드 리뷰: 3곳 emit 동일 패턴 `grep -c 'context,' packages/guarded-wdk/src/guarded-middleware.ts` |
| F13 | `ApprovalRequested` 이벤트 payload에 `context` 포함 (3곳: sendTransaction, transfer, signTransaction) | integration.test.ts: sendTransaction/signTransaction REQUIRE_APPROVAL에서 `ApprovalRequested.context !== null` 검증. transfer 경로는 코드 리뷰 (WDK token mock 불가) + grep 확인: `grep 'context.*timestamp' packages/guarded-wdk/src/guarded-middleware.ts` |

### guarded-wdk export

| # | 조건 | 검증 방법 |
|---|------|----------|
| F14 | `index.ts`에서 `EvaluationContext`, `FailedArg`, `RuleFailure` export | `grep -E 'EvaluationContext\|FailedArg\|RuleFailure' packages/guarded-wdk/src/index.ts` |

### daemon 전달 경로 (positive contract)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F15 | `pending_approval` 반환 시 `context` 필드가 포함됨 | 코드 리뷰: pending_approval 반환 3곳 모두 `context: result.evt?.context ?? null` 패턴 확인 + rejected 경로의 context shape 테스트가 동일 pass-through 패턴을 간접 증명 |
| F16 | `rejected` 반환 시 `context` 필드가 EvaluationContext 구조로 포함됨 | tool-surface.test.ts: "rejected returns context from PolicyRejectionError" 테스트에서 context shape 검증 (`objectContaining({ target, selector, effectiveRules, ruleFailures })`) |

### daemon 전달 경로 (negative contract)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F17 | `executed` 반환에 `context` 필드 없음 | tool-surface.test.ts: 기존 "executed for AUTO" 테스트에 `expect(result).not.toHaveProperty('context')` 추가 |
| F18 | `signed` 반환에 `context` 필드 없음 | tool-surface.test.ts: 기존 "signed for AUTO" 테스트에 `expect(result).not.toHaveProperty('context')` 추가 |
| F19 | `error` 반환에 `context` 필드 없음 | tool-surface.test.ts: 기존 error 테스트에 `expect(result).not.toHaveProperty('context')` 추가 |
| F20 | `approval_timeout` 반환에 `context` 필드 없음 | tool-surface.test.ts: approval_timeout 테스트 추가 후 `expect(result).not.toHaveProperty('context')` 검증 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk 테스트 전부 pass | `npm --prefix packages/guarded-wdk test` |
| N2 | guarded-wdk 타입 체크 에러 0 | `npm --prefix packages/guarded-wdk run typecheck` |
| N3 | daemon tsc 에러 0 | `npx tsc --noEmit -p packages/daemon/tsconfig.json` |
| N4 | EvaluationContext, RuleFailure, FailedArg 내부에 optional 필드(`?:`) 없음 | `grep -A15 'interface EvaluationContext\|interface RuleFailure\|interface FailedArg' packages/guarded-wdk/src/guarded-middleware.ts` → `?:` 없음 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | candidates 빈 배열 + `no matching permission` | `context: null` (effectiveRules 빈 배열은 무의미하므로 null) | evaluate-policy.test.ts: `expect(result.context).toBeNull()` |
| E2 | 모든 candidates가 args 실패로 스킵 | `ruleFailures.length === candidates.length`, 각 `ruleFailure.failedArgs.length > 0` | evaluate-policy.test.ts |
| E3 | candidates 중 일부는 args 실패, 일부는 valueLimit 초과 | args 실패 rule: `failedArgs.length > 0`, valueLimit 초과 rule: `failedArgs.length === 0` | evaluate-policy.test.ts |
| E4 | REQUIRE_APPROVAL rule 앞에 AUTO rule이 args 실패로 스킵됨 | REQUIRE_APPROVAL context의 `ruleFailures`에 앞선 AUTO 실패 포함, `ruleFailures.length >= 1` | evaluate-policy.test.ts |
| E5 | `extractArg()` null (calldata 길이 부족) | `FailedArg.actual === 'null'` (sentinel 문자열) | matchArgs 단위 테스트: `expect(failures[0].actual).toBe('null')` |
| E6 | wildcard target + wildcard selector 규칙이 candidates에 포함 | `effectiveRules`에 wildcard 규칙 포함, `effectiveRules.length`가 정확히 expected 수 | evaluate-policy.test.ts: wildcard 케이스 |
