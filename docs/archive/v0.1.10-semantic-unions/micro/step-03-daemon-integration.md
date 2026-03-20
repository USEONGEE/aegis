# Step 03: Daemon 연동 + 단위 테스트

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (`git revert`)
- **선행 조건**: Step 02 (guarded-wdk tsc 통과 필요)

---

## 1. 구현 내용 (design.md 기반)
- `execution-journal.ts`에 `JournalStatus` import (guarded-wdk에서)
- `JournalEntry.status` → `JournalStatus`
- `JournalListOptions.status` → `JournalStatus`
- daemon 로컬 `ApprovalStore` 인터페이스의 `saveJournalEntry` status → `JournalStatus`, `updateJournalStatus` status → `JournalStatus`
- `ExecutionJournal.updateStatus` status 파라미터 → `JournalStatus`
- `ExecutionJournal.getStatus()` 반환 타입 → `JournalStatus | null`
- `_statusIndex` 타입 → `Map<string, JournalStatus>`
- status flow 주석 업데이트 (6개 상태 + 대표 전이 + direct path)
- `rejected` non-terminal 보존 단위 테스트 작성

## 2. 완료 조건
- [ ] `import type { JournalStatus } from '@wdk-app/guarded-wdk'`
- [ ] `JournalEntry.status: JournalStatus`
- [ ] `JournalListOptions.status?: JournalStatus`
- [ ] daemon `ApprovalStore.saveJournalEntry` status: `JournalStatus`
- [ ] daemon `ApprovalStore.updateJournalStatus` status: `JournalStatus`
- [ ] `ExecutionJournal.updateStatus` status: `JournalStatus`
- [ ] `ExecutionJournal.getStatus()` → `JournalStatus | null`
- [ ] `_statusIndex: Map<string, JournalStatus>`
- [ ] 주석이 실제 status flow 반영 (Possible statuses: 6개 + Typical flows)
- [ ] terminal 조건에 `rejected` 미포함 확인 (`settled | failed | signed`만)
- [ ] `execution-journal.test.ts` 신규 작성: `track()` → `updateStatus('rejected')` → `isDuplicate() === true`
- [ ] `cd packages/daemon && npx tsc --noEmit` 에러 0
- [ ] `cd packages/daemon && npm test` 전체 통과

## 3. 롤백 방법
- `git revert` — daemon 내부 변경 + 테스트 파일 제거
- 영향 범위: daemon 패키지만

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── execution-journal.ts   # 수정 — JournalStatus import + 타입 변경 + 주석 업데이트
└── admin-server.ts        # 수정 — JournalListOptions.status 캐스트 (타입 변경 파생)
```

### 신규 생성 파일
```
packages/daemon/tests/
└── execution-journal.test.ts  # 신규 — rejected non-terminal 행동 테스트
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| execution-journal.ts | 직접 수정 | import + 타입 변경 + 주석 |
| admin-server.ts | 직접 수정 | `JournalListOptions.status` 타입 변경 파생 — query param 캐스트 |
| tool-surface.ts | 간접 영향 | `updateStatus` 시그니처 변경으로 타입 자동 적용. 기존 string literal이 JournalStatus에 포함되므로 변경 불필요 |

### Side Effect 위험
- `tool-surface.ts`에서 `journal.updateStatus(intentId, 'pending_approval')` 등 호출부가 `JournalStatus`에 포함되지 않는 값을 쓰면 컴파일 에러 → 이미 전수 확인하여 모두 포함됨

### 참고할 기존 패턴
- daemon에 기존 테스트가 있으면 동일 패턴 사용
- `ExecutionJournal` 생성에 필요한 mock: `ApprovalStore` + `Logger`

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| execution-journal.ts | F13~F21 | ✅ OK |
| admin-server.ts | JournalListOptions.status 타입 변경 파생 | ✅ OK |
| execution-journal.test.ts | N5 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| JournalStatus import | execution-journal.ts ✅ | OK |
| 타입 변경 7곳 | execution-journal.ts ✅ | OK |
| 주석 업데이트 | execution-journal.ts ✅ | OK |
| non-terminal 테스트 | execution-journal.test.ts ✅ | OK |
| tool-surface.ts | 간접 영향만 (수정 불필요) ✅ | OK |

### 검증 통과: ✅
