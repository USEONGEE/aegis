# Layer 0 Semantic Union 도입 - v0.1.10

## 문제 정의

### 현상
Layer 0의 3개 필드가 `string` 타입으로 선언되어 있으나, 실제로는 고정된 소수의 값만 사용한다:

1. **`StoredJournal.status` / `JournalInput.status`** — 실제값: `'received' | 'pending_approval' | 'settled' | 'signed' | 'failed' | 'rejected'` (6개, daemon `tool-surface.ts`의 `journal.updateStatus` 호출부 기준)
2. **`HistoryEntry.action`** — 실제값: `'approved' | 'rejected'` (2개)
3. **`HistoryEntry.type`** — 실제값: `ApprovalType` (`'tx' | 'policy' | 'policy_reject' | 'device_revoke'`) (4개, 기존 union type 존재)

### 원인
초기 구현 시 string으로 선언하고, 값의 집합이 확정된 후에도 타입을 좁히지 않았다.

### 영향
1. **컴파일 타임 안전성 부재** — 오타(`'aproved'`)를 런타임까지 발견할 수 없음
2. **변경 영향 추적 불가** — 새 status 값 추가 시 어디에 영향을 주는지 컴파일러가 알려주지 않음
3. **Layer 0 의미론 불완전** — 타입 그래프에서 "이 필드가 어떤 값을 가질 수 있는가"가 표현되지 않음

### 목표
- Layer 0의 string 필드 3곳을 semantic union type으로 교체
- 새 union type 2개 추가: `JournalStatus`, `HistoryAction`
- 기존 `ApprovalType` 재사용: `HistoryEntry.type`
- daemon의 `ExecutionJournal` status 필드도 `JournalStatus`로 연동

### 비목표 (Out of Scope)
- `PendingApprovalQueryOpts` 추가 (다음 우선순위)
- `FailedArg`과 `ArgCondition` 연결 (depth 트레이드오프로 보류)
- daemon `tool-surface.ts`의 `ToolResult` 리턴 객체의 status 문자열 변경 (journal status가 아닌 별도 도메인)
- SQLite DB 스키마 변경 (TEXT 컬럼 유지, TS 타입만 좁힘)

**Scope 경계 명확화**: `tool-surface.ts`의 `journal.updateStatus()` 호출 경로는 **in-scope** (journal에 쓰는 status 값이므로 `JournalStatus` 타입 적용 대상). 반면 `ToolResult` 리턴 객체의 `{ status: 'pending_approval' }` 등은 **out-of-scope** (별도 도메인).

## 제약사항
- Breaking change 허용 (프로젝트 원칙)
- SQLite TEXT 컬럼은 그대로 유지 — row → domain 매핑 시 캐스트로 처리
- `JournalStatus` 값 집합은 daemon `tool-surface.ts`의 실제 `journal.updateStatus()` 호출부 기준 (주석의 flow와 실코드가 불일치하므로 실코드가 소스 오브 트루스)
- `execution-journal.ts`의 status flow 주석도 실코드에 맞게 업데이트 필요
