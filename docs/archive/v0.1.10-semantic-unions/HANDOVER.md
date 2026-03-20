# 작업위임서 — Layer 0 Semantic Union 도입

> Layer 0의 string 필드 3곳을 semantic union type으로 강화

---

## 6하원칙

### Who (누가)
- 다음 세션
- 필요 접근: guarded-wdk, daemon 패키지

### What (무엇을)
- [ ] `JournalStatus` union type 추가 + `string` 필드 교체
- [ ] `HistoryAction` union type 추가 + `string` 필드 교체
- [ ] `HistoryEntry.type`을 `ApprovalType`으로 교체
- [ ] daemon `ExecutionJournal`의 status 관련 string 필드도 연동
- [ ] store 구현체(json/sqlite)의 타입 반영
- [ ] 테스트 assertion에서 string literal → union type 확인

### When (언제)
- 선행 조건: v0.1.9 완료 (완료됨, 커밋 `98338a9`)
- 즉시 가능

### Where (어디서)
- `packages/guarded-wdk/src/approval-store.ts` — 타입 정의 (JournalStatus, HistoryAction, HistoryEntry.type)
- `packages/guarded-wdk/src/store-types.ts` — 내부 row 타입 (action: string 등)
- `packages/guarded-wdk/src/signed-approval-broker.ts:174` — action 값 생성 (`'approved' | 'rejected'`)
- `packages/guarded-wdk/src/json-approval-store.ts` — store 구현
- `packages/guarded-wdk/src/sqlite-approval-store.ts` — store 구현 + DB 스키마 (TEXT 유지, TS 타입만 변경)
- `packages/daemon/src/execution-journal.ts` — status flow 사용처
- `packages/daemon/src/tool-surface.ts` — status 문자열 리턴
- `packages/guarded-wdk/tests/` — assertion 변경

### Why (왜)
현재 Layer 0에 3곳의 `string` 필드가 실제로는 소수의 고정된 값만 사용함:
- `StoredJournal.status` / `JournalInput.status` — 실제값: `'received' | 'evaluated' | 'approved' | 'broadcasted' | 'settled' | 'failed' | 'signed'`
- `HistoryEntry.action` — 실제값: `'approved' | 'rejected'`
- `HistoryEntry.type` — 실제값: `ApprovalType` (`'tx' | 'policy' | 'policy_reject' | 'device_revoke'`)

string으로 두면:
1. 오타를 컴파일 타임에 잡을 수 없음
2. 새 값을 추가할 때 어디에 영향을 주는지 파악이 어려움
3. Layer 0의 "compact함"이 의미론적으로 완성되지 않음

Codex 리뷰에서도 이 3개를 "가장 가치 있는 보완"으로 식별함 (session 6).

### How (어떻게)
- `/quick-phase-workflow` 사용 (구조 변경 작음, 이름 변경 + 타입 좁히기)

**구현 방향**:

```typescript
// approval-store.ts에 추가
export type JournalStatus = 'received' | 'evaluated' | 'approved' | 'broadcasted' | 'settled' | 'failed' | 'signed'
export type HistoryAction = 'approved' | 'rejected'

// 기존 타입 변경
export interface JournalInput {
  // ...
  status: JournalStatus    // was: string
}

export interface StoredJournal {
  // ...
  status: JournalStatus    // was: string
}

export interface HistoryEntry {
  // ...
  type: ApprovalType       // was: string
  action: HistoryAction    // was: string
}

// QueryOpts도 변경
export interface JournalQueryOpts {
  status?: JournalStatus   // was: string
}

export interface HistoryQueryOpts {
  type?: ApprovalType      // was: string
}
```

**daemon 연동**:
- `execution-journal.ts`의 `JournalEntry.status` → `JournalStatus` (guarded-wdk에서 import)
- `ExecutionJournal.updateStatus(intentId, status)` 파라미터 → `JournalStatus`
- `tool-surface.ts`의 status 리턴값들은 daemon 자체 `ToolResult` 필드이므로 별도 (이번 scope 아님)

**DB 스키마**:
- SQLite `TEXT` 컬럼은 그대로 유지 — TS 타입만 좁히면 됨
- row → domain 매핑 시 `as JournalStatus` 캐스트 추가

---

## 맥락

### 현재 상태
- 프로젝트 버전: v0.1.9 (완료, 커밋 `98338a9`)
- guarded-wdk 타입 그래프: 32 nodes, 64 edges, 순환 0
- Layer 0: 15개 leaf 노드 (이번 변경으로 노드 2개 추가 → 17개)

### 사용자 확정 결정사항
- Codex 토론 결과 "Layer 0는 compact하다" 합의 → 이 3개만 보완
- `FailedArg`과 `ArgCondition` 연결 건은 depth 트레이드오프 때문에 보류
- `PendingApprovalQueryOpts` 추가는 다음 우선순위 (이번 scope 아님)
- Breaking change 허용

### 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| 타입 그래프 JSON | docs/type-dep-graph/type-dep-graph.json | 현재 의존성 그래프 |
| Codex 토론 session 6 | `/Users/mousebook/Documents/GitHub/WDK-APP/6` | compact 여부 분석 결과 |
| v0.1.7 설계 | docs/archive/v0.1.7-store-naming/design.md | Stored*/Input 패턴 참조 |
| daemon execution-journal | packages/daemon/src/execution-journal.ts:42-46 | status flow 정의 (received → settled/failed/signed) |

---

## 주의사항
- `JournalStatus`의 값 집합은 daemon의 `ExecutionJournal` 주석(line 42-46)에 정의된 status flow를 따름
- `HistoryAction`은 현재 `'approved' | 'rejected'` 2개뿐 — `signed-approval-broker.ts:174`가 유일한 생성처
- `HistoryEntry.type`은 이미 `ApprovalType`과 동일한 값을 쓰고 있으므로 재사용이 자연스러움
- daemon `tool-surface.ts`의 `{ status: 'pending_approval' }` 등은 `ToolResult` 리턴값이지 journal status가 아님 — scope 밖
- 새 union type 2개(`JournalStatus`, `HistoryAction`)는 Layer 0에 추가되므로 기존 leaf 특성 유지

## 시작 방법
```bash
# Phase 워크플로우 시작
# /quick-phase-workflow
```
