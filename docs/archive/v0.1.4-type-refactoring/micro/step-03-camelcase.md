# Step 03: camelCase/snake_case 통일 (Change 1)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 02

---

## 1. 구현 내용 (design.md 기반)
- HistoryEntry, CronInput, JournalEntry에서 이중 네이밍 제거 (camelCase만 유지)
- `Stored*` 타입(StoredHistoryEntry, StoredJournalEntry, CronRecord)을 store 구현체 내부로 이동
- ApprovalStore abstract 메서드 시그니처: camelCase 타입만 반환
- JsonApprovalStore/SqliteApprovalStore 내부에서 camelCase↔snake_case 변환

## 2. 완료 조건
- [ ] `grep -rE 'seed_id\?|target_hash\?|device_id\?|intent_id\?|tx_hash\?' packages/guarded-wdk/src/approval-store.ts` 결과 0건
- [ ] `grep -n 'StoredHistoryEntry\|StoredJournalEntry' packages/guarded-wdk/src/approval-store.ts` 결과 0건
- [ ] `grep -n 'export.*StoredHistoryEntry\|export.*StoredJournalEntry\|export.*CronRecord' packages/guarded-wdk/src/approval-store.ts` 결과 0건
- [ ] json/sqlite-approval-store.test.ts에서 반환값이 camelCase 필드만 포함 확인
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: guarded-wdk 패키지

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts           # 이중 네이밍 제거, Stored* export 제거
├── json-approval-store.ts      # 내부 변환 로직, Stored* 타입 내부 이동
├── sqlite-approval-store.ts    # 내부 변환 로직, Stored* 타입 내부 이동
└── signed-approval-broker.ts   # HistoryEntry 사용부 수정

packages/guarded-wdk/tests/
├── json-approval-store.test.ts  # camelCase 입출력 확인
├── sqlite-approval-store.test.ts # camelCase 입출력 확인
└── approval-broker.test.ts      # HistoryEntry fixture 수정
```

## FP/FN 검증

### 검증 통과: ✅

---

> 다음: [Step 04: countersig 제거](step-04-countersig-removal.md)
