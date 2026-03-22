# v0.5.1 티켓

## T1: StubWalletManager 생성
- packages/daemon/src/stub-wallet-manager.ts
- WalletManagerBase 상속
- getAccount(), getAccountByPath(), getFeeRates() stub 구현
- 정책 평가 파이프라인만 동작시키는 최소 구현

## T2: wdk-host.ts — wallet 등록
- initWDK()에서 wallets 설정에 StubWalletManager 추가
- EVM chain key = '1'

## T3: guarded-wdk-factory.ts — wallet 자동 저장
- createGuardedWDK() 내부에서 wallets 비어 있지 않으면 accountIndex=0 자동 저장
- store.getWallet(0) 확인 → 없으면 createWallet(0, 'Default Wallet', '')

## T4: 테스트 검증
- 기존 테스트 통과 확인
