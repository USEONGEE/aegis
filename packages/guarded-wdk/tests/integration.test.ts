import { jest } from '@jest/globals'
import { EventEmitter } from 'node:events'
import { createGuardedMiddleware, evaluatePolicy, validatePolicies, permissionsToDict } from '../src/guarded-middleware.js'
import { SignedApprovalBroker } from '../src/signed-approval-broker.js'
import { WdkStore } from '../src/wdk-store.js'
import type { HistoryEntry, HistoryQueryOpts, ApprovalRequest, PolicyInput, PendingApprovalRequest } from '../src/wdk-store.js'
import { ForbiddenError, PolicyRejectionError } from '../src/errors.js'
import { generateKeyPair, sign } from '../src/crypto-utils.js'
import type { KeyPair } from '../src/crypto-utils.js'
import { createHash } from 'node:crypto'
import { canonicalJSON } from '@wdk-app/canonical'

const aavePool = '0x1234567890abcdef1234567890abcdef12345678'
const usdcAddr = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const repaySelector = '0x573ade81'
const approveSelector = '0x095ea7b3'

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
  override async loadPolicy (accountIndex: number, chainId: number) { return (this._policies[`${accountIndex}:${chainId}`] || null) as never }
  override async savePolicy (accountIndex: number, chainId: number, input: PolicyInput, _description: string = '') { this._policies[`${accountIndex}:${chainId}`] = { ...input, accountIndex, chainId, policyVersion: 0, updatedAt: Date.now() } }
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
  override async saveRejection () {}
  override async listRejections () { return [] }
  override async listPolicyVersions () { return [] }
  override async getMasterSeed () { return null }
  override async setMasterSeed () {}
  override async listWallets () { return [] }
  override async getWallet () { return null }
  override async createWallet () { return { accountIndex: 0, name: '', createdAt: 0 } }
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

interface MockAccount {
  sendTransaction: jest.Mock<(...args: unknown[]) => Promise<{ hash: string; fee: bigint }>>
  transfer: jest.Mock<(...args: unknown[]) => Promise<{ hash: string; fee: bigint }>>
  sign: jest.Mock<(...args: unknown[]) => Promise<string>>
  signTypedData: jest.Mock<(...args: unknown[]) => Promise<string>>
  approve: jest.Mock<(...args: unknown[]) => Promise<{ hash: string; fee: bigint }>>
  dispose: jest.Mock<(...args: unknown[]) => void>
  getAddress: jest.Mock<(...args: unknown[]) => Promise<string>>
  getBalance: jest.Mock<(...args: unknown[]) => Promise<bigint>>
  getTransactionReceipt: jest.Mock<(...args: unknown[]) => Promise<{ status: number }>>
  keyPair: { publicKey: Uint8Array; privateKey: Uint8Array }
  _config: { provider: string }
  [key: string]: unknown
}

function createMockAccount (): MockAccount {
  return {
    sendTransaction: jest.fn(async (_tx: unknown) => ({ hash: '0xhash123', fee: 1000n })),
    transfer: jest.fn(async (_opts: unknown) => ({ hash: '0xhash456', fee: 500n })),
    sign: jest.fn(async () => '0xsig'),
    signTypedData: jest.fn(async () => '0xsig'),
    approve: jest.fn(async () => ({ hash: '0xhash789', fee: 200n })),
    dispose: jest.fn(),
    getAddress: jest.fn(async () => '0xmyaddr'),
    getBalance: jest.fn(async () => 1000000n),
    getTransactionReceipt: jest.fn(async () => ({ status: 1 })),
    keyPair: { publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) },
    _config: { provider: 'mock' }
  }
}

function makePolicyArr () {
  return [
    { type: 'timestamp' as const, validAfter: 1000000000, validUntil: 2000000000 },
    {
      type: 'call' as const,
      permissions: permissionsToDict([
        {
          target: aavePool,
          selector: repaySelector,
          args: { 1: { condition: 'LTE' as const, value: '1000' } },
          decision: 'ALLOW' as const
        },
        {
          target: aavePool,
          selector: repaySelector,
          decision: 'REJECT' as const
        },
        {
          target: usdcAddr,
          selector: approveSelector,
          args: {
            0: { condition: 'EQ' as const, value: aavePool },
            1: { condition: 'LTE' as const, value: '5000' }
          },
          decision: 'ALLOW' as const
        }
      ])
    }
  ]
}

