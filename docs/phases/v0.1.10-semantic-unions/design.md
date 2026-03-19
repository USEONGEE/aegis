# 설계 - v0.1.10

## 변경 규모
**규모**: 일반 기능
**근거**: 2개+ 패키지 수정 (guarded-wdk, daemon), 내부 API 변경 (ApprovalStore 추상 클래스 시그니처)

---

## 문제 요약
Layer 0의 `string` 필드 3곳이 실제로는 고정된 값만 사용하지만 타입이 `string`이어서 컴파일 타임 안전성이 없다.

> 상세: [README.md](README.md) 참조

## 접근법
- 새 union type 2개 (`JournalStatus`, `HistoryAction`) 정의
- 기존 `ApprovalType` 재사용 (`HistoryEntry.type`)
- domain 인터페이스 + internal row 타입 + 추상 클래스 시그니처를 한번에 좁힘
- SQLite TEXT 컬럼 유지, 읽기 시 `as` 캐스트
- daemon의 `ExecutionJournal`도 연동
- 새 타입을 `index.ts`에서 re-export (패키지 경계 통과)

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: domain 인터페이스만 좁힘, internal row는 string 유지 | 변경 최소 | row ↔ domain 매핑에서 타입 불일치 지속, 내부 코드에서 오타 가능 | ❌ |
| B: domain + internal row + 추상 클래스 시그니처 모두 좁힘 | 전 계층 일관성, 오타 완전 차단 | 변경 파일 수 증가 (5~6개) | ✅ |
| C: TypeScript enum 사용 | IDE 자동완성 지원 | 프로젝트가 union type 패턴 사용 중 (`ApprovalType`), enum은 런타임 객체 생성 | ❌ |

**선택 이유**: B — 프로젝트의 기존 `ApprovalType` 패턴과 일관되고, internal row까지 좁혀야 "Layer 0 의미론 완성"이라는 목표에 부합한다. 변경 파일 수는 많지만 모두 기계적 교체라 리스크가 낮다.

## 기술 결정

### 1. 새 union type 정의

```typescript
// approval-store.ts에 추가
export type JournalStatus = 'received' | 'pending_approval' | 'settled' | 'signed' | 'failed' | 'rejected'
export type HistoryAction = 'approved' | 'rejected'
```

### 2. `rejected` terminal 여부: 현행 유지 (non-terminal)

이 Phase는 타입 좁히기만 수행한다. `execution-journal.ts:128`의 terminal 조건(`settled | failed | signed`)은 변경하지 않는다.

**근거**: `rejected` 후 동일 `targetHash` 재제출이 현재 duplicate로 차단되는 것은 기존 동작이다. terminal 조건 변경은 hash-index 해제 → 재시도 허용이라는 런타임 동작 변경이므로 이 Phase의 scope(타입 좁히기)를 벗어난다. 별도 이슈로 판단이 필요하다.

### 3. SQLite/JSON store: 읽기 시 캐스트

```typescript
// sqlite: row → domain 매핑 시
status: row.status as JournalStatus
action: h.action as HistoryAction
type: h.type as ApprovalType  // 이미 존재
```

### 4. `execution-journal.ts` 주석 업데이트

주석은 "가능한 상태 집합 + 대표 전이" 방식으로 작성한다. direct path (`received -> settled`, `received -> signed`)도 포함한다.

```
// Possible statuses: received, pending_approval, settled, signed, failed, rejected
// Typical flows:
//   received -> settled                          (auto-approved tx)
//   received -> pending_approval -> settled      (human-approved tx)
//   received -> pending_approval -> rejected     (denied)
//   received -> signed                           (auto-approved sign)
//   received -> pending_approval -> signed       (human-approved sign)
//   any -> failed                                (error at any stage)
```

## 범위 / 비범위

