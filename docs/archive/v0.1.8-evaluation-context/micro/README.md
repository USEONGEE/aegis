# 작업 티켓 - v0.1.8

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | 타입 정의 + matchArgs | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | evaluatePolicy + errors + 이벤트 | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | 테스트 수정 + daemon 전달 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02 → 03
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| EvaluationResult에 context 추가 | Step 01 (타입), Step 02 (evaluatePolicy) | ✅ |
| effective rules 포함 | Step 02 (candidates 수집) | ✅ |
| 실패 원인 (ruleFailures) 포함 | Step 01 (matchArgs), Step 02 (ruleFailures 축적) | ✅ |
| ApprovalRequested 이벤트에 context 전달 | Step 02 (이벤트 payload) | ✅ |
| daemon AI-facing 반환에 context 포함 | Step 03 (tool-surface.ts) | ✅ |
| 조기 REJECT → context: null | Step 02 (evaluatePolicy) | ✅ |
| no matching permission REJECT → context 포함 | Step 02 (evaluatePolicy) | ✅ |
| AUTO → context: null | Step 02 (evaluatePolicy) | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1~F5 (타입 정의) | Step 01 | ✅ |
| F6~F9 (evaluatePolicy 동작) | 구현: Step 02, 검증: Step 03 | ✅ |
| F10~F11 (PolicyRejectionError) | Step 02 | ✅ |
| F12~F13 (이벤트 payload) | 구현: Step 02, 검증: Step 03 | ✅ |
| F14 (export) | Step 01 | ✅ |
| F15~F16 (daemon positive) | Step 03 | ✅ |
| F17~F20 (daemon negative) | Step 03 | ✅ |
| N1 (guarded-wdk 테스트) | Step 03 | ✅ |
| N2 (guarded-wdk typecheck) | Step 01, Step 02 | ✅ |
| N3 (daemon tsc) | Step 03 | ✅ |
| N4 (No Optional) | Step 01 | ✅ |
| E1~E6 (엣지케이스) | 구현: Step 01~02, 검증: Step 03 (테스트) | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| TD-1: EvaluationContext + FailedArg + RuleFailure | Step 01 | ✅ |
| TD-2: matchArgs 반환 변경 | Step 01 | ✅ |
| TD-3: evaluatePolicy context 수집 | Step 02 | ✅ |
| TD-4: PolicyRejectionError context | Step 02 | ✅ |
| TD-5: 이벤트 payload 확장 | Step 02 | ✅ |
| TD-6: daemon 전달 경로 | Step 03 | ✅ |
| TD-7: index.ts export | Step 01 | ✅ |

## Step 상세
- [Step 01: 타입 정의 + matchArgs](step-01-types-and-matchargs.md)
- [Step 02: evaluatePolicy + errors + 이벤트](step-02-evaluate-policy.md)
- [Step 03: 테스트 수정 + daemon 전달](step-03-tests-and-daemon.md)