function makeRepayTx (amount: number | bigint) {
  const arg0 = usdcAddr.replace('0x', '').padStart(64, '0')
  const arg1 = BigInt(amount).toString(16).padStart(64, '0')
  return {
    to: aavePool,
    value: 0,
    data: repaySelector + arg0 + arg1 + '00'.repeat(64)
  }
}

function makeApproveTx (spender: string, amount: number | bigint) {
  const arg0 = spender.replace('0x', '').padStart(64, '0')
  const arg1 = BigInt(amount).toString(16).padStart(64, '0')
  return {
    to: usdcAddr,
    value: 0,
    data: approveSelector + arg0 + arg1
  }
}

describe('Integration: Guarded Middleware', () => {
  let account: MockAccount
  let emitter: EventEmitter
  let policyArr: any
  let store: MockWdkStore

  beforeEach(() => {
    account = createMockAccount()
    emitter = new EventEmitter()
    store = new MockWdkStore()
    policyArr = makePolicyArr()
  })

  async function applyMiddleware () {
    const middleware = createGuardedMiddleware({
      policyResolver: async () => policyArr,
      emitter,
      chainId: 1,
      getAccountIndex: () => 0,
      onRejection: async (entry) => { await store.saveRejection(entry) },
      getPolicyVersion: async (acctIdx, cId) => store.getPolicyVersion(acctIdx, cId),
      journal: null
    })
    await middleware(account as never)
  }

  test('ALLOW repay: small amount executes immediately', async () => {
    await applyMiddleware()
    const events: string[] = []
    let policyDecision: unknown = undefined
    emitter.on('IntentProposed', (e: { type: string }) => events.push(e.type))
    emitter.on('PolicyEvaluated', (e: { type: string; decision: unknown }) => { events.push(e.type); policyDecision = e.decision })
    emitter.on('ExecutionBroadcasted', (e: { type: string }) => events.push(e.type))
    emitter.on('ExecutionSettled', (e: { type: string }) => events.push(e.type))

    const tx = makeRepayTx(500)
    const result = await account.sendTransaction(tx)

    expect(result.hash).toBe('0xhash123')
    expect(events).toContain('IntentProposed')
    expect(events).toContain('PolicyEvaluated')
    expect(events).toContain('ExecutionBroadcasted')
    expect(policyDecision).toBe('ALLOW')

    await new Promise(resolve => setTimeout(resolve, 100))
    expect(events).toContain('ExecutionSettled')
  })

  test('REJECT: unknown target throws PolicyRejectionError', async () => {
    await applyMiddleware()
    const tx = { to: '0x0000000000000000000000000000000000000099', value: 0, data: '0xdeadbeef' + '00'.repeat(32) }

    await expect(account.sendTransaction(tx)).rejects.toThrow(PolicyRejectionError)
  })

  test('sign() blocked', async () => {
    await applyMiddleware()
    expect(() => account.sign('hello')).toThrow(ForbiddenError)
  })

  test('signTypedData() blocked', async () => {
    await applyMiddleware()
    expect(() => account.signTypedData({})).toThrow(ForbiddenError)
  })

  test('keyPair blocked', async () => {
    await applyMiddleware()
    expect(() => account.keyPair).toThrow(ForbiddenError)
  })

  test('dispose() blocked', async () => {
    await applyMiddleware()
    expect(() => account.dispose()).toThrow(ForbiddenError)
  })

  test('approve to known spender + bounded amount -> ALLOW', async () => {
    await applyMiddleware()
    const tx = makeApproveTx(aavePool, 3000)
    const result = await account.sendTransaction(tx)
    expect(result.hash).toBe('0xhash123')
  })

  test('approve to unknown spender -> REJECT', async () => {
    await applyMiddleware()
    const tx = makeApproveTx('0x0000000000000000000000000000000000000099', 100)

    await expect(account.sendTransaction(tx)).rejects.toThrow(PolicyRejectionError)
  })

  test('approve with excessive amount -> REJECT', async () => {
    await applyMiddleware()
    const tx = makeApproveTx(aavePool, 99999)

    await expect(account.sendTransaction(tx)).rejects.toThrow(PolicyRejectionError)
  })

  test('settlement: ExecutionSettled event emitted', async () => {
    await applyMiddleware()
    const settled = new Promise(resolve => emitter.on('ExecutionSettled', resolve))

    const tx = makeRepayTx(500)
    await account.sendTransaction(tx)

    const event = await settled as { type: string; hash: string; status: number }
    expect(event.type).toBe('ExecutionSettled')
    expect(event.hash).toBe('0xhash123')
    expect(event.status).toBe(1)
  })

  test('ExecutionFailed event on sendTransaction error', async () => {
    account.sendTransaction = jest.fn(async () => { throw new Error('tx failed') }) as never
    await applyMiddleware()

    const failed = new Promise(resolve => emitter.on('ExecutionFailed', resolve))

    const tx = makeRepayTx(500)
    await expect(account.sendTransaction(tx)).rejects.toThrow('tx failed')

    const event = await failed as { type: string; error: string }
    expect(event.type).toBe('ExecutionFailed')
    expect(event.error).toBe('tx failed')
  })

  test('concurrent sendTransaction: independent policy evaluation', async () => {
    await applyMiddleware()

    const tx1 = makeRepayTx(500)
    const tx2 = { to: '0x0000000000000000000000000000000000000099', value: 0, data: '0xdeadbeef' + '00'.repeat(32) }

    const [r1, r2] = await Promise.allSettled([
      account.sendTransaction(tx1),
      account.sendTransaction(tx2)
    ])

    expect(r1.status).toBe('fulfilled')
    expect(r2.status).toBe('rejected')
    expect((r2 as PromiseRejectedResult).reason).toBeInstanceOf(PolicyRejectionError)
  })

  test('signTransaction: ALLOW repay returns signed tx', async () => {
    await applyMiddleware()

    const tx = makeRepayTx(500)
    const result = await account.signTransaction(tx) as unknown as { signedTx: string; intentHash: string; requestId: string }

    expect(result.signedTx).toBeDefined()
    expect(result.signedTx.startsWith('0x')).toBe(true)
    expect(result.intentHash).toBeDefined()
    expect(result.intentHash.startsWith('0x')).toBe(true)
    expect(result.requestId).toBeDefined()
  })

  test('signTransaction: REJECT throws PolicyRejectionError', async () => {
    await applyMiddleware()
    const tx = { to: '0x0000000000000000000000000000000000000099', value: 0, data: '0xdeadbeef' + '00'.repeat(32) }

    await expect(account.signTransaction(tx)).rejects.toThrow(PolicyRejectionError)
  })

  test('policy change at runtime: resolver returns new policies', async () => {
    await applyMiddleware()

    const tx = makeRepayTx(500)
    const result = await account.sendTransaction(tx)
    expect(result.hash).toBe('0xhash123')

    policyArr.length = 0
    policyArr.push({ type: 'call' as const, permissions: {} })

    await expect(account.sendTransaction(tx)).rejects.toThrow(PolicyRejectionError)
  })

  test('wallet-specific policy: different accountIndex uses different policies', async () => {
    let activeAccountIndex = 0
    const wallet0Policies = makePolicyArr()
    const wallet1Policies = [{ type: 'call' as const, permissions: {} }]

    const middleware = createGuardedMiddleware({
      policyResolver: async () => {
        return activeAccountIndex === 0 ? wallet0Policies : wallet1Policies
      },
      emitter,
      chainId: 1,
      getAccountIndex: () => activeAccountIndex,
      onRejection: async () => {},
      getPolicyVersion: async () => 0,
      journal: null
    })
    await middleware(account as never)

    activeAccountIndex = 0
    const tx = makeRepayTx(500)
    const result = await account.sendTransaction(tx)
    expect(result.hash).toBe('0xhash123')

    activeAccountIndex = 1
    await expect(account.sendTransaction(tx)).rejects.toThrow(PolicyRejectionError)
  })
})
