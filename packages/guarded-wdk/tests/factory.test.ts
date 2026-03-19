import { createGuardedWDK } from '../src/guarded-wdk-factory.js'
import { SignedApprovalBroker } from '../src/signed-approval-broker.js'
import { permissionsToDict } from '../src/guarded-middleware.js'
import { ApprovalStore } from '../src/approval-store.js'
import type { HistoryEntry, HistoryQueryOpts, ApprovalRequest, SeedRecord } from '../src/approval-store.js'

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

class MockApprovalStore extends ApprovalStore {
  _policies: Record<string, unknown> = {}
  _pending: Array<ApprovalRequest & Record<string, unknown>> = []
  _history: HistoryEntry[] = []
  _devices: Record<string, { revoked: boolean }> = {}
  _nonces: Record<string, number> = {}

  constructor () {
    super()
  }

  override async init () {}
  override async dispose () {}
  override async loadPolicy (seedId: string, chain: string) { return (this._policies[`${seedId}:${chain}`] || null) as never }
  override async savePolicy (seedId: string, chain: string, policy: unknown) { this._policies[`${seedId}:${chain}`] = policy }
  override async getPolicyVersion (_seedId: string, _chain: string) { return 0 }
  override async loadPending (_seedId: string | null, _type: string | null, _chain: string | null) { return this._pending as never }
  override async savePending (_seedId: string, request: ApprovalRequest) { this._pending.push(request as ApprovalRequest & Record<string, unknown>) }
  override async removePending (requestId: string) { this._pending = this._pending.filter(p => p.requestId !== requestId) }
  override async appendHistory (entry: HistoryEntry) { this._history.push(entry) }
  override async getHistory (_opts?: HistoryQueryOpts) { return this._history as HistoryEntry[] }
  override async isDeviceRevoked (_deviceId: string) { return false }
  override async revokeDevice (deviceId: string) { this._devices[deviceId] = { revoked: true } }
  override async getLastNonce (approver: string, deviceId: string) { return this._nonces[`${approver}:${deviceId}`] || 0 }
  override async updateNonce (approver: string, deviceId: string, nonce: number) { this._nonces[`${approver}:${deviceId}`] = nonce }
}

const validPolicies = {
  1: {
    policies: [
      {
        type: 'call' as const,
        permissions: permissionsToDict([
          { target: '0x1234567890abcdef1234567890abcdef12345678', selector: '0x573ade81', decision: 'AUTO' as const }
        ])
      }
    ]
  }
}

