import { createGuardedWDK } from '../src/guarded-wdk-factory.js'
import { permissionsToDict } from '../src/guarded-middleware.js'
import { WdkStore } from '../src/wdk-store.js'
import type { HistoryEntry, HistoryQueryOpts, ApprovalRequest, PolicyInput, PendingApprovalRequest } from '../src/wdk-store.js'

// Mock WDK and WalletManager
class MockWalletManager {
  _seed: string
  _config: unknown

  constructor (seed: string, config: unknown) {
    this._seed = seed
    this._config = config
  }

  async getAccount (_index: number = 0) {
    return {
      sendTransaction: async (_tx: unknown) => ({ hash: '0xhash', fee: 100n }),
      transfer: async (_opts: unknown) => ({ hash: '0xhash2', fee: 50n }),
      sign: async (_msg: unknown) => '0xsig',
      signTypedData: async (_data: unknown) => '0xsig',
      approve: async (_opts: unknown) => ({ hash: '0xhash3', fee: 30n }),
      dispose: () => {},
      getAddress: async () => '0xmyaddr',
      getBalance: async () => 1000000n,
      getTransactionReceipt: async () => ({ status: 1 }),
      keyPair: { publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) },
      _config: { provider: 'mock' },
      index: 0,
      path: "m/44'/60'/0'/0/0"
    }
  }

  async getAccountByPath (_path: string) {
    return this.getAccount(0)
  }

  async getFeeRates () {
    return { normal: 1000n, fast: 2000n }
  }

  dispose () {}
}

class MockWdkStore extends WdkStore {
  _policies: Record<string, unknown> = {}
  _pending: Array<ApprovalRequest & Record<string, unknown>> = []
  _history: HistoryEntry[] = []
  _signers: Record<string, { revoked: boolean }> = {}
  _nonces: Record<string, number> = {}

  constructor () {
    super()
  }

  override async init () {}
  override async dispose () {}
  override async listWallets () { return [] }
  override async loadPolicy (accountIndex: number, chainId: number) { return (this._policies[`${accountIndex}:${chainId}`] || null) as never }
  override async savePolicy (accountIndex: number, chainId: number, input: PolicyInput, _description: string = '') { this._policies[`${accountIndex}:${chainId}`] = { ...input, accountIndex, chainId, policyVersion: 0, updatedAt: Date.now() } }
  override async saveRejection (_entry: any) {}
  override async listRejections () { return [] }
  override async getPolicyVersion (_accountIndex: number, _chainId: number) { return 0 }
  override async loadPendingApprovals (_filter: import('../src/wdk-store.js').PendingApprovalFilter) { return this._pending as unknown as PendingApprovalRequest[] }
  override async savePendingApproval (_accountIndex: number, request: ApprovalRequest) { this._pending.push(request as ApprovalRequest & Record<string, unknown>) }
  override async removePendingApproval (requestId: string) { this._pending = this._pending.filter(p => p.requestId !== requestId) }
  override async appendHistory (entry: HistoryEntry) { this._history.push(entry) }
  override async getHistory (_opts?: HistoryQueryOpts) { return this._history as HistoryEntry[] }
  override async isSignerRevoked (_publicKey: string) { return false }
  override async revokeSigner (publicKey: string) { this._signers[publicKey] = { revoked: true } }
  override async getLastNonce (approver: string) { return this._nonces[approver] || 0 }
  override async updateNonce (approver: string, nonce: number) { this._nonces[approver] = nonce }
  override async listPolicyVersions () { return [] }
  override async getMasterSeed () { return null }
  override async setMasterSeed () {}
  override async getWallet () { return null }
  override async createWallet () { return { accountIndex: 0, name: '', address: '', createdAt: 0 } }
  override async deleteWallet () {}
  override async listPolicyChains () { return [] }
  override async loadPendingByRequestId () { return null }
  override async saveSigner () {}
  override async getSigner () { return null }
  override async listSigners () { return [] }
  override async getJournalEntry () { return null }
  override async saveJournalEntry () {}
  override async updateJournalStatus () {}
  override async listJournal () { return [] }
}

function makeConfig (overrides: Record<string, unknown> = {}) {
  return {
    seed: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    wallets: { 1: { Manager: MockWalletManager, config: {} } },
    protocols: {},
    approvalBroker: null,
    approvalStore: new MockWdkStore(),
    trustedApprovers: ['0x' + 'ab'.repeat(32)],
    ...overrides
  }
}

