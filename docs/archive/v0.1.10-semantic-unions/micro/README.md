# 작업 티켓 - v0.1.10

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | 타입 정의 + 인터페이스 변경 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | Store 구현체 + Broker 반영 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | Daemon 연동 + 단위 테스트 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02 → 03
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| string 필드 3곳을 semantic union type으로 교체 | Step 01, 02 | ✅ |
| 새 union type 2개 추가 (JournalStatus, HistoryAction) | Step 01 | ✅ |
| 기존 ApprovalType 재사용 (HistoryEntry.type) | Step 01 | ✅ |
| daemon ExecutionJournal 연동 | Step 03 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: JournalStatus 정의 | Step 01 | ✅ |
| F2: HistoryAction 정의 | Step 01 | ✅ |
| F3: StoredJournal.status | Step 01 | ✅ |
| F4: JournalInput.status | Step 01 | ✅ |
| F5: HistoryEntry.type | Step 01 | ✅ |
| F6: HistoryEntry.action | Step 01 | ✅ |
| F7: JournalQueryOpts.status | Step 01 | ✅ |
| F8: HistoryQueryOpts.type | Step 01 | ✅ |
| F9: ApprovalStore.updateJournalStatus | Step 01 | ✅ |
| F10: StoredHistoryEntry row | Step 01 | ✅ |
| F11: StoredJournalEntry row | Step 01 | ✅ |
| F12: index.ts re-export | Step 01 | ✅ |
| F13: JournalEntry.status (daemon) | Step 03 | ✅ |
| F14: JournalListOptions.status (daemon) | Step 03 | ✅ |
| F15: daemon ApprovalStore.saveJournalEntry | Step 03 | ✅ |
| F16: daemon ApprovalStore.updateJournalStatus | Step 03 | ✅ |
| F17: ExecutionJournal.updateStatus | Step 03 | ✅ |
| F18: ExecutionJournal.getStatus() | Step 03 | ✅ |
| F19: _statusIndex 타입 | Step 03 | ✅ |
| F20: execution-journal.ts 주석 | Step 03 | ✅ |
| F21: JournalStatus import from guarded-wdk | Step 03 | ✅ |
| N1: guarded-wdk tsc | Step 02 | ✅ |
| N2: daemon tsc | Step 03 | ✅ |
| N3: guarded-wdk 테스트 | Step 02 | ✅ |
| N4: daemon 테스트 | Step 03 | ✅ |
| N5: rejected non-terminal 보존 테스트 | Step 03 | ✅ |
| E1: SQLite journal TEXT → JournalStatus 캐스트 | Step 02 | ✅ |
| E2: JSON store journal status 타입 좁힘 | Step 02 | ✅ |
| E3: tool-surface.ts updateStatus('pending_approval') 컴파일 | Step 03 | ✅ |
| E4: signed-approval-broker action 할당 HistoryAction 호환 | Step 02 | ✅ |
| E5: rejected 후 duplicate 보존 | Step 03 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| 전 계층 좁히기 (domain + row + 시그니처) | Step 01, 02, 03 | ✅ |
| rejected terminal 현행 유지 | Step 03 | ✅ |
| SQLite TEXT 유지 + 캐스트 | Step 02 | ✅ |
| index.ts re-export | Step 01 | ✅ |
| 주석 업데이트 (가능한 상태 + 대표 전이) | Step 03 | ✅ |
| guarded-wdk에서 JournalStatus import | Step 03 | ✅ |

## Step 상세
- [Step 01: 타입 정의 + 인터페이스 변경](step-01-type-definitions.md)
- [Step 02: Store 구현체 + Broker 반영](step-02-store-implementations.md)
- [Step 03: Daemon 연동 + 단위 테스트](step-03-daemon-integration.md)
