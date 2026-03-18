# Step 17: daemon - 9개 agent tool 정의

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 16 (wdk-host)

---

## 1. 구현 내용 (design.md 기반)

`packages/daemon/src/tool-surface.js` 생성. OpenClaw에 등록할 9개 agent tool의 스키마 정의와 실행 핸들러를 구현한다.

- **Tool 스키마**: OpenAI function calling 형식 (`{ type: 'function', function: { name, description, parameters } }`)
- **Tool 핸들러**: `executeToolCall(toolCall)` — tool name에 따라 WDK 호출 후 Tool Result 반환

| # | tool name | parameters | 핸들러 동작 |
|---|-----------|------------|------------|
| 1 | sendTransaction | { chain, to, data, value } | wdk.getAccount(chain) → account.sendTransaction() → executed / pending_approval / rejected |
| 2 | transfer | { chain, token, to, amount } | wdk.getAccount(chain) → account.transfer() → executed / pending_approval / rejected |
| 3 | getBalance | { chain } | wdk.getAccount(chain) → account.getBalance() → { balances } |
| 4 | policyList | { chain } | store.load(seedId, chain) → { policies } |
| 5 | policyPending | { chain } | store.loadPending(seedId, chain) → { pending } |
| 6 | policyRequest | { chain, reason, policies } | broker.createRequest('policy', ...) → { requestId, status: 'pending' } |
| 7 | registerCron | { interval, prompt, chain, sessionId } | cronScheduler.register() → { cronId, status: 'registered' } |
| 8 | listCrons | {} | cronScheduler.list() → { crons } |
| 9 | removeCron | { cronId } | cronScheduler.remove() → { status: 'removed' } |

- **Tool Result Schema**: 모든 tool은 `{ status, ...data }` 또는 `{ status: 'error', error }` 반환
- Admin surface (policyApprove, deviceRevoke, journalList, status, deviceList)는 tool 미등록 (AI 접근 불가, DoD 보안 불변식)

## 2. 완료 조건
- [ ] `packages/daemon/src/tool-surface.js` 에서 `TOOL_DEFINITIONS`, `executeToolCall` export
- [ ] `TOOL_DEFINITIONS`가 9개 tool의 OpenAI function calling 스키마 배열
- [ ] `executeToolCall({ name, arguments })` 가 각 tool name에 맞는 핸들러 실행
- [ ] sendTransaction: AUTO → `{ status: 'executed', hash, fee, chain }` (DoD F23)
- [ ] sendTransaction: REQUIRE_APPROVAL → `{ status: 'pending_approval', requestId }` (DoD F24)
- [ ] sendTransaction: REJECT → `{ status: 'rejected', reason }` (DoD F25)
- [ ] transfer: WDK transfer 호출 → result 반환 (DoD F26)
- [ ] getBalance: `{ balances: [...] }` 반환 (DoD F27)
- [ ] policyList: `{ policies: [...] }` 반환 (DoD F28)
- [ ] policyPending: `{ pending: [...] }` 반환 (DoD F29)
- [ ] policyRequest: pending 저장 + `{ requestId, status: 'pending' }` 반환 (DoD F30)
- [ ] registerCron: `{ cronId, status: 'registered' }` 반환 (DoD F31)
- [ ] listCrons: `{ crons: [...] }` 반환 (DoD F32)
- [ ] removeCron: `{ status: 'removed' }` 반환 (DoD F33)
- [ ] Admin surface는 TOOL_DEFINITIONS에 포함하지 않음
- [ ] `npm test -- packages/daemon` 통과 (tool-surface 단위 테스트, mock WDK/store/scheduler 사용)

## 3. 롤백 방법
- `packages/daemon/src/tool-surface.js` 삭제
- 관련 테스트 파일 삭제

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/
  tool-surface.js         # 9개 tool 스키마 + executeToolCall 핸들러
packages/daemon/tests/
  tool-surface.test.js    # 단위 테스트 (mock WDK/store/scheduler)
```

### 수정 대상 파일
```
없음 (openclaw-client에서 TOOL_DEFINITIONS를 import — Step 18에서 연결)
```

### Side Effect 위험
- 없음 (순수 함수 + WDK 호출 래퍼)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| tool-surface.js | 9개 tool 스키마 + 핸들러 | ✅ OK |
| tool-surface.test.js | 단위 테스트 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| TOOL_DEFINITIONS (9개) | ✅ tool-surface.js | OK |
| executeToolCall | ✅ tool-surface.js | OK |
| sendTransaction 3가지 결과 | ✅ tool-surface.js | OK |
| transfer, getBalance | ✅ tool-surface.js | OK |
| policyList, policyPending, policyRequest | ✅ tool-surface.js | OK |
| registerCron, listCrons, removeCron | ✅ tool-surface.js | OK |
| Admin surface 미등록 | ✅ 미포함으로 검증 | OK |

### 검증 통과: ✅

---

→ 다음: [Step 18: daemon - OpenClaw client](step-18-openclaw-client.md)