describe('createGuardedWDK', () => {
  test('F1: returns facade with expected methods', async () => {
    const facade = await createGuardedWDK(makeConfig())

    expect(typeof facade.getAccount).toBe('function')
    expect(typeof facade.getAccountByPath).toBe('function')
    expect(typeof facade.getFeeRates).toBe('function')
    expect(typeof facade.loadPolicy).toBe('function')
    expect(typeof facade.submitApproval).toBe('function')
    expect(typeof facade.listSigners).toBe('function')
    expect(typeof facade.on).toBe('function')
    expect(typeof facade.off).toBe('function')
    expect(typeof facade.dispose).toBe('function')
  })

  test('F22: facade does not expose wdk, seed, _wallets', async () => {
    const facade = await createGuardedWDK(makeConfig())

    expect((facade as unknown as Record<string, unknown>).wdk).toBeUndefined()
    expect((facade as unknown as Record<string, unknown>).seed).toBeUndefined()
    expect((facade as unknown as Record<string, unknown>)._wallets).toBeUndefined()
    expect((facade as unknown as Record<string, unknown>)._seed).toBeUndefined()
  })

  test('F23: account is frozen', async () => {
    const facade = await createGuardedWDK(makeConfig())

    const account = await facade.getAccount('1', 0)
    expect(Object.isFrozen(account)).toBe(true)
  })

  test('facade exposes store methods', async () => {
    const store = new MockWdkStore()
    const facade = await createGuardedWDK(makeConfig({ approvalStore: store }))

    expect(typeof facade.loadPolicy).toBe('function')
    expect(typeof facade.getPendingApprovals).toBe('function')
    expect(typeof facade.listRejections).toBe('function')
    expect(typeof facade.listPolicyVersions).toBe('function')
    expect(typeof facade.listSigners).toBe('function')
    expect(typeof facade.listWallets).toBe('function')
    expect(typeof facade.saveRejection).toBe('function')
  })

  test('facade exposes broker methods', async () => {
    const facade = await createGuardedWDK(makeConfig())

    expect(typeof facade.submitApproval).toBe('function')
    expect(typeof facade.createApprovalRequest).toBe('function')
    expect(typeof facade.setTrustedApprovers).toBe('function')
  })

  test('facade does not expose getApprovalBroker or getWdkStore', async () => {
    const facade = await createGuardedWDK(makeConfig())

    expect((facade as unknown as Record<string, unknown>).getApprovalBroker).toBeUndefined()
    expect((facade as unknown as Record<string, unknown>).getWdkStore).toBeUndefined()
  })

  test('throws if approvalStore not provided', async () => {
    await expect(createGuardedWDK(makeConfig({
      approvalStore: undefined
    }) as any)).rejects.toThrow('approvalStore is required.')
  })

  test('throws if approvalStore without trustedApprovers and no external broker', async () => {
    await expect(createGuardedWDK(makeConfig({
      trustedApprovers: []
    }))).rejects.toThrow('trustedApprovers must be a non-empty array')
  })

  test('policyResolver reads from store at runtime', async () => {
    const store = new MockWdkStore()
    await store.savePolicy(0, 1, {
      policies: [{ type: 'call', permissions: permissionsToDict([{ decision: 'ALLOW' as const }]) }],
      signature: {}
    })

    const facade = await createGuardedWDK(makeConfig({ approvalStore: store }))
    expect(typeof facade.getAccount).toBe('function')
  })

  test('facade does not expose updatePolicies', async () => {
    const facade = await createGuardedWDK(makeConfig())
    expect((facade as unknown as Record<string, unknown>).updatePolicies).toBeUndefined()
  })

  test('getAccount switches currentAccountIndex: sendTransaction uses correct wallet policy (F15/E4)', async () => {
    const store = new MockWdkStore()
    // Account 0: AUTO for all calls
    await store.savePolicy(0, 1, {
      policies: [{ type: 'call', permissions: permissionsToDict([{ decision: 'ALLOW' as const }]) }],
      signature: {}
    })
    // Account 1: empty permissions → REJECT
    await store.savePolicy(1, 1, {
      policies: [{ type: 'call', permissions: {} }],
      signature: {}
    })

    const facade = await createGuardedWDK(makeConfig({ approvalStore: store }))

    // Spy on loadPolicy to verify accountIndex
    const origLoadPolicy = store.loadPolicy.bind(store)
    const loadPolicyCalls: Array<[number, number]> = []
    store.loadPolicy = async (accountIndex: number, chainId: number) => {
      loadPolicyCalls.push([accountIndex, chainId])
      return origLoadPolicy(accountIndex, chainId)
    }

    // getAccount with index 0 → AUTO policy
    const account0 = await facade.getAccount('1', 0) as { sendTransaction: (tx: Record<string, unknown>) => Promise<unknown> }
    const tx = { to: '0xdead', data: '0x12345678', value: '0' }
    await account0.sendTransaction(tx) // should succeed (AUTO)

    // Verify loadPolicy was called with accountIndex=0
    expect(loadPolicyCalls.some(c => c[0] === 0 && c[1] === 1)).toBe(true)

    // Switch to account 1 → REJECT policy
    loadPolicyCalls.length = 0
    const account1 = await facade.getAccount('1', 1) as { sendTransaction: (tx: Record<string, unknown>) => Promise<unknown> }
    await expect(account1.sendTransaction(tx)).rejects.toThrow() // should reject

    // Verify loadPolicy was called with accountIndex=1
    expect(loadPolicyCalls.some(c => c[0] === 1 && c[1] === 1)).toBe(true)
  })

  test('getAccountByPath parses accountIndex from BIP-44 path and uses it for policy', async () => {
    const store = new MockWdkStore()
    // Account 2: AUTO policy
    await store.savePolicy(2, 1, {
      policies: [{ type: 'call', permissions: permissionsToDict([{ decision: 'ALLOW' as const }]) }],
      signature: {}
    })

    const facade = await createGuardedWDK(makeConfig({ approvalStore: store }))

    const origLoadPolicy = store.loadPolicy.bind(store)
    const loadPolicyCalls: Array<[number, number]> = []
    store.loadPolicy = async (accountIndex: number, chainId: number) => {
      loadPolicyCalls.push([accountIndex, chainId])
      return origLoadPolicy(accountIndex, chainId)
    }

    // getAccountByPath with accountIndex=2 path
    const account = await facade.getAccountByPath('1', "m/44'/60'/2'/0/0") as { sendTransaction: (tx: Record<string, unknown>) => Promise<unknown> }
    const tx = { to: '0xdead', data: '0x12345678', value: '0' }
    await account.sendTransaction(tx)

    // Verify loadPolicy was called with accountIndex=2 (parsed from path)
    expect(loadPolicyCalls.some(c => c[0] === 2 && c[1] === 1)).toBe(true)
  })
})
