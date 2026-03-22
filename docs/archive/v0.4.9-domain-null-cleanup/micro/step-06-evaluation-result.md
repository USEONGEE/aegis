# Step 06: EvaluationResult DU

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅ (독립 커밋)
- **선행 조건**: 없음 (Step 1-5 완료 권장)

## 1. 구현 내용 (design.md 기반)
- `EvaluationResult` 3-variant DU: `AllowResult | SimpleRejectResult | DetailedRejectResult`
- `evaluatePolicy()` 반환값 변경 (guarded-middleware.ts)
- `PolicyRejectionError.context` → DU 기반 전달
- `RejectionEntry.context` store 경계 변환
- `protocol/events.ts` PolicyEvaluatedEvent wire 타입 변경
- daemon emit path 변경
- app consumer typecheck

## 2. 완료 조건
- [ ] `rg 'context.*EvaluationContext.*null' packages/guarded-wdk/src/guarded-middleware.ts` 결과 0건
- [ ] `rg 'matchedPermission.*null' packages/guarded-wdk/src/guarded-middleware.ts` 결과 0건
- [ ] `EvaluationResult` DU의 `kind` discriminant 존재 (`allow`, `reject`, `reject_with_context`)
- [ ] `rg 'null' packages/protocol/src/events.ts` PolicyEvaluated 관련 null 0건
- [ ] `rg 'PolicyEvaluated' packages/guarded-wdk/src/guarded-middleware.ts -A5` — emit이 kind 기반
- [ ] `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit` 통과
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 통과
- [ ] `npx tsc -p packages/protocol/tsconfig.json --noEmit` 통과
- [ ] `npx tsc -p packages/app/tsconfig.json --noEmit` 통과
- [ ] 기존 테스트 통과

## 3. 롤백 방법
- `git revert <commit>` — 가장 큰 변경이나 독립 커밋

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── guarded-middleware.ts      # EvaluationResult DU 정의, evaluatePolicy 반환값, emit
├── errors.ts                  # PolicyRejectionError context → DU
├── wdk-store.ts               # RejectionEntry.context 타입
├── signed-approval-broker.ts  # onRejection 호출 시 context 전달
├── sqlite-wdk-store.ts        # rejection 저장 시 context 변환
└── json-wdk-store.ts          # 동일

packages/daemon/src/
└── tool-surface.ts            # errObj context 추출 로직

packages/protocol/src/
└── events.ts                  # PolicyEvaluatedEvent wire 타입

packages/app/src/
├── stores/useActivityStore.ts                    # PolicyEvaluated 이벤트 소비
└── domains/activity/screens/ActivityScreen.tsx    # PolicyEvaluated 표시

packages/guarded-wdk/tests/
├── evaluate-policy.test.ts    # DU variant 검증 (E5, E6)
└── integration.test.ts        # policy → rejection → event 경로

packages/daemon/tests/
└── tool-surface.test.ts       # errObj context 추출
```

### Side Effect 위험
- 핵심 policy 평가 경로 전체 변경 — 단위 테스트 + integration 테스트로 검증
- wire protocol breaking change — 동시 배포 전제

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| guarded-middleware.ts | EvaluationResult DU 정의 + evaluatePolicy | ✅ OK |
| errors.ts | PolicyRejectionError context | ✅ OK |
| wdk-store.ts | RejectionEntry.context | ✅ OK |
| signed-approval-broker.ts | onRejection context 전달 | ✅ OK |
| sqlite-wdk-store.ts | rejection 저장 변환 | ✅ OK |
| json-wdk-store.ts | 동일 | ✅ OK |
| tool-surface.ts | errObj context 추출 | ✅ OK |
| events.ts | PolicyEvaluatedEvent wire | ✅ OK |
| useActivityStore.ts | PolicyEvaluated 소비 | ✅ OK |
| ActivityScreen.tsx | PolicyEvaluated 표시 | ✅ OK |
| evaluate-policy.test.ts | DU variant 검증 | ✅ OK |
| integration.test.ts | 전체 경로 | ✅ OK |
| tool-surface.test.ts | errObj 테스트 | ✅ OK |

### False Negative (누락)
없음 — `rg 'EvaluationContext.*null\|matchedPermission.*null' packages/` 전수 확인

### 검증 통과: ✅

---

→ 다음: [Step 07: Signer Status DU](step-07-signer-status.md)
