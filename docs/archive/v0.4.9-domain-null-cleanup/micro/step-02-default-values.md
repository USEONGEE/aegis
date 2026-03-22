# Step 02: Default Value Conversions

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음

## 1. 구현 내용 (design.md 기반)
- `PendingApprovalRequest.walletName`: `string | null` → `string` (fallback 확정)
- `StoredSigner.name`: `string | null` → `string` (fallback 확정)
- `CreateRequestOptions.walletName` (daemon ports + guarded-wdk factory): `string | null` → `string`
- `ExecutionJournal._logger`: `JournalLogger | null` → `JournalLogger` (NullLogger 패턴)

## 2. 완료 조건
- [ ] `rg 'walletName.*null' packages/guarded-wdk/src/wdk-store.ts` 결과 0건
- [ ] `rg 'name.*string.*null' packages/guarded-wdk/src/wdk-store.ts` StoredSigner 관련 0건
- [ ] `rg 'JournalLogger.*null' packages/guarded-wdk/src/` 결과 0건
- [ ] Store 구현에서 DB null row → fallback 매핑 존재
- [ ] `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit` 통과
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 통과
- [ ] 기존 테스트 통과

## 3. 롤백 방법
- `git revert <commit>`

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── wdk-store.ts               # PendingApprovalRequest.walletName, StoredSigner.name 타입 변경
├── signed-approval-broker.ts  # walletName fallback 이동 (createRequest 내)
├── guarded-wdk-factory.ts     # CreateRequestOptions.walletName 타입
├── execution-journal.ts       # NullLogger 기본값
├── sqlite-wdk-store.ts        # DB null → fallback 매핑
└── json-wdk-store.ts          # DB null → fallback 매핑

packages/daemon/src/
├── ports.ts                   # CreateRequestOptions.walletName
└── tool-surface.ts            # walletName 전달 값 변경

packages/guarded-wdk/tests/
├── approval-broker.test.ts    # walletName 기본값 테스트
├── sqlite-wdk-store.test.ts   # DB null row → fallback 테스트 (E1)
└── json-wdk-store.test.ts     # 동일
```

### Side Effect 위험
- DB에 `wallet_name = NULL`인 기존 row → Store 읽기 시 fallback 적용 (E1 엣지케이스)

## FP/FN 검증

### 검증 통과: ✅
- Scope 8개 파일 = 구현 내용 4개 항목의 정의 + caller + store 구현 전부 커버

---

→ 다음: [Step 03: Filter Param Consolidation](step-03-filter-params.md)
