# EvaluationResult에 기존 정책 컨텍스트 추가 - v0.1.8

## 문제 정의

### 현상
REQUIRE_APPROVAL 결정 시 AI가 "왜 승인이 필요한지"와 "현재 정책이 무엇인지"를 알 수 없다.

현재 `EvaluationResult`는 3개 필드만 반환한다:
```typescript
interface EvaluationResult {
  decision: Decision               // 'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'
  matchedPermission: Rule | null   // 매칭된 규칙 (REQUIRE_APPROVAL일 때 해당 Rule)
  reason: string                   // "matched", "no matching rule" 등 단순 문자열
}
```

AI(daemon의 tool-call-loop)가 REQUIRE_APPROVAL을 받으면:
- `matchedPermission`으로 어떤 Rule이 매칭됐는지는 알 수 있지만
- 해당 target/selector에 어떤 Rule들이 존재하는지 (전체 컨텍스트)
- 어떤 ArgCondition에서 매칭이 실패했는지 (실패 원인)

를 알 수 없다.

### 원인

**1. WDK 평가 로직 (정보 소실)**
- `evaluatePolicy()`가 순차 매칭 후 첫 번째 매칭 Rule만 반환하고, 실패한 조건 상세나 해당 target/selector의 전체 Rule 목록을 포함하지 않는다.
- `matchArgs()` (guarded-middleware.ts:193) 실패 시 단순 `false`만 반환하여 "어떤 인자가, 어떤 조건에서 실패했는지" 정보가 소실된다.

**2. 전달 경로 부재 (daemon까지 정보 도달 불가)**
- `ApprovalRequested` 이벤트 (guarded-middleware.ts:346)는 `target`, `selector`, `targetHash`, `timestamp`만 포함. 정책 컨텍스트 없음.
- daemon의 `tool-surface.ts`에서 AI에게 반환하는 `ToolResult`에 context 필드가 없음. `pending_approval` 반환 시 `requestId`와 `intentHash`만 전달.
- 결과적으로 WDK에서 context를 생성하더라도 daemon → AI까지 전달 경로가 없는 상태.

### 영향
- **AI 정책 수정 불가**: REQUIRE_APPROVAL 후 정책을 수정하려면 별도로 `loadPolicy` + 파싱을 해야 함
- **불필요한 왕복**: AI가 기존 정책 상태를 알려면 추가 API 호출 필요
- **의사결정 품질 저하**: AI가 "주소만 추가하면 되는지" vs "새 Rule이 필요한지" 판단 불가

### 목표

**REQUIRE_APPROVAL 시 (필수)**:
- `EvaluationResult`에 `context: EvaluationContext | null` 필드 추가
- context에 해당 target/selector의 effective rules (wildcard 후보 포함) 목록과 실패한 arg 상세 포함
- `ApprovalRequested` 이벤트에 context 포함하여 daemon까지 전달 경로 확보
- daemon의 AI-facing 반환에 context 포함

**REJECT 시 (call-policy mismatch 계열만 선택적)**:
- `no matching permission` REJECT: context 포함 (target/selector의 rules가 있지만 매칭 안 됨 → 유용한 정보)
- 조기 REJECT (`no policies for chain`, `no call policy`, `too early`, `expired`, `missing tx.to`, `missing or invalid tx.data`): **context = null** (정책 컨텍스트 자체가 무의미)

**AUTO 시**:
- context = null (불필요한 정보 생성 방지)

### 비목표 (Out of Scope)
- **suggestion 필드**: AI에게 "뭘 바꿔야 하는지" 힌트를 주는 것은 daemon 레이어 책임. 이번 Phase는 raw data(현재 rules + 실패 원인)만 제공. Primitive First 원칙.
- AI가 실제로 정책을 수정하는 로직 (daemon 레이어 책임, 별도 Phase)
- Partial Update API (PUT만으로 충분, 나중에)
- ABI 검증 (manifest/CLI 레이어 책임)
- evaluatePolicy의 매칭 알고리즘 자체 변경

## 제약사항
- Breaking change 허용 (프로젝트 원칙)
- EvaluationResult를 사용하는 모든 곳에 영향 (nullable 추가이므로 하위호환)
- v0.1.7 (Store 네이밍 통일)과 병렬 진행 — 파일 충돌 없음 (v0.1.7은 approval-store 계열, v0.1.8은 guarded-middleware 계열)
- "No Optional" 원칙: EvaluationContext 내부 필드에 optional 없음. context 자체가 null이거나 완전한 객체이거나.
