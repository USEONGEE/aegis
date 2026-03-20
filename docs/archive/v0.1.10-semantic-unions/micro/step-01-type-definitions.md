# Step 01: 타입 정의 + 인터페이스 변경

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (`git revert`)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `approval-store.ts`에 `JournalStatus`, `HistoryAction` union type 추가
- domain 인터페이스 필드 교체: `StoredJournal.status`, `JournalInput.status`, `HistoryEntry.type`, `HistoryEntry.action`, `JournalQueryOpts.status`, `HistoryQueryOpts.type`
- `ApprovalStore` 추상 클래스의 `updateJournalStatus` 시그니처 변경
- `store-types.ts` internal row 타입 변경: `StoredHistoryEntry.type`, `StoredHistoryEntry.action`, `StoredJournalEntry.status`
- `index.ts`에 `JournalStatus`, `HistoryAction` re-export 추가

## 2. 완료 조건
- [ ] `JournalStatus` = `'received' | 'pending_approval' | 'settled' | 'signed' | 'failed' | 'rejected'` 정의됨
- [ ] `HistoryAction` = `'approved' | 'rejected'` 정의됨
- [ ] `StoredJournal.status: JournalStatus`
- [ ] `JournalInput.status: JournalStatus`
- [ ] `HistoryEntry.type: ApprovalType`
- [ ] `HistoryEntry.action: HistoryAction`
- [ ] `JournalQueryOpts.status?: JournalStatus`
- [ ] `HistoryQueryOpts.type?: ApprovalType`
- [ ] `ApprovalStore.updateJournalStatus` status: `JournalStatus`
- [ ] `StoredHistoryEntry.type: ApprovalType`, `.action: HistoryAction`
- [ ] `StoredJournalEntry.status: JournalStatus`
- [ ] `index.ts`에서 `JournalStatus`, `HistoryAction` re-export

## 3. 롤백 방법
- `git revert` — 타입 정의만 변경하므로 단순 revert 가능
- 영향 범위: 이 Step만 revert하면 Step 02, 03도 컴파일 에러 발생

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts    # 수정 — union type 추가 + 인터페이스 필드 교체 + 추상 클래스 시그니처
├── store-types.ts       # 수정 — internal row 타입 좁히기 (import 추가 필요)
└── index.ts             # 수정 — re-export 추가
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| approval-store.ts | 직접 수정 | 타입 정의 + 인터페이스 |
| store-types.ts | 직접 수정 | import { JournalStatus, HistoryAction, ApprovalType } 추가 + 필드 타입 변경 |
| index.ts | 직접 수정 | re-export 추가 |
| json-approval-store.ts | 간접 영향 | Step 02에서 처리 |
| sqlite-approval-store.ts | 간접 영향 | Step 02에서 처리 |

### Side Effect 위험
- Step 01만 적용하면 store 구현체에서 타입 에러 발생 (Step 02에서 해결)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| approval-store.ts | F1~F9 | ✅ OK |
| store-types.ts | F10, F11 | ✅ OK |
| index.ts | F12 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| union type 정의 | approval-store.ts ✅ | OK |
| 인터페이스 필드 교체 | approval-store.ts ✅ | OK |
| 추상 클래스 시그니처 | approval-store.ts ✅ | OK |
| internal row 타입 | store-types.ts ✅ | OK |
| re-export | index.ts ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: Store 구현체 반영](step-02-store-implementations.md)
