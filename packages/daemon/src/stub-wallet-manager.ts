import WalletManagerBase from '@tetherto/wdk-wallet'

/**
 * Minimal WalletManager stub for daemon bootstrap.
 * Allows policy evaluation middleware to be registered without a real blockchain connection.
 * getAccount() returns a stub account that throws on actual transaction operations.
 */
export class StubWalletManager extends WalletManagerBase {
  override async getAccount (_index: number = 0) {
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
    } as never
  }

  override async getAccountByPath (_path: string) {
    return this.getAccount(0)
  }

  async getFeeRates () {
    return { normal: 0n, fast: 0n }
  }
}
