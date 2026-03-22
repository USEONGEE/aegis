# v0.5.1 — EVM Wallet Bootstrap

## 문제

daemon이 master seed를 보유하고 있어도 wallet manager가 등록되지 않아 `getAccount()`를 호출할 수 없다.
현재 `initWDK()`는 `wallets: {}`, `protocols: {}`를 전달하므로:

1. WDK에 wallet manager가 등록되지 않음 → `getAccount()` 호출 시 `No wallet registered for blockchain` 에러
2. 미들웨어(정책 평가)가 등록되지 않음 → 정책 우회 가능
3. store에 wallet 레코드가 없음 → accountIndex=0 wallet 미등록

사용자가 seed를 등록한 후에도 별도의 `wallet_create` 승인 플로우를 거쳐야만 wallet이 사용 가능해지는데,
이는 MetaMask/Rabby 등의 UX 기대와 다르다. seed가 있으면 첫 번째 지갑은 자동으로 사용 가능해야 한다.

## 목표

daemon 부팅 시 seed가 존재하면:
1. EVM wallet manager를 WDK에 자동 등록
2. accountIndex=0 wallet을 store에 자동 저장 (이미 있으면 skip)
3. 정책 평가 미들웨어를 자동 등록
4. `getAccount(chainId, 0)`로 첫 지갑을 즉시 사용 가능

## 범위

- `packages/daemon/src/wdk-host.ts` — initWDK() 수정
- `packages/guarded-wdk/src/guarded-wdk-factory.ts` — createGuardedWDK() 수정: wallets 비어 있으면 store에서 로드
- 새 파일 없음. 기존 코드 수정만.

## 범위 밖

- 멀티체인 wallet manager 등록 (향후 별도 phase)
- EVM 이외 체인 (BTC, Tron 등)
- 프로토콜(Swap, Bridge, Lending) 자동 등록
