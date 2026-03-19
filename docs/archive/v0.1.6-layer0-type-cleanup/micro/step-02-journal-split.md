# Step 02: JournalEntry → JournalInput + JournalEntry 분리

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음 (Step 01과 독립)

---

## 1. 구현 내용 (design.md Step B)
- `JournalInput` 신규: `{ intentId, seedId, chainId, targetHash, status }` (5개, required)
- `JournalEntry` 재정의: `{ ...JournalInput fields, txHash: string | null, createdAt, updatedAt }` (8개, required)
- `saveJournalEntry` 시그니처: `JournalEntry` → `JournalInput`
- store 구현체: fallback (`|| ''`, `|| Date.now()`) 제거
- `index.ts`: `JournalInput` export 추가

## 2. 완료 조건
- [ ] `approval-store.ts`에 `JournalInput` 정의 존재 (DoD F5)
- [ ] `JournalInput` 필드: 정확히 5개, `?` 없음 (DoD F6)
- [ ] `saveJournalEntry` 파라미터가 `JournalInput` (DoD F5)
- [ ] `grep -n 'JournalInput' packages/guarded-wdk/src/index.ts` (DoD F10)
- [ ] `pnpm --filter guarded-wdk test` — 6 suites pass (DoD N1)

## 3. 롤백 방법
- `git revert <commit>`

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts        # JournalInput 신규, JournalEntry 재정의, saveJournalEntry 시그니처
├── json-approval-store.ts   # saveJournalEntry fallback 제거
├── sqlite-approval-store.ts # 동일
└── index.ts                 # JournalInput export 추가
```

### Side Effect 위험
- daemon/execution-journal.ts에 로컬 JournalEntry 중복 존재 — 이번에 건드리지 않음 (design.md 결정)

## FP/FN 검증

### False Positive (과잉)
| Scope 파일 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| approval-store.ts | JournalInput 신규 + JournalEntry 재정의 | ✅ OK |
| json-approval-store.ts | saveJournalEntry fallback 제거 | ✅ OK |
| sqlite-approval-store.ts | 동일 | ✅ OK |
| index.ts | JournalInput export | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| JournalInput 정의 | ✅ | OK |
| JournalEntry 재정의 | ✅ | OK |
| saveJournalEntry 시그니처 | ✅ | OK |
| fallback 제거 | ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 03: CronInput optional 정리](step-03-cron-input.md)
