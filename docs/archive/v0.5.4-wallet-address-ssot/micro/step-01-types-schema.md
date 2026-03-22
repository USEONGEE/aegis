# Step 01: 타입 + 스키마에서 address 제거

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용
- `StoredWallet` 인터페이스에서 `address` 필드 제거
- `WalletRow` 인터페이스에서 `address` 필드 제거
- `createWallet()` 추상 메서드 시그니처에서 `address` 파라미터 제거
- SQLite `wallets` 테이블 CREATE문에서 `address` 컬럼 제거
- `sqlite-wdk-store.ts`의 createWallet/listWallets/getWallet 구현 수정
- `json-wdk-store.ts`의 createWallet/listWallets/getWallet 구현 수정
- `guarded-wdk-factory.ts`의 `createWallet(0, 'Default Wallet', '')` 호출에서 세 번째 인자 제거
- `signed-approval-broker.ts`의 `createWallet(accountIndex, name, '')` 호출에서 세 번째 인자 제거

## 2. 완료 조건
- [ ] `StoredWallet`에 `address` 필드 없음
- [ ] `WalletRow`에 `address` 필드 없음
- [ ] `createWallet(accountIndex: number, name: string)` — 2개 파라미터
- [ ] `wallets` CREATE문에 `address` 컬럼 없음
- [ ] sqlite-wdk-store의 INSERT/SELECT에서 address 참조 없음
- [ ] json-wdk-store의 address 참조 없음
- [ ] `npx tsc --noEmit` 통과 (guarded-wdk)

## 3. 롤백 방법
- git revert — 타입/스키마 복원

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── wdk-store.ts           # StoredWallet 타입 + createWallet 시그니처
├── store-types.ts         # WalletRow 타입
├── sqlite-wdk-store.ts    # SQLite 스키마 + CRUD 구현
├── json-wdk-store.ts      # JSON store CRUD 구현
├── guarded-wdk-factory.ts # createWallet 호출
└── signed-approval-broker.ts # createWallet 호출
```

→ 다음: [Step 02: daemon + 테스트 수정](step-02-daemon-tests.md)
