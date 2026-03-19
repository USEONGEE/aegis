# Step 01: 타입 정의 + matchArgs 반환 변경

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

### TD-1: 타입 정의
- `FailedArg` interface 추가 (argIndex, condition, expected, actual)
- `RuleFailure` interface 추가 (rule, failedArgs)
- `EvaluationContext` interface 추가 (target, selector, effectiveRules, ruleFailures)
- `EvaluationResult`에 `context: EvaluationContext | null` 필드 추가

### TD-2: matchArgs 반환 변경
- `matchArgs()` 반환 타입을 `boolean` → `FailedArg[]`로 변경
- 실패 시 FailedArg 객체를 배열에 push, 성공 시 빈 배열 반환
- extractArg null 시 `actual: 'null'` sentinel 문자열

### TD-7: index.ts export
- `EvaluationContext`, `FailedArg`, `RuleFailure` export 추가

## 2. 완료 조건 (이 step 내에서 검증 가능)
- [ ] F1: EvaluationResult에 context 필드 존재 (grep)
- [ ] F2: EvaluationContext에 4개 필드 모두 존재, optional 없음 (grep)
- [ ] F3: RuleFailure에 2개 필드 존재, optional 없음 (grep)
- [ ] F4: FailedArg에 4개 필드 존재, optional 없음 (grep)
- [ ] F5: matchArgs()가 FailedArg[] 반환 (grep)
- [ ] F14: index.ts에서 3개 타입 export (grep)
- [ ] N2: guarded-wdk typecheck 통과 (`npm --prefix packages/guarded-wdk run typecheck`)

> E5 (extractArg null sentinel)는 Step 03의 테스트에서 검증

## 3. 롤백 방법
- git revert: 이 step의 커밋 revert
- 영향 범위: guarded-middleware.ts, index.ts만

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── guarded-middleware.ts  # 수정 - FailedArg, RuleFailure, EvaluationContext 추가, EvaluationResult 확장, matchArgs 변경
└── index.ts               # 수정 - export 추가
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| guarded-middleware.ts | 직접 수정 | 타입 + matchArgs |
| index.ts | 직접 수정 | export 추가 |
| evaluate-policy.test.ts | 간접 영향 | matchArgs boolean → FailedArg[] 변경으로 evaluatePolicy 내부 동작 변경. 테스트는 Step 03에서 수정. |

### Side Effect 위험
- matchArgs 반환 변경으로 evaluatePolicy의 매칭 루프가 compile error 발생 → Step 02에서 해결

### 참고할 기존 패턴
- `packages/guarded-wdk/src/guarded-middleware.ts`: 기존 ArgCondition, Rule 인터페이스 패턴

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| guarded-middleware.ts | TD-1 타입 정의 + TD-2 matchArgs | ✅ OK |
| index.ts | TD-7 export | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 타입 정의 | ✅ guarded-middleware.ts | OK |
| matchArgs 변경 | ✅ guarded-middleware.ts | OK |
| export | ✅ index.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: evaluatePolicy context 수집](step-02-evaluate-policy.md)
