# DoD (Definition of Done) - v0.5.4

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `wallets` 테이블에 `address` 컬럼이 존재하지 않음 | `sqlite3 wdk.db ".schema wallets"` — address 없음 확인 |
| F2 | `StoredWallet` 타입에 `address` 필드가 없음 | `grep 'address' packages/guarded-wdk/src/wdk-store.ts` — StoredWallet에 없음 |
| F3 | `WalletRow` 타입에 `address` 필드가 없음 | `grep 'address' packages/guarded-wdk/src/store-types.ts` — WalletRow에 없음 |
| F4 | `createWallet()` 시그니처가 `(accountIndex, name)` 2개 파라미터 | `grep 'createWallet' packages/guarded-wdk/src/wdk-store.ts` |
| F5 | daemon admin-server의 wallet_list 응답에 address 필드 없음 | `grep 'address' packages/daemon/src/admin-server.ts` — wallet 관련에 없음 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | TypeScript strict 에러 0 | `npx tsc --noEmit` (guarded-wdk, daemon) |
| N2 | 테스트 전체 통과 | `npm test` |
| N3 | CI 체크 통과 | `npm run check` |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | 기존 DB에 address가 있는 wallets 데이터 존재 | DB 재생성 시 address 컬럼 없이 생성, 기존 데이터의 account_index/name/created_at 유지 | 테스트에서 마이그레이션 시나리오 확인 |
| E2 | createWallet 호출 시 address 인자 전달 시도 | TypeScript 컴파일 에러 (파라미터 개수 불일치) | `npx tsc --noEmit` |
