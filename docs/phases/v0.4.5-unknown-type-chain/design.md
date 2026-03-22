# 설계 - v0.4.5

## 접근법

근본 원인(guarded-wdk)부터 수정하여 downstream으로 타입이 전파되는 전략.

### 핵심 기술 결정

1. **guarded-wdk `approval-store.ts` 타입 강화** — `policies: unknown[]` → `Policy[]`, `context: unknown` → `EvaluationContext | null`, `diff: unknown` → `PolicyDiff` 신규 타입
2. **guarded-wdk `errors.ts` 타입 강화** — `PolicyRejectionError.context: unknown` → `EvaluationContext | null`
3. **protocol `events.ts` 타입 강화** — `PolicyEvaluatedEvent.matchedPermission: unknown` → protocol 수준 구체 타입. guarded-wdk 직접 의존 대신 protocol 자체 타입 또는 re-export
4. **protocol `chat.ts` toolResults 타입 정의** — `unknown[]` → `ToolResultEntry` 공유 타입을 protocol에 정의
5. **daemon `tool-surface.ts` 결과 타입 강화** — 7개 `unknown[]` 필드를 store 반환 타입으로 교체

### 의존 방향 준수

```
guarded-wdk ← protocol (protocol이 guarded-wdk 타입 참조 가능)
guarded-wdk ← daemon   (daemon이 guarded-wdk 타입 참조 가능)
protocol ← daemon      (daemon이 protocol 타입 참조 가능)
protocol ← app         (app이 protocol 타입 참조 가능)
```

protocol이 guarded-wdk에 의존할 수 있는지가 핵심. 현재 protocol의 package.json에 guarded-wdk 의존이 없으면, protocol에 독립 타입을 정의하고 guarded-wdk가 그것을 구현하는 방향.

## 버린 대안

- protocol에 전체 guarded-wdk 타입을 복제 → 중복, No Two-Way Implements 위반 리스크
- daemon에서만 타입 좁히기 → 근본 원인(guarded-wdk) 미해결, protocol 레이어 여전히 unknown
