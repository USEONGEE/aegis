# Step 02: ToolResultEntry Discriminated Union 재정의

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01 (per-tool result 타입이 tool-surface.ts에 정의되어야 import 가능)

---

## 1. 구현 내용 (design.md 기반)

design.md 6.2절 + 8절 Step 2 기반:

- `tool-call-loop.ts`의 `ToolResultEntry` 인터페이스를 name-discriminated union으로 재정의:
  - 12개 known tool variant: `{ toolCallId: string; name: 'sendTransaction'; args: Record<string, unknown>; result: SendTransactionResult }` 등 (args는 JSON.parse 결과이므로 Record<string, unknown>)
  - 1개 unknown tool fallback variant: `{ toolCallId: string; name: string; args: Record<string, unknown>; result: ToolErrorResult }`
- `ToolResult` import를 `AnyToolResult` + per-tool result 타입들로 변경
- `allToolResults.push(...)` 로직에서 `name`이 리터럴이 되도록 타입 처리:
  - `fnName`은 `toolCall.function.name`(string)이므로, known tool인 경우 ToolResultEntry variant에 맞도록 처리 필요
  - unknown tool variant(`name: string`)가 fallback으로 존재하므로 `fnName`이 string인 채로 push 가능
- `result` 변수의 타입을 `ToolResult`에서 `AnyToolResult`로 변경
- 기존 `ToolResult` import 제거 (또는 `AnyToolResult`로 교체)

## 2. 완료 조건

- [ ] `rg "name: 'sendTransaction'" packages/daemon/src/tool-call-loop.ts` 결과 1건 (F4a)
- [ ] `rg "name: 'transfer'" packages/daemon/src/tool-call-loop.ts` 결과 1건 (F4b)
- [ ] `rg "name: 'getBalance'" packages/daemon/src/tool-call-loop.ts` 결과 1건 (F4c)
- [ ] `rg "name: 'policyList'" packages/daemon/src/tool-call-loop.ts` 결과 1건 (F4d)
- [ ] `rg "name: 'policyPending'" packages/daemon/src/tool-call-loop.ts` 결과 1건 (F4e)
- [ ] `rg "name: 'policyRequest'" packages/daemon/src/tool-call-loop.ts` 결과 1건 (F4f)
- [ ] `rg "name: 'registerCron'" packages/daemon/src/tool-call-loop.ts` 결과 1건 (F4g)
- [ ] `rg "name: 'listCrons'" packages/daemon/src/tool-call-loop.ts` 결과 1건 (F4h)
- [ ] `rg "name: 'removeCron'" packages/daemon/src/tool-call-loop.ts` 결과 1건 (F4i)
- [ ] `rg "name: 'signTransaction'" packages/daemon/src/tool-call-loop.ts` 결과 1건 (F4j)
- [ ] `rg "name: 'listRejections'" packages/daemon/src/tool-call-loop.ts` 결과 1건 (F4k)
- [ ] `rg "name: 'listPolicyVersions'" packages/daemon/src/tool-call-loop.ts` 결과 1건 (F4l)
- [ ] `rg 'name: string' packages/daemon/src/tool-call-loop.ts` 결과 1건 (F5 -- unknown tool fallback variant)
- [ ] `rg 'toolCallId' packages/daemon/src/tool-call-loop.ts` 결과 1건 이상 (N2 -- wire 필드 유지)
- [ ] `rg 'AnyToolResult' packages/daemon/src/tool-call-loop.ts` 결과 1건 이상 (ToolResult -> AnyToolResult 교체)
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 이전 baseline 대비 새 에러 미발생 (N1)

## 3. 롤백 방법
- 롤백 절차: `git revert` 단일 커밋. `ToolResultEntry`를 원래 인터페이스로 복원. Step 01의 타입 정의는 그대로 남아도 무해.
- 영향 범위: `tool-call-loop.ts`만 영향. `chat-handler.ts`는 `ToolResultEntry[]`를 사용하지만 필드 구조(toolCallId, name, args, result)가 동일하므로 영향 없음.

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── tool-call-loop.ts  # 수정 - ToolResultEntry union 재정의, import 변경, result 변수 타입 변경, push 로직 타입 처리
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| tool-call-loop.ts | 직접 수정 | ToolResultEntry 재정의 + import 변경 |
| tool-surface.ts | 의존 (읽기) | Step 01에서 정의한 per-tool result 타입을 import |
| chat-handler.ts | 간접 영향 | `ToolResultEntry`를 import하여 `ProcessChatResult.toolResults`에 사용. union 재정의 후에도 wire 형태 동일하므로 코드 변경 불필요 |

### Side Effect 위험
- 위험 1: `allToolResults.push({...})` 시 `fnName`(string)이 union의 리터럴 `name`과 매치되지 않아 타입 에러 발생 가능. **대응**: unknown tool variant(`name: string`)가 fallback으로 존재하므로, string 타입의 `fnName`은 이 variant로 흡수됨. 단, known tool의 result 타입도 `AnyToolResult`(union)이므로 TypeScript가 받아들임.
- 위험 2: `chat-handler.ts`에서 `ToolResultEntry`를 소비할 때 타입 변경으로 인한 간접 에러. **대응**: `chat-handler.ts`는 `entry.name`, `entry.result` 등 공통 필드만 접근하므로 union 변경에 무관. tsc로 검증.

### 참고할 기존 패턴
- `tool-call-loop.ts:9-14`: 현재 `ToolResultEntry` 인터페이스 (재정의 대상)
- `tool-call-loop.ts:116-144`: `allToolResults.push(...)` 로직 (타입 처리 대상)

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| tool-call-loop.ts | ToolResultEntry union 재정의, import 변경, push 로직 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| ToolResultEntry 12 known + 1 unknown variant | ✅ tool-call-loop.ts | OK |
| ToolResult -> AnyToolResult import 교체 | ✅ tool-call-loop.ts | OK |
| result 변수 타입 변경 | ✅ tool-call-loop.ts | OK |
| push 로직 타입 처리 | ✅ tool-call-loop.ts | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 03: ControlMessage Discriminated Union 재정의](step-03-control-message-union.md)
