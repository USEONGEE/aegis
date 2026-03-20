# Step 02: ApprovalStore 인터페이스 + 구현체

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01

---

## 1. 구현 내용 (design.md 기반)
- ApprovalStore 추상 클래스: seed 메서드 6개 제거, MasterSeed/Wallet 메서드 추가, seedId→accountIndex 교체
- `SqliteApprovalStore`: 스키마 재설계 (master_seed + wallets 테이블), seedId→accountIndex 전환, wallet_delete cascade, pending_requests FK 제거
- `JsonApprovalStore`: seeds.json → master_seed.json + wallets.json, seedId→accountIndex 전환
- `store-types.ts`: `SeedRow` → 제거 또는 `WalletRow`로 교체
- `PendingApprovalRequest`: `seedId` 제거 (accountIndex는 ApprovalRequest에서 상속)
- pending_requests에 `wallet_name` 컬럼 추가 (wallet_create 전용)

## 2. 완료 조건
- [ ] `listSeeds`, `addSeed`, `removeSeed`, `setActiveSeed`, `getActiveSeed`, `getSeed` 완전 제거
- [ ] `getMasterSeed`, `setMasterSeed`, `listWallets`, `getWallet`, `createWallet`, `deleteWallet` 추가
- [ ] 모든 `seedId` 파라미터 → `accountIndex`로 교체
- [ ] SQLite 스키마에 `master_seed`, `wallets` 테이블 존재
- [ ] `pending_requests.account_index`에 FK 없음
- [ ] `pending_requests.wallet_name` 컬럼 존재
- [ ] `deleteWallet` 시 policies/pending_requests/crons/execution_journal cascade 삭제, approval_history 보존
- [ ] `execution_journal` PK가 `intent_hash` (was `intent_id`)
- [ ] `cd packages/guarded-wdk && npx tsc --noEmit` 에러 0
- [ ] `cd packages/guarded-wdk && npm test` 전체 통과

## 3. 롤백 방법
- `git revert` — clean install이므로 DB 호환성 문제 없음

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts         # 인터페이스 메서드 전면 수정
├── sqlite-approval-store.ts  # 스키마 + 구현 전면 수정
├── json-approval-store.ts    # 저장 구조 + 구현 전면 수정
├── store-types.ts            # SeedRow 제거/교체
└── index.ts                  # export 업데이트
packages/guarded-wdk/tests/
├── json-approval-store.test.ts   # seedId → accountIndex
└── sqlite-approval-store.test.ts # seedId → accountIndex
```

### Side Effect 위험
- 가장 큰 Step. 테스트 전면 수정 필요.

## FP/FN 검증
- Scope 7파일 모두 구현 내용에 직접 근거 있음 → FP 없음
- 구현 내용의 모든 항목이 Scope에 반영됨 → FN 없음
- **검증 통과: ✅**

---

→ 다음: [Step 03: SignedApprovalBroker](step-03-broker.md)