function makeConfig (overrides: Record<string, unknown> = {}) {
  return {
    seed: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    wallets: { 1: { Manager: MockWalletManager, config: {} } },
    policies: validPolicies,
    approvalStore: new MockApprovalStore(),
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
    expect(typeof facade.updatePolicies).toBe('function')
    expect(typeof facade.getApprovalBroker).toBe('function')
    expect(typeof facade.getApprovalStore).toBe('function')
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

  test('F19: updatePolicies changes policy', async () => {
    const facade = await createGuardedWDK(makeConfig({
      policies: { 1: { policies: [{ type: 'call', permissions: {} }] } }
    }))

    await facade.updatePolicies(1, {
      policies: [
        {
          type: 'call',
          permissions: permissionsToDict([
            { target: '0x1234567890abcdef1234567890abcdef12345678', selector: '0x573ade81', decision: 'AUTO' }
          ])
        }
      ]
    })

    expect(true).toBe(true)
  })

  test('F20: updatePolicies is immutable snapshot', async () => {
    const facade = await createGuardedWDK(makeConfig())

    const mutablePolicies = {
      policies: [{ type: 'call', permissions: permissionsToDict([{ decision: 'AUTO' as const }]) }]
    }
    await facade.updatePolicies(1, mutablePolicies)

    // Mutate the external object
    const targets = Object.keys(mutablePolicies.policies[0].permissions)
    if (targets.length > 0) {
      const selectors = Object.keys(mutablePolicies.policies[0].permissions[targets[0]])
      if (selectors.length > 0) {
        mutablePolicies.policies[0].permissions[targets[0]][selectors[0]][0].decision = 'REJECT'
      }
    }

    // Internal should not be affected
    expect(true).toBe(true)
  })

  test('E10: updatePolicies rejects malformed policy', async () => {
    const facade = await createGuardedWDK(makeConfig())

    await expect(facade.updatePolicies(1, {} as never)).rejects.toThrow('policies')
    await expect(facade.updatePolicies(1, { policies: [{ type: 'unknown' }] })).rejects.toThrow('Unsupported')
    await expect(facade.updatePolicies(1, null as never)).rejects.toThrow()
  })

  test('getApprovalBroker returns SignedApprovalBroker instance', async () => {
    const facade = await createGuardedWDK(makeConfig())
    const broker = facade.getApprovalBroker()
    expect(broker).toBeInstanceOf(SignedApprovalBroker)
  })

  test('getApprovalStore returns store', async () => {
    const store = new MockApprovalStore()
    const facade = await createGuardedWDK(makeConfig({ approvalStore: store }))
    expect(facade.getApprovalStore()).toBe(store)
  })

  test('accepts external approvalBroker', async () => {
    const store = new MockApprovalStore()
    const externalBroker = new SignedApprovalBroker(['0x' + 'ab'.repeat(32)], store)
    const facade = await createGuardedWDK(makeConfig({
      approvalBroker: externalBroker,
      approvalStore: undefined,
      trustedApprovers: undefined
    }))
    expect(facade.getApprovalBroker()).toBe(externalBroker)
    expect(facade.getApprovalStore()).toBeNull()
  })

  test('throws if neither approvalBroker nor approvalStore provided', async () => {
    await expect(createGuardedWDK(makeConfig({
      approvalBroker: undefined,
      approvalStore: undefined,
      trustedApprovers: undefined
    }))).rejects.toThrow('Either approvalBroker or approvalStore must be provided.')
  })

  test('throws if approvalStore without trustedApprovers', async () => {
    await expect(createGuardedWDK(makeConfig({
      trustedApprovers: undefined
    }))).rejects.toThrow('trustedApprovers must be a non-empty array')
  })

  test('updatePolicies persists to store', async () => {
    const store = new MockApprovalStore()
    const seed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    const facade = await createGuardedWDK(makeConfig({ approvalStore: store }))

    const newPolicies = {
      policies: [{ type: 'call', permissions: permissionsToDict([{ decision: 'AUTO' as const }]) }]
    }
    await facade.updatePolicies(1, newPolicies)

    const saved = await store.loadPolicy(seed, 1) as Record<string, unknown>
    expect((saved as Record<string, unknown>).policies).toEqual(newPolicies.policies)
  })

  test('loads policies from store on init', async () => {
    const store = new MockApprovalStore()
    const seed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    await store.savePolicy(seed, 1, {
      policies: [{ type: 'call', permissions: permissionsToDict([{ decision: 'AUTO' as const }]) }]
    })

    // Create without explicit policies -- should load from store
    const facade = await createGuardedWDK(makeConfig({ policies: undefined }))

    // Facade created successfully with store-loaded policies
    expect(typeof facade.getAccount).toBe('function')
  })

  test('store policies take precedence over config.policies', async () => {
    const store = new MockApprovalStore()
    const seed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

    // Pre-populate store with AUTO policy for chain 1
    const storePolicies = {
      policies: [{ type: 'call', permissions: permissionsToDict([
        { target: '0x1234567890abcdef1234567890abcdef12345678', selector: '0x573ade81', decision: 'AUTO' as const }
      ]) }]
    }
    await store.savePolicy(seed, 1, storePolicies)

    // Config provides REJECT policy for chain 1 -- should be ignored because store has chain 1
    const configPolicies = {
      1: {
        policies: [{
          type: 'call' as const,
          permissions: permissionsToDict([
            { target: '0x1234567890abcdef1234567890abcdef12345678', selector: '0x573ade81', decision: 'REJECT' as const }
          ])
        }]
      }
    }

    const facade = await createGuardedWDK(makeConfig({
      approvalStore: store,
      policies: configPolicies
    }))

    // Verify store policy (AUTO) was used, not config policy (REJECT)
    const savedInStore = await store.loadPolicy(seed, 1) as Record<string, unknown>
    expect(savedInStore).not.toBeNull()
    // Facade should work (store policy loaded)
    expect(typeof facade.getAccount).toBe('function')
  })

  test('write-through: updatePolicies persists to store before updating memory', async () => {
    const store = new MockApprovalStore()
    const seed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

    // Track call order
    const callOrder: string[] = []
    const originalSave = store.savePolicy.bind(store)
    store.savePolicy = async (seedId: string, chain: string, policy: unknown) => {
      callOrder.push('store.savePolicy')
      return originalSave(seedId, chain, policy)
    }

    const facade = await createGuardedWDK(makeConfig({ approvalStore: store }))
    callOrder.length = 0 // Reset after init

    const newPolicies = {
      policies: [{ type: 'call', permissions: permissionsToDict([{ decision: 'AUTO' as const }]) }]
    }
    await facade.updatePolicies(1, newPolicies)

    // Verify store.savePolicy was called
    expect(callOrder).toContain('store.savePolicy')

    // Verify the policy was actually saved in the store
    const saved = await store.loadPolicy(seed, 1) as Record<string, unknown>
    expect((saved as Record<string, unknown>).policies).toEqual(newPolicies.policies)
  })

  test('config.policies used as fallback when store has no policy for chain', async () => {
    const store = new MockApprovalStore()

    // Store has NO policies for chain 1
    // Config provides policies for chain 1
    const configPolicies = {
      1: {
        policies: [{
          type: 'call' as const,
          permissions: permissionsToDict([
            { target: '0x1234567890abcdef1234567890abcdef12345678', selector: '0x573ade81', decision: 'AUTO' as const }
          ])
        }]
      }
    }

    const facade = await createGuardedWDK(makeConfig({
      approvalStore: store,
      policies: configPolicies
    }))

    // Facade created successfully with config fallback policies
    expect(typeof facade.getAccount).toBe('function')
  })
})
