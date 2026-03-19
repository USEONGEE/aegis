# Step 02: evaluatePolicy context 수집 + PolicyRejectionError + 이벤트 확장

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 01 (타입 + matchArgs)

---

## 1. 구현 내용 (design.md 기반)

### TD-3: evaluatePolicy context 수집
- 매칭 루프에서 `ruleFailures: RuleFailure[]` 축적
- 조기 REJECT 6곳에 `context: null` 추가
- REQUIRE_APPROVAL 매칭 시 context 포함
- AUTO 매칭 시 `context: null`
- `no matching permission` REJECT 시 candidates > 0이면 context 포함
- matchArgs 호출부: `boolean` → `FailedArg[]` 분기로 변경

### TD-4: PolicyRejectionError에 context 추가
- errors.ts: constructor에 context 파라미터 추가, this.context 속성 추가
- middleware의 throw 3곳 (sendTransaction:335, transfer:439, signTransaction:530) 수정

### TD-5: 이벤트 payload 확장
- PolicyEvaluated emit 3곳에 context 추가
- ApprovalRequested emit 3곳에 context 추가
- evaluatePolicy 결과에서 context를 destructure하여 이벤트/throw에 전달

## 2. 완료 조건 (이 step 내에서 검증 가능)
- [ ] F10: PolicyRejectionError에 context 속성 존재 (grep errors.ts)
- [ ] F11: throw 3곳 모두 2인자 (grep guarded-middleware.ts)
- [ ] evaluatePolicy의 조기 REJECT 반환에 `context: null` 코드 존재 (grep)
- [ ] PolicyEvaluated emit에 context 포함 코드 존재 (grep)
- [ ] ApprovalRequested emit에 context 포함 코드 존재 (grep)
- [ ] N2: guarded-wdk typecheck 통과 (`npm --prefix packages/guarded-wdk run typecheck`)

> F6~F9, F12, F13의 동작 검증은 Step 03의 테스트에서 수행

## 3. 롤백 방법
- git revert: 이 step의 커밋 revert
- 영향 범위: guarded-middleware.ts, errors.ts

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── guarded-middleware.ts  # 수정 - evaluatePolicy context 수집, 이벤트 payload, throw 수정
└── errors.ts              # 수정 - PolicyRejectionError constructor 변경
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| guarded-middleware.ts | 직접 수정 | 핵심 변경: evaluatePolicy + 이벤트 + throw |
| errors.ts | 직접 수정 | PolicyRejectionError constructor |
| integration.test.ts | 간접 영향 | 이벤트 payload 변경 → Step 03에서 테스트 수정 |
| tool-surface.ts (daemon) | 간접 영향 | throw/이벤트 변경 → Step 03에서 daemon 수정 |

### Side Effect 위험
- PolicyRejectionError constructor 변경으로 기존 throw 사이트가 인자 불일치 → 이 Step에서 모든 throw 사이트 동시 수정
- evaluatePolicy의 조기 REJECT 반환에 context: null 추가로 반환 shape 변경 → 기존 destructure에 영향 없음 (추가 필드는 무시됨)

### 참고할 기존 패턴
- `guarded-middleware.ts:323`: `const { decision, matchedPermission, reason } = evaluatePolicy(...)` → `const { decision, matchedPermission, reason, context } = ...`

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| guarded-middleware.ts | TD-3 + TD-5 | ✅ OK |
| errors.ts | TD-4 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| evaluatePolicy context | ✅ guarded-middleware.ts | OK |
| PolicyRejectionError | ✅ errors.ts | OK |
| 이벤트 payload | ✅ guarded-middleware.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 03: 테스트 수정 + daemon 전달](step-03-tests-and-daemon.md)
