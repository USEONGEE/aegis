# 작업위임서 — EvaluationResult에 기존 정책 상태 포함

> REQUIRE_APPROVAL 시 AI가 "왜 승인이 필요한지 + 현재 정책이 뭔지" 알 수 있게 EvaluationResult 확장

---

## 6하원칙

### Who (누가)
- 다음 세션
- 필요 접근: guarded-wdk (middleware), daemon (tool-surface)

### What (무엇을)
- [ ] `EvaluationResult`에 현재 정책 컨텍스트 추가
  - 현재: `{ decision, matchedPermission: Rule | null, reason }`
  - 변경: `{ decision, matchedPermission, reason, context }` — context에 기존 정책 상태 포함
- [ ] context에 포함할 정보:
  - `currentPermissions`: 해당 target/selector의 현재 Rule 목록
  - `failedCondition`: 어떤 조건에서 실패했는지 (어떤 ArgCondition이 매칭 안 됐는지)
  - `suggestion`: 어떤 변경이 필요한지 힌트 (예: "0x주소가 ONE_OF 목록에 없음")
- [ ] daemon의 ApprovalRequested 이벤트에도 이 context 전달
- [ ] AI(tool-call-loop)가 이 정보를 받아서 정책 수정 판단에 활용

### When (언제)
- 선행 조건: v0.1.7 (Store 네이밍 통일) 완료 후 권장, 독립 진행도 가능
- 데모 전에 필요

### Where (어디서)
- `packages/guarded-wdk/src/guarded-middleware.ts` — EvaluationResult 확장 + evaluatePolicy 반환값
  - `evaluatePolicy()` (line 203): 현재 EvaluationResult 반환
  - REQUIRE_APPROVAL 분기 (line 338, 442, 540): ApprovalRequested 이벤트 발행
- `packages/daemon/src/tool-surface.ts` — AI에게 context 전달
- `packages/daemon/src/control-handler.ts` — approval 요청 시 context 포함

### Why (왜)
현재 REQUIRE_APPROVAL이 나오면 AI는 "승인이 필요하다"만 알고:
- 왜 필요한지 (어떤 조건이 안 맞았는지)
- 현재 정책이 뭔지 (어떤 Rule들이 있는지)
- 뭘 바꿔야 하는지

를 모름. 정책을 수정하려면 기존 상태를 알아야 하는데, 현재는 별도로 loadPolicy + 파싱을 해야 함. EvaluationResult에 바로 포함하면 AI가 즉시 판단 가능.

### How (어떻게)
- `/quick-phase-workflow` 사용 (구조 변경 작음)

**구현 방향**:

```typescript
// Before
interface EvaluationResult {
  decision: Decision
  matchedPermission: Rule | null
  reason: string
}

// After
interface EvaluationResult {
  decision: Decision
  matchedPermission: Rule | null
  reason: string
  context: EvaluationContext | null  // REQUIRE_APPROVAL/REJECT 시에만 채워짐
}

interface EvaluationContext {
  target: string                    // 대상 컨트랙트 주소
  selector: string                  // 함수 셀렉터
  currentRules: Rule[]              // 해당 target/selector의 현재 Rule 목록
  failedArgs: Record<string, {      // 매칭 실패한 인자 정보
    expected: ArgCondition
    actual: string
  }>
}
```

**흐름**:
```
1. evaluatePolicy() → REQUIRE_APPROVAL + context (현재 Rules + 실패 원인)
2. ApprovalRequested 이벤트에 context 포함
3. daemon이 AI에게 전달
4. AI가 context를 보고:
   - "주소만 추가하면 되겠다" → 기존 정책 + 주소 추가 → PUT
   - "Rule 전체가 안 맞다" → 새 Rule 작성 → PUT
```

---

## 맥락

### 현재 상태
- 프로젝트 버전: v0.1.6 (완료)
- EvaluationResult: 3필드 (decision, matchedPermission, reason)
- evaluatePolicy: guarded-middleware.ts:203
- REQUIRE_APPROVAL 분기: 3곳 (line 338, 442, 540)

### 사용자 확정 결정사항
- PUT만으로 충분 (partial update API는 나중에)
- AI가 기존 정책을 읽고 merge 판단하는 건 daemon 레이어 책임
- ABI 검증은 manifest/CLI 레이어 책임 (guarded-wdk 밖)
- EvaluationResult에 기존 정책 상태 포함은 guarded-wdk 책임

### 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| Policy Partial Update 아이디어 | docs/idea/policy-partial-update.md | 배경 |
| AI Policy Merge 전략 | docs/idea/ai-policy-merge-strategy.md | AI 의사결정 흐름 |
| v0.1.6 설계 | docs/archive/v0.1.6-layer0-type-cleanup/design.md | 타입 구조 참조 |

---

## 주의사항
- `EvaluationContext`는 AUTO일 때는 null — 불필요한 정보 생성 방지
- context에 전체 PermissionDict를 넣지 말 것 — 해당 target/selector의 Rule[]만 포함
- 이 변경은 EvaluationResult를 쓰는 모든 곳에 영향 (matchedPermission처럼 nullable 추가)

## 시작 방법
```bash
mkdir -p docs/phases/v0.1.8-evaluation-context
# /quick-phase-workflow
```
