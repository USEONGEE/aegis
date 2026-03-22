# Step 04: chain key + StubWalletManager 수정

## 메타데이터
- **난이도**: 🟢
- **선행 조건**: 없음

## 구현 내용
- wdk-host.ts: EVM_CHAIN_KEY '1' → '999'
- stub-wallet-manager.ts: WALLET_ADDRESS 환경변수에서 주소 읽기
- docker-compose.yml: WALLET_ADDRESS 환경변수 추가

## 완료 조건
- [x] AI가 chain "999"로 getBalance 호출 시 에러 없음
- [x] tsc --noEmit 에러 0

## Scope
- `packages/daemon/src/wdk-host.ts`
- `packages/daemon/src/stub-wallet-manager.ts`
- `docker-compose.yml`
