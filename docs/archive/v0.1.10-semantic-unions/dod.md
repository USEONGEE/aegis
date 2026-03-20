# DoD (Definition of Done) - v0.1.10

## 기능 완료 조건

### guarded-wdk 타입 정의

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `JournalStatus` union type이 `approval-store.ts`에 정의: `'received' \| 'pending_approval' \| 'settled' \| 'signed' \| 'failed' \| 'rejected'` | `grep 'export type JournalStatus' packages/guarded-wdk/src/approval-store.ts` |
| F2 | `HistoryAction` union type이 `approval-store.ts`에 정의: `'approved' \| 'rejected'` | `grep 'export type HistoryAction' packages/guarded-wdk/src/approval-store.ts` |

### guarded-wdk domain 인터페이스

| # | 조건 | 검증 방법 |
|---|------|----------|
| F3 | `StoredJournal.status: JournalStatus` | `grep -A5 'interface StoredJournal' packages/guarded-wdk/src/approval-store.ts` |
| F4 | `JournalInput.status: JournalStatus` | `grep -A5 'interface JournalInput' packages/guarded-wdk/src/approval-store.ts` |
| F5 | `HistoryEntry.type: ApprovalType` | `grep -A10 'interface HistoryEntry' packages/guarded-wdk/src/approval-store.ts` |
| F6 | `HistoryEntry.action: HistoryAction` | `grep -A10 'interface HistoryEntry' packages/guarded-wdk/src/approval-store.ts` |
| F7 | `JournalQueryOpts.status?: JournalStatus` | `grep -A5 'interface JournalQueryOpts' packages/guarded-wdk/src/approval-store.ts` |
| F8 | `HistoryQueryOpts.type?: ApprovalType` | `grep -A5 'interface HistoryQueryOpts' packages/guarded-wdk/src/approval-store.ts` |

### guarded-wdk 추상 클래스 시그니처

| # | 조건 | 검증 방법 |
|---|------|----------|
| F9 | `ApprovalStore.updateJournalStatus`의 `status` 파라미터: `JournalStatus` | `grep 'updateJournalStatus' packages/guarded-wdk/src/approval-store.ts` |

### guarded-wdk internal row 타입

| # | 조건 | 검증 방법 |
|---|------|----------|
| F10 | `StoredHistoryEntry.type: ApprovalType`, `StoredHistoryEntry.action: HistoryAction` | `grep -A10 'interface StoredHistoryEntry' packages/guarded-wdk/src/store-types.ts` |
| F11 | `StoredJournalEntry.status: JournalStatus` | `grep -A8 'interface StoredJournalEntry' packages/guarded-wdk/src/store-types.ts` |

### guarded-wdk re-export

| # | 조건 | 검증 방법 |
|---|------|----------|
| F12 | `index.ts`에서 `JournalStatus`, `HistoryAction` re-export | `grep -E 'JournalStatus|HistoryAction' packages/guarded-wdk/src/index.ts` |

### daemon 전수 연동

