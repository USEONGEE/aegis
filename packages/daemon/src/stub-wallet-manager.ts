import WalletManagerBase from '@tetherto/wdk-wallet'

/**
 * Minimal WalletManager stub for daemon bootstrap.
 * Allows policy evaluation middleware to be registered without a real blockchain connection.
 * getAccount() returns a stub account that throws on actual transaction operations.
 */
export class StubWalletManager extends WalletManagerBase {
  override async getAccount (_index: number = 0) {
    // IMPORTANT: 실제 주소는 seed에서 BIP-44 파생되어야 하지만,
    // 현재 hdkey/secp256k1 라이브러리가 없으므로 환경변수로 주입.
    // 프로덕션에서는 실제 EVM WalletManager를 사용해야 한다.
    const addr = process.env.WALLET_ADDRESS || `0x${'0'.repeat(40)}`
    return {
      getAddress: () => addr,
      sendTransaction: async () => { throw new Error('Stub wallet: sendTransaction not implemented') },
      transfer: async () => { throw new Error('Stub wallet: transfer not implemented') },
      sign: async () => { throw new Error('Stub wallet: sign not implemented') },
      signTransaction: async () => { throw new Error('Stub wallet: signTransaction not implemented') },
      signTypedData: async () => { throw new Error('Stub wallet: signTypedData not implemented') },
      getTransactionReceipt: async () => { throw new Error('Stub wallet: getTransactionReceipt not implemented') },
      dispose: () => {},
      getBalance: async () => [],
      keyPair: { publicKey: '', secretKey: '' }
    } as never
  }

  override async getAccountByPath (_path: string) {
    return this.getAccount(0)
  }

  async getFeeRates () {
    return { normal: 0n, fast: 0n }
  }
}
