# Step 01: Per-Tool Result 타입 정의

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

design.md 6.1절 + 8절 Step 1 기반:

- `tool-surface.ts`에 공통 에러/거부 인터페이스 정의:
  - `ToolErrorResult` (`status: 'error'`, `error: string`)
  - `IntentErrorResult` (`status: 'error'`, `error: string`, `intentHash: string`)
  - `IntentRejectedResult` (`status: 'rejected'`, `reason`, `intentHash`, `context`)
  - `TransferRejectedResult` (`status: 'rejected'`, `reason`, `context`)
- 12개 도구별 성공 인터페이스 정의:
  - `SendTransactionExecuted`, `SendTransactionDuplicate`
  - `TransferExecuted`
  - `GetBalanceSuccess`
  - `PolicyListSuccess`
  - `PolicyPendingSuccess`
  - `PolicyRequestPending`
  - `RegisterCronRegistered`
  - `ListCronsSuccess`
  - `RemoveCronRemoved`
  - `SignTransactionSigned`, `SignTransactionDuplicate`
  - `ListRejectionsSuccess`
  - `ListPolicyVersionsSuccess`
- 12개 도구별 union 타입 정의:
  - `SendTransactionResult`, `TransferResult`, `GetBalanceResult`, `PolicyListResult`, `PolicyPendingResult`, `PolicyRequestResult`, `RegisterCronResult`, `ListCronsResult`, `RemoveCronResult`, `SignTransactionResult`, `ListRejectionsResult`, `ListPolicyVersionsResult`
- `AnyToolResult` union 타입 정의 (12개 도구 result의 합집합)
- 기존 `ToolResult` wide optional bag 인터페이스를 `/** @deprecated use AnyToolResult */`로 마킹하고, `type ToolResult = AnyToolResult`로 alias 유지
- `executeToolCall`의 반환 타입을 `Promise<AnyToolResult>`로 변경

## 2. 완료 조건

- [ ] `rg 'export interface ToolResult' packages/daemon/src/tool-surface.ts` 결과 0건 (F1 -- wide optional bag interface 제거됨)
- [ ] `rg 'interface ToolErrorResult' packages/daemon/src/tool-surface.ts` 결과 1건
- [ ] `rg 'interface IntentErrorResult' packages/daemon/src/tool-surface.ts` 결과 1건
- [ ] `rg 'interface IntentRejectedResult' packages/daemon/src/tool-surface.ts` 결과 1건
- [ ] `rg 'interface TransferRejectedResult' packages/daemon/src/tool-surface.ts` 결과 1건
- [ ] `rg 'type SendTransactionResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F3a)
- [ ] `rg 'type TransferResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F3b)
- [ ] `rg 'type GetBalanceResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F3c)
- [ ] `rg 'type PolicyListResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F3d)
- [ ] `rg 'type PolicyPendingResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F3e)
- [ ] `rg 'type PolicyRequestResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F3f)
- [ ] `rg 'type RegisterCronResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F3g)
- [ ] `rg 'type ListCronsResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F3h)
- [ ] `rg 'type RemoveCronResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F3i)
- [ ] `rg 'type SignTransactionResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F3j)
- [ ] `rg 'type ListRejectionsResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F3k)
- [ ] `rg 'type ListPolicyVersionsResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F3l)
- [ ] `rg 'type AnyToolResult' packages/daemon/src/tool-surface.ts` 결과 1건 (F2)
- [ ] `rg '@deprecated' packages/daemon/src/tool-surface.ts` 결과 1건 이상 (`ToolResult` deprecated 주석)
- [ ] `rg 'executeToolCall' packages/daemon/src/tool-surface.ts` 에서 반환 타입이 `Promise<AnyToolResult>`
- [ ] `GetBalanceSuccess` 인터페이스에 `status` 필드 없음 (F6 -- status-less 성공 유지)
- [ ] `PolicyListSuccess`, `PolicyPendingSuccess`, `ListCronsSuccess`, `ListRejectionsSuccess`, `ListPolicyVersionsSuccess`에 `status` 필드 없음 (F6)
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 이전 baseline 대비 새 에러 미발생 (N1)

## 3. 롤백 방법
- 롤백 절차: `git revert` 단일 커밋. 추가된 타입 정의만 제거되고 기존 `ToolResult` 인터페이스 복원.
- 영향 범위: `tool-surface.ts`만 영향. 후속 Step 없이 독립적으로 롤백 가능.

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── tool-surface.ts  # 수정 - per-tool result 인터페이스 ~100줄 추가, AnyToolResult union, executeToolCall 반환 타입 변경, 기존 ToolResult deprecated alias
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| tool-surface.ts | 직접 수정 | 타입 정의 추가 + executeToolCall 반환 타입 변경 |
| tool-call-loop.ts | 간접 영향 | `ToolResult` import를 사용하지만, alias로 후방 호환 유지 → 이 Step에서는 변경 불필요 |

### Side Effect 위험
- 위험 1: `executeToolCall`의 각 switch case return문이 새 per-tool result 타입과 불일치할 수 있음. **대응**: tsc로 검증. 불일치 시 return 문의 객체 리터럴을 per-tool result 인터페이스에 맞게 조정 (필드 추가/제거 없이 타입 좁힘만).

### 참고할 기존 패턴
- `tool-surface.ts:34-54`: 현재 `ToolResult` wide bag (제거 대상)
- `tool-surface.ts:56-95`: 기존 args 인터페이스 (`SendTransactionArgs` 등) -- 동일 파일 내 인터페이스 선언 패턴 참조

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| tool-surface.ts | per-tool result 타입 정의, AnyToolResult, executeToolCall 반환 타입, ToolResult deprecated | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 공통 에러/거부 인터페이스 4종 | ✅ tool-surface.ts | OK |
| 도구별 성공 인터페이스 14종 | ✅ tool-surface.ts | OK |
| 도구별 union 12종 | ✅ tool-surface.ts | OK |
| AnyToolResult union | ✅ tool-surface.ts | OK |
| ToolResult deprecated alias | ✅ tool-surface.ts | OK |
| executeToolCall 반환 타입 | ✅ tool-surface.ts | OK |
| status-less 성공 유지 (6종) | ✅ tool-surface.ts | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 02: ToolResultEntry 재정의](step-02-tool-result-entry-union.md)
