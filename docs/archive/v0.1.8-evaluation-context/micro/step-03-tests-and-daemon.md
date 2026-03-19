# Step 03: 테스트 수정 + daemon 전달 경로

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 02 (evaluatePolicy + errors + 이벤트)

---

## 1. 구현 내용 (design.md 기반)

### guarded-wdk 테스트 수정
- evaluate-policy.test.ts: 모든 기존 assertion에 context 필드 검증 추가
  - AUTO: context: null
  - REQUIRE_APPROVAL: context.effectiveRules, context.ruleFailures 검증
  - 조기 REJECT 6종: context: null
  - no matching permission: context.effectiveRules, context.ruleFailures 상세 검증
- evaluate-policy.test.ts: 엣지케이스 테스트 추가 (E1~E6)
- matchArgs 단위 테스트 추가: FailedArg 반환 검증
- integration.test.ts: ApprovalRequested/PolicyEvaluated 이벤트에 context 검증

### TD-6: daemon tool-surface.ts 전달 경로
- ToolResult에 context 필드 추가
- pending_approval 반환 3곳에 `context: result.evt?.context ?? null`
- rejected 반환 3곳에 `context: err.context ?? null`
- executed, signed, error, approval_timeout에는 context 미포함 (negative contract)

### daemon 테스트 수정
- tool-surface.test.ts: 기존 "executed" 테스트에 `not.toHaveProperty('context')` 추가
- tool-surface.test.ts: 기존 "signed" 테스트에 `not.toHaveProperty('context')` 추가
- tool-surface.test.ts: 기존 "rejected" 테스트에 `toHaveProperty('context')` 추가
- tool-surface.test.ts: 기존 "error" 테스트에 `not.toHaveProperty('context')` 추가
- tool-surface.test.ts: approval_timeout 테스트 추가 + `not.toHaveProperty('context')`
- tool-surface.test.ts: REQUIRE_APPROVAL(pending_approval) 테스트 추가 + context shape 검증

## 2. 완료 조건
- [ ] N1: guarded-wdk 테스트 전부 pass
- [ ] N3: daemon tsc 에러 0
- [ ] F15: pending_approval 반환에 context shape 검증
- [ ] F16: rejected 반환에 context 포함
- [ ] F17: executed 반환에 context 없음
- [ ] F18: signed 반환에 context 없음
- [ ] F19: error 반환에 context 없음
- [ ] F20: approval_timeout 반환에 context 없음
- [ ] E1~E6: 엣지케이스 테스트 통과

## 3. 롤백 방법
- git revert: 이 step의 커밋 revert
- 영향 범위: evaluate-policy.test.ts, integration.test.ts, tool-surface.ts, tool-surface.test.ts

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/tests/
├── evaluate-policy.test.ts  # 수정 - context assertion + 엣지케이스 + matchArgs 테스트
└── integration.test.ts       # 수정 - 이벤트 context 검증

packages/daemon/src/
└── tool-surface.ts           # 수정 - ToolResult context + pending_approval/rejected 전달

packages/daemon/tests/
└── tool-surface.test.ts      # 수정 - positive/negative contract 테스트
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| evaluate-policy.test.ts | 직접 수정 | context assertion 추가 |
| integration.test.ts | 직접 수정 | 이벤트 context 검증 |
| tool-surface.ts | 직접 수정 | ToolResult + 전달 경로 |
| tool-surface.test.ts | 직접 수정 | positive/negative 테스트 |

### Side Effect 위험
- daemon의 ToolResult에 context 추가 시 relay를 통해 AI에 전달. relay는 JSON pass-through이므로 영향 없음.
- tool-surface.test.ts의 REQUIRE_APPROVAL 테스트는 mock 구조가 복잡할 수 있음 (Promise.race 패턴)

### 참고할 기존 패턴
- `tool-surface.test.ts:156`: PolicyRejectionError mock 패턴
- `tool-surface.test.ts:122`: executed 결과 검증 패턴

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| evaluate-policy.test.ts | context 검증 + 엣지케이스 | ✅ OK |
| integration.test.ts | 이벤트 context | ✅ OK |
| tool-surface.ts | TD-6 daemon 전달 | ✅ OK |
| tool-surface.test.ts | positive/negative contract | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| guarded-wdk 테스트 | ✅ | OK |
| daemon 전달 | ✅ tool-surface.ts | OK |
| daemon 테스트 | ✅ tool-surface.test.ts | OK |

### 검증 통과: ✅
