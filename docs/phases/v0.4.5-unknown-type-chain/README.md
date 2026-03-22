# 크로스 패키지 Unknown 타입 체인 해소 - v0.4.5

## 문제 정의

### 현상
guarded-wdk에서 잘 정의된 타입(`EvaluationContext`, `Policy[]` 등)이 `approval-store.ts`와 `errors.ts`에서 `unknown`으로 선언되어, protocol → daemon → app 전 구간으로 타입 정보가 소실됨. CI dead-exports 126건 중 28건이 이 패턴(B 카테고리: 타입 gap)에 해당.

### 목표
`unknown` 타입 체인을 끊고, 크로스 패키지 타입 흐름을 구체 타입으로 복원하여:
1. dead-exports B 카테고리 건수 감소
2. daemon AI 루프가 정책 거부 사유를 구조적으로 파악 가능
3. app이 이벤트/결과를 수동 캐스팅 없이 소비 가능

### 비목표
- A 카테고리(진짜 dead) 37건 export 제거 — 별도 작업
- C 카테고리(공개 API) 61건 검토 — 장기 검토
- B 카테고리 중 같은 패키지 내 구조적 매칭 해소 — 우선순위 낮음
- relay 전송 레이어 `RelayEnvelope.payload: unknown` — 의도적 설계(blind transport)

### 제약사항
- Breaking change 허용 (CLAUDE.md 원칙)
- `unknown` → 구체 타입은 TS 하위 호환 (구체 타입은 `unknown`에 assignable)
- guarded-wdk는 JS(ES Modules) — `.ts` 타입 파일만 수정, `.js` 런타임 파일은 최소 변경
