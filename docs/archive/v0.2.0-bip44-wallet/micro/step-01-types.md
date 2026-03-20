# Step 01: Layer 0 타입 재설계

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `MasterSeed`, `StoredWallet` 신규 타입 추가
- `StoredSeed` 제거
- `ApprovalType`에 `wallet_create` | `wallet_delete` 추가
- `ApprovalRequest`, `SignedApproval`에서 `metadata` 제거, `accountIndex`/`content` 추가
- `StoredPolicy`, `StoredCron`, `HistoryEntry`, `PendingApprovalRequest` — `seedId` → `accountIndex`
- `JournalInput`, `StoredJournal` — `intentId` → `intentHash`, `seedId` → `accountIndex`
- `HistoryQueryOpts`, `JournalQueryOpts` — `seedId` → `accountIndex`
- `WalletNotFoundError`, `NoMasterSeedError` 신규 에러 추가

## 2. 완료 조건
- [ ] `MasterSeed`, `StoredWallet` 타입이 `approval-store.ts`에 정의됨
- [ ] `StoredSeed` 타입 제거, `grep -r 'StoredSeed' packages/guarded-wdk/src/` 결과 0건
- [ ] `ApprovalType`에 `wallet_create`, `wallet_delete` 포함
- [ ] `ApprovalRequest`/`SignedApproval`에 `accountIndex`, `content` 필드 존재, `metadata` 없음
- [ ] 모든 `seedId` 필드가 `accountIndex`로 교체됨
- [ ] `JournalInput`/`StoredJournal`의 `intentId` → `intentHash`
- [ ] `WalletNotFoundError`, `NoMasterSeedError` 에러 클래스 `errors.ts`에 정의됨
- [ ] `npx tsc --noEmit` — approval-store.ts 단독 에러 0 (구현체 에러는 Step 02에서)

## 3. 롤백 방법
- `git revert` — 타입 정의만 변경하므로 안전

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts    # 타입 정의 전면 수정
├── errors.ts            # 신규 에러 추가
└── index.ts             # export 업데이트
```

### 신규 생성 파일
없음

### Side Effect 위험
- 타입 변경으로 구현체(json/sqlite-approval-store)와 daemon 전체에서 tsc 에러 발생 — 의도적, Step 02~06에서 수정

## FP/FN 검증
- Scope 3파일 모두 구현 내용에 직접 근거 있음 → FP 없음
- 구현 내용의 모든 항목이 Scope에 반영됨 → FN 없음
- **검증 통과: ✅**

---

→ 다음: [Step 02: ApprovalStore 인터페이스 + 구현체](step-02-store.md)