| # | 조건 | 검증 방법 |
|---|------|----------|
| F13 | `JournalEntry.status: JournalStatus` (daemon 로컬 인터페이스) | `grep -A5 'interface JournalEntry' packages/daemon/src/execution-journal.ts` |
| F14 | `JournalListOptions.status?: JournalStatus` | `grep -A5 'interface JournalListOptions' packages/daemon/src/execution-journal.ts` |
| F15 | daemon 로컬 `ApprovalStore` 인터페이스의 `saveJournalEntry` status 파라미터: `JournalStatus` | `grep -A7 'interface ApprovalStore' packages/daemon/src/execution-journal.ts` |
| F16 | daemon 로컬 `ApprovalStore.updateJournalStatus` status 파라미터: `JournalStatus` | `grep 'updateJournalStatus' packages/daemon/src/execution-journal.ts` |
| F17 | `ExecutionJournal.updateStatus` status 파라미터: `JournalStatus` | `grep 'updateStatus' packages/daemon/src/execution-journal.ts` |
| F18 | `ExecutionJournal.getStatus()` 반환 타입: `JournalStatus \| null` | `grep 'getStatus' packages/daemon/src/execution-journal.ts` |
| F19 | `_statusIndex` 타입: `Map<string, JournalStatus>` | `grep '_statusIndex' packages/daemon/src/execution-journal.ts` |
| F20 | `execution-journal.ts` 주석이 실제 status flow 반영 (6개 상태 + 대표 전이 + direct path 포함) | `head -50 packages/daemon/src/execution-journal.ts` |
| F21 | `JournalStatus` import가 guarded-wdk 패키지에서 옴 | `grep "import.*JournalStatus" packages/daemon/src/execution-journal.ts` |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk `tsc --noEmit` 에러 0 | `cd packages/guarded-wdk && npx tsc --noEmit` |
| N2 | daemon `tsc --noEmit` 에러 0 | `cd packages/daemon && npx tsc --noEmit` |
| N3 | guarded-wdk 기존 테스트 전체 통과 | `cd packages/guarded-wdk && npm test` |
| N4 | daemon 기존 테스트 전체 통과 (있는 경우) | `cd packages/daemon && npm test` |
| N5 | 런타임 동작 변경 없음 — `rejected`는 non-terminal 유지 | daemon 단위 테스트: `ExecutionJournal.track()` → `updateStatus(intentId, 'rejected')` → `isDuplicate(targetHash) === true` 확인. 테스트 파일: `packages/daemon/tests/execution-journal.test.ts` (신규). 실행: `cd packages/daemon && npm test -- execution-journal.test.ts` |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | SQLite store에서 journal entry 읽기 (TEXT → JournalStatus) | row type narrowing (`as StoredJournalEntry`에서 `status: JournalStatus`로 좁힘) 또는 field-level cast로 타입 좁힘, 런타임 동작 변경 없음 | `tsc --noEmit` + `npm test` |
| E2 | JSON store에서 journal entry 읽기 | row type narrowing (`_read<StoredJournalEntry[]>`에서 `status: JournalStatus`로 좁힘)으로 타입 좁힘, 기존 동작 유지 | `tsc --noEmit` + `npm test` |
| E3 | `tool-surface.ts`에서 `journal.updateStatus(intentId, 'pending_approval')` 호출 | `JournalStatus` union에 포함되어 컴파일 통과 | `cd packages/daemon && npx tsc --noEmit` |
| E4 | `signed-approval-broker.ts`에서 `action: 'approved' \| 'rejected'` 할당 | `HistoryAction` union과 일치하여 컴파일 통과 | `cd packages/guarded-wdk && npx tsc --noEmit` |
| E5 | `rejected` status 후 동일 targetHash 재제출 | `isDuplicate()` 반환 `true` (기존 동작 유지 — rejected는 non-terminal) | N5의 단위 테스트에서 검증: `track()` → `updateStatus('rejected')` → `isDuplicate() === true` |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| string 필드 3곳을 semantic union type으로 교체 | F1~F11 | ✅ |
| 새 union type 2개 추가 (JournalStatus, HistoryAction) | F1, F2, F12 | ✅ |
| 기존 ApprovalType 재사용 (HistoryEntry.type) | F5, F8, F10 | ✅ |
| daemon ExecutionJournal 연동 | F13~F21 | ✅ |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 항목 | 커버 |
|----------|---------|------|
| 전 계층 좁히기 (domain + row + 시그니처) | F3~F11, F13~F19 | ✅ |
| rejected terminal 현행 유지 | N5, E5 | ✅ |
| SQLite TEXT 유지 + 캐스트 | E1 | ✅ |
| index.ts re-export | F12 | ✅ |
| 주석 업데이트 (가능한 상태 + 대표 전이) | F20 | ✅ |
| guarded-wdk에서 JournalStatus import | F21 | ✅ |
