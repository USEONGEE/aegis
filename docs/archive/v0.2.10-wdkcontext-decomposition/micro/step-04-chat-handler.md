# Step 04: chat-handler.ts 변경 (WDKContext -> ToolExecutionContext)

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 02 (tool-surface.ts에서 ToolExecutionContext export)

---

## 1. 구현 내용 (design.md 7.4 기반)

- `import type { WDKContext }` -> `import type { ToolExecutionContext }` 변경
- `handleChatMessage` 함수 파라미터: `wdkContext: WDKContext` -> `ctx: ToolExecutionContext`
- `_processChatDirect` 함수 파라미터: `wdkContext: WDKContext` -> `ctx: ToolExecutionContext`
- 함수 내부: `const { logger } = wdkContext` -> `const { logger } = ctx` (2개소: handleChatMessage, _processChatDirect)
- `processChat(..., wdkContext, ...)` -> `processChat(..., ctx, ...)` 호출부 변경

## 2. 완료 조건

- [ ] `WDKContext`라는 이름이 chat-handler.ts에 없음 (`rg 'WDKContext' packages/daemon/src/chat-handler.ts` 결과 0건)
- [ ] `ToolExecutionContext`가 import 되어 있음 (`rg 'ToolExecutionContext' packages/daemon/src/chat-handler.ts` 결과 1건 이상)
- [ ] `handleChatMessage` 시그니처에 `ToolExecutionContext` 타입이 사용됨
- [ ] `_processChatDirect` 시그니처에 `ToolExecutionContext` 타입이 사용됨
- [ ] 함수 내부에서 `wdkContext` 변수명이 없음 (`rg 'wdkContext' packages/daemon/src/chat-handler.ts` 결과 0건)

## 3. 롤백 방법

- 롤백 절차: `git revert <commit>` (Step 04 커밋)
- 영향 범위: index.ts에서 handleChatMessage / _processChatDirect 호출부 (Step 07에서 정합)

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── chat-handler.ts  # 수정 - import 변경, 2개 함수 파라미터 타입/이름 변경, 내부 참조 변경
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| `./tool-surface.js` | import 변경 | WDKContext -> ToolExecutionContext |
| `index.ts` | 간접 영향 | handleChatMessage, _processChatDirect 호출부 시그니처 정합 필요 (Step 07) |

### Side Effect 위험
- 없음. import 타입명과 파라미터명만 변경. 런타임 동작에 영향 없음.

### 참고할 기존 패턴
- `packages/daemon/src/chat-handler.ts:2`: `import type { WDKContext }` (이 줄 변경)
- `packages/daemon/src/chat-handler.ts:29-36`: handleChatMessage 시그니처 (파라미터 타입 변경)
- `packages/daemon/src/chat-handler.ts:37`: `const { logger } = wdkContext`
- `packages/daemon/src/chat-handler.ts:73-81`: _processChatDirect 시그니처 (파라미터 타입 변경)
- `packages/daemon/src/chat-handler.ts:83`: `const { logger } = wdkContext`
- `packages/daemon/src/chat-handler.ts:97`: `processChat(..., wdkContext, ...)` 호출

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| chat-handler.ts | design.md 7.4: import + 파라미터 타입 변경 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| import WDKContext -> ToolExecutionContext | ✅ chat-handler.ts | OK |
| handleChatMessage 파라미터 타입 변경 | ✅ chat-handler.ts | OK |
| _processChatDirect 파라미터 타입 변경 | ✅ chat-handler.ts | OK |
| 내부 wdkContext -> ctx 변수명 변경 (2개소) | ✅ chat-handler.ts | OK |
| processChat 호출부 변수명 변경 | ✅ chat-handler.ts | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 05: cron-scheduler.ts 변경](step-05-cron-scheduler.md)