**범위 (In Scope)**:
- `approval-store.ts`: `JournalStatus`, `HistoryAction` 타입 추가 + 인터페이스 필드 교체 + 추상 클래스 시그니처
- `store-types.ts`: `StoredHistoryEntry`, `StoredJournalEntry` row 타입 좁히기
- `json-approval-store.ts`: 타입 반영 (캐스트 추가/제거)
- `sqlite-approval-store.ts`: 타입 반영 (캐스트 추가/제거)
- `signed-approval-broker.ts`: `HistoryAction` 타입 사용 (이미 올바른 값 사용 중)
- `index.ts`: `JournalStatus`, `HistoryAction` re-export 추가
- `execution-journal.ts`: `JournalStatus` import + 시그니처 + 주석 업데이트
- `tool-surface.ts`: `updateStatus` 호출 시 타입 자동 적용 (시그니처 변경으로)
- 테스트: 타입 검증 (string literal → union type 호환성 확인)

**비범위 (Out of Scope)**:
- `ToolResult` 리턴 객체의 status 문자열 (별도 도메인)
- SQLite DB 스키마 변경 (TEXT 유지)
- `PendingApprovalQueryOpts` 추가
- `PendingApprovalRow.type` → `ApprovalType` (이미 row 수준에서 `as ApprovalType` 캐스트 존재, 별도 이슈)
- `rejected` terminal 조건 변경 (런타임 동작 변경 — 별도 이슈)

## API/인터페이스 계약

| 대상 | 변경 전 | 변경 후 | 영향 |
|------|---------|---------|------|
| `StoredJournal.status` | `string` | `JournalStatus` | 소비자 타입 좁아짐 (호환) |
| `JournalInput.status` | `string` | `JournalStatus` | 생산자에서 union 값만 허용 |
| `HistoryEntry.type` | `string` | `ApprovalType` | 기존 `ApprovalType` 재사용 |
| `HistoryEntry.action` | `string` | `HistoryAction` | 소비자 타입 좁아짐 (호환) |
| `JournalQueryOpts.status` | `string` | `JournalStatus` | 쿼리 파라미터 좁아짐 |
| `HistoryQueryOpts.type` | `string` | `ApprovalType` | 쿼리 파라미터 좁아짐 |
| `ApprovalStore.updateJournalStatus` | `status: string` | `status: JournalStatus` | 추상 클래스 시그니처 |
| `StoredHistoryEntry` (internal) | `type: string, action: string` | `type: ApprovalType, action: HistoryAction` | internal row |
| `StoredJournalEntry` (internal) | `status: string` | `status: JournalStatus` | internal row |
| `index.ts` re-export | - | `JournalStatus`, `HistoryAction` 추가 | daemon에서 import 가능 |
| `ExecutionJournal.updateStatus` | `status: string` | `status: JournalStatus` | daemon 내부 |
| `JournalStore.updateJournalStatus` | `status: string` | `status: JournalStatus` | daemon 내부 인터페이스 |

## 아키텍처 개요

```
approval-store.ts (타입 정의)
  ├── JournalStatus (new)
  ├── HistoryAction (new)
  └── ApprovalType (existing, reused)
        │
  ┌─────┼─────────────────┐
  │     │                 │
store-types.ts    json-store.ts    sqlite-store.ts
(internal rows)   (implements)     (implements)
                        │
              signed-approval-broker.ts
              (HistoryAction producer)
                        │
              index.ts (re-export)
              ─── guarded-wdk boundary ───
                        │
              execution-journal.ts (daemon)
              (JournalStatus consumer — import from guarded-wdk)
                        │
              tool-surface.ts (daemon)
              (JournalStatus values via updateStatus)
```

## 테스트 전략

- **tsc --noEmit**: 전 패키지 타입 검증 — union 불일치가 있으면 컴파일 에러
- 기존 테스트 실행: string literal이 union에 포함되면 기존 테스트 그대로 통과
- assertion에서 string literal → union type 값 사용 확인 (변경 불필요할 가능성 높음)

## 리스크/오픈 이슈

- **리스크 낮음**: 모든 변경이 타입 좁히기이므로 런타임 동작 변경 없음
- `rejected` terminal 여부는 별도 이슈로 추후 검토 필요 (현행: non-terminal → 동일 targetHash 재제출 시 duplicate 차단)
- `PendingApprovalRow.type`은 이미 `as ApprovalType` 캐스트가 있어 이번 scope에서 제외했으나, 일관성을 위해 추후 정리 대상
