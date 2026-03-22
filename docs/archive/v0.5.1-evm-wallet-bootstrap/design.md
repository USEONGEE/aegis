# v0.5.1 설계 — EVM Wallet Bootstrap

## 현재 구조

```
initWDK()
  → store.init()
  → store.getMasterSeed()  → null이면 facade=null 반환
  → store.listSigners()    → trustedApprovers 구성
  → createGuardedWDK({
      seed: mnemonic,
      wallets: {},         ← 빈 객체: wallet manager 미등록
      protocols: {},       ← 빈 객체: 프로토콜 미등록
      approvalStore: store,
      trustedApprovers
    })
```

`createGuardedWDK()` 내부:
```
new WDK(seed)
for (wallets) → wdk.registerWallet()   ← 0회 실행
for (wallets) → wdk.registerMiddleware() ← 0회 실행
```

## 변경 설계

### 1. wdk-host.ts — EVM wallet 설정 주입

`initWDK()`에서 EVM chain에 대한 wallet 설정을 `createGuardedWDK()`에 전달.

```typescript
import WalletManagerBase from '@tetherto/wdk-wallet'

const EVM_CHAIN_ID = '1' // WDK registerWallet의 blockchain key

const facade = await createGuardedWDK({
  seed: mnemonic,
  wallets: {
    [EVM_CHAIN_ID]: { Manager: WalletManagerBase, config: {} }
  },
  protocols: {},
  approvalStore: store,
  trustedApprovers
})
```

**문제**: `WalletManagerBase`는 추상 클래스. `getAccount()`가 `NotImplementedError`를 던짐.

**해결**: 이 프로젝트에서 실제 블록체인 연결은 아직 구현되지 않았고, tests에서도 `MockWalletManager`를 사용.
daemon의 tool-surface가 `getAccount()` → `sendTransaction()` 경로를 사용하지만,
실제 구현은 mock 수준이므로 현 단계에서는 WalletManagerBase를 그대로 등록하되,
`getAccount()`가 에러를 던지는 것은 허용.

**대안**: daemon에 최소한의 `StubWalletManager`를 만들어서 등록. policy 평가 + approval 플로우만 동작하도록.

→ **대안 채택**: daemon에 `StubWalletManager`를 추가. 이유:
  - 미들웨어 등록이 `Object.keys(wallets)` 기반이므로 wallet 등록이 필수
  - `StubWalletManager.getAccount()`는 서명 없이 주소만 파생하는 stub 계정 반환
  - policy 평가 파이프라인이 정상 동작하도록 보장

### 2. guarded-wdk-factory.ts — 첫 wallet 자동 저장

`createGuardedWDK()` 내부에서 wallets가 비어 있지 않을 때,
store에 accountIndex=0 wallet이 없으면 자동 생성.

```typescript
// wallet 자동 등록: wallets config가 비어 있지 않으면 accountIndex=0 보장
if (Object.keys(wallets).length > 0) {
  const existing = await approvalStore.getWallet(0)
  if (!existing) {
    await approvalStore.createWallet(0, 'Default Wallet', '')
  }
}
```

### 3. 미들웨어 자동 등록

현재 코드는 이미 `Object.keys(wallets)` 순회하면서 미들웨어를 등록하므로,
wallets에 항목이 있으면 자동으로 미들웨어도 등록됨. 추가 변경 불필요.

## StubWalletManager 설계

```typescript
// packages/daemon/src/stub-wallet-manager.ts
import WalletManagerBase from '@tetherto/wdk-wallet'

export class StubWalletManager extends WalletManagerBase {
  async getAccount (index: number = 0) {
    return {
      getAddress: () => `0x${'0'.repeat(40)}`,
      sendTransaction: async () => { throw new Error('Stub wallet: sendTransaction not implemented') },
      transfer: async () => { throw new Error('Stub wallet: transfer not implemented') },
      sign: async () => { throw new Error('Stub wallet: sign not implemented') },
      signTransaction: async () => { throw new Error('Stub wallet: signTransaction not implemented') },
      signTypedData: async () => { throw new Error('Stub wallet: signTypedData not implemented') },
      getTransactionReceipt: async () => { throw new Error('Stub wallet: getTransactionReceipt not implemented') },
      dispose: () => {},
      getBalance: async () => [],
      keyPair: { publicKey: '', secretKey: '' }
    }
  }

  async getAccountByPath (path: string) {
    return this.getAccount(0)
  }

  async getFeeRates () {
    return { normal: 0n, fast: 0n }
  }
}
```

## 변경 요약

| 파일 | 변경 |
|---|---|
| packages/daemon/src/stub-wallet-manager.ts | 새 파일: StubWalletManager |
| packages/daemon/src/wdk-host.ts | wallets에 StubWalletManager 등록 |
| packages/guarded-wdk/src/guarded-wdk-factory.ts | accountIndex=0 wallet 자동 저장 |
