# DoD (Definition of Done) - v0.5.15

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `@tetherto/wdk-wallet-evm`이 daemon/package.json dependencies에 존재 | `grep wdk-wallet-evm packages/daemon/package.json` |
| F2 | wdk-host.ts가 WalletManagerEvm을 import하고 createGuardedWDK에 전달 | `grep WalletManagerEvm packages/daemon/src/wdk-host.ts` |
| F3 | wdk-host.ts의 wallets config에 `{ provider: config.evmRpcUrl }` 전달 | `grep provider packages/daemon/src/wdk-host.ts` |
| F4 | stub-wallet-manager.ts 삭제됨 | `test ! -f packages/daemon/src/stub-wallet-manager.ts` |
| F5 | docker-compose.yml에서 WALLET_ADDRESS 환경변수 제거됨 | `! grep WALLET_ADDRESS docker-compose.yml` |
| F6 | tool-surface.ts policyPending case에서 accountIndex를 로컬 destructuring으로 추출 | `grep 'const { chain, accountIndex }' packages/daemon/src/tool-surface.ts` (policyPending 근처) |
| F7 | tool-surface.ts listCrons case에서 accountIndex를 args에서 명시적으로 추출 | 코드 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | TypeScript 컴파일 에러 0 | `npx tsc -p packages/daemon/tsconfig.json --noEmit` |
| N2 | stub-wallet-manager.ts를 import하는 파일이 없음 | `grep -r stub-wallet-manager packages/daemon/src/` 결과 없음 |
| N3 | WALLET_ADDRESS를 참조하는 daemon 소스 파일이 없음 | `grep -r WALLET_ADDRESS packages/daemon/src/` 결과 없음 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | MASTER_SEED 환경변수 미설정 시 | facade: null 반환, AI 도구 호출 시 "WDK not initialized" 에러 | 기존 동작 유지 (wdk-host.ts의 null 처리 변경 없음) |
| E2 | 잘못된 mnemonic 전달 시 | WalletManagerEvm 또는 WDK가 에러 throw | @tetherto/wdk-wallet 기본 검증에 의존 |
| E3 | policyPending 호출 시 accountIndex가 args에 없는 경우 | undefined가 아닌 로컬 변수에서 추출하므로 ChainArgs 타입에 의해 컴파일 타임 보호 | tsc 타입 체크 |
