# Step 02: protocol 이벤트/채팅 wire 타입 강화

## 메타데이터
- **난이도**: 🟡
- **선행 조건**: Step 01 (guarded-wdk 타입이 확정되어야 wire 타입 설계 가능)

## 구현 내용
- `events.ts` — `PolicyEvaluatedEvent.matchedPermission: unknown` → 인라인 구조체 또는 protocol 수준 wire 타입
- `events.ts` — `PolicyEvaluatedEvent.context: unknown` → 인라인 구조체 또는 protocol 수준 wire 타입
- `events.ts` — `PolicyEvaluatedEvent.decision: string` → `'ALLOW' | 'REJECT'`
- `chat.ts` — `ChatDoneEvent.toolResults: unknown[]` → `ToolResultWire[]` 신규 타입

### 설계 결정: protocol에 인라인 wire 타입 정의
protocol은 guarded-wdk에 의존하지 않으므로, 독립적인 wire 타입을 정의.
guarded-wdk가 emit할 때 구조적 타이핑으로 호환됨 (TS structural typing).

```typescript
// events.ts에 추가할 wire 타입 예시
interface PolicyRuleWire {
  order: number
  decision: 'ALLOW' | 'REJECT'
  args?: Record<string, { condition: string; value: string | string[] }>
  valueLimit?: string | number
}

interface PolicyEvaluationContextWire {
  target: string
  selector: string
  effectiveRules: PolicyRuleWire[]
  ruleFailures: Array<{
    rule: PolicyRuleWire
    failedArgs: Array<{ argIndex: string; condition: string; expected: string | string[]; actual: string }>
  }>
}
```

## 완료 조건
- [ ] `grep ': unknown' packages/protocol/src/events.ts` → 0건
- [ ] `grep 'unknown\[\]' packages/protocol/src/chat.ts` → 0건
- [ ] `npx tsc --noEmit` 통과 (protocol)
- [ ] guarded-wdk의 emit 타입이 protocol wire 타입에 구조적으로 assignable

## Scope
### 수정 대상
- `packages/protocol/src/events.ts` — PolicyEvaluatedEvent 필드 타입 강화
- `packages/protocol/src/chat.ts` — ChatDoneEvent.toolResults 타입 강화
- `packages/protocol/src/index.ts` — 신규 wire 타입 re-export (필요 시)
