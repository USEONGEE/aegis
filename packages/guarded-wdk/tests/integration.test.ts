import { jest } from '@jest/globals'
import { EventEmitter } from 'node:events'
import { createGuardedMiddleware, evaluatePolicy, validatePolicies, permissionsToDict, type ChainPolicies } from '../src/guarded-middleware.js'
import { SignedApprovalBroker } from '../src/signed-approval-broker.js'
import { ApprovalStore } from '../src/approval-store.js'
import type { HistoryEntry, HistoryQueryOpts, ApprovalRequest } from '../src/approval-store.js'
import { ForbiddenError, PolicyRejectionError } from '../src/errors.js'
import { intentHash } from '@wdk-app/canonical'
import { generateKeyPair, sign } from '../src/crypto-utils.js'
import type { KeyPair } from '../src/crypto-utils.js'
import { createHash } from 'node:crypto'
import { canonicalJSON } from '@wdk-app/canonical'

const aavePool = '0x1234567890abcdef1234567890abcdef12345678'
const usdcAddr = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const repaySelector = '0x573ade81'
const approveSelector = '0x095ea7b3'

class MockApprovalStore extends ApprovalStore {
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
  override async loadPolicy (seedId: string, chain: string) { return (this._policies[`${seedId}:${chain}`] || null) as never }
  override async savePolicy (seedId: string, chain: string, policy: unknown) { this._policies[`${seedId}:${chain}`] = policy }
  override async getPolicyVersion (_seedId: string, _chain: string) { return 0 }
  override async loadPendingApprovals (_seedId: string | null, _type: string | null, _chain: string | null) { return this._pending as never }
  override async savePendingApproval (_seedId: string, request: ApprovalRequest) { this._pending.push(request as ApprovalRequest & Record<string, unknown>) }
  override async removePendingApproval (requestId: string) { this._pending = this._pending.filter(p => p.requestId !== requestId) }
  override async appendHistory (entry: HistoryEntry) { this._history.push(entry) }
  override async getHistory (_opts?: HistoryQueryOpts) { return this._history as HistoryEntry[] }
  override async isSignerRevoked (_signerId: string) { return false }
  override async revokeSigner (signerId: string) { this._signers[signerId] = { revoked: true } }
  override async getLastNonce (approver: string, signerId: string) { return this._nonces[`${approver}:${signerId}`] || 0 }
  override async updateNonce (approver: string, signerId: string, nonce: number) { this._nonces[`${approver}:${signerId}`] = nonce }
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

function makePolicies () {
  return {
    1: {
      policies: [
        { type: 'timestamp' as const, validAfter: 1000000000, validUntil: 2000000000 },
        {
          type: 'call' as const,
          permissions: permissionsToDict([
            {
              target: aavePool,
              selector: repaySelector,
              args: { 1: { condition: 'LTE' as const, value: '1000' } },
              decision: 'AUTO' as const
            },
            {
              target: aavePool,
              selector: repaySelector,
              decision: 'REQUIRE_APPROVAL' as const
            },
            {
              target: usdcAddr,
              selector: approveSelector,
              args: {
                0: { condition: 'EQ' as const, value: aavePool },
                1: { condition: 'LTE' as const, value: '5000' }
              },
              decision: 'AUTO' as const
            }
          ])
        }
      ]
    }
  }
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

/**
 * Helper: create a valid SignedApproval and submit it to the broker.
 */
function createSignedApprovalAndSubmit (broker: SignedApprovalBroker, keyPair: KeyPair, { requestId, chainId, targetHash, nonce }: { requestId: string; chainId: number; targetHash: string; nonce: number }) {
  const approval: Record<string, unknown> = {
    type: 'tx',
    requestId,
    chainId,
    targetHash,
    approver: keyPair.publicKey,
    signerId: 'signer-1',
    policyVersion: 0,
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    nonce
  }

  const { sig: _sig, ...fields } = approval
  const json = canonicalJSON(fields as unknown as Parameters<typeof canonicalJSON>[0])
  const hash = createHash('sha256').update(json).digest()
  approval.sig = sign(hash, keyPair.secretKey)

  return broker.submitApproval(approval as never)
}

describe('Integration: Guarded Middleware', () => {
  let account: MockAccount
  let emitter: EventEmitter
  let broker: SignedApprovalBroker
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let policies: any
  let store: MockApprovalStore
  let keyPair: KeyPair

  beforeEach(() => {
    account = createMockAccount()
    emitter = new EventEmitter()
    store = new MockApprovalStore()
    keyPair = generateKeyPair()
    broker = new SignedApprovalBroker([keyPair.publicKey], store, emitter)
    policies = makePolicies()
  })

  afterEach(() => {
    broker.dispose()
  })

  async function applyMiddleware () {
    const middleware = createGuardedMiddleware({
      policiesRef: () => policies,
      approvalBroker: broker,
      emitter,
      chainId: 1
    })
    await middleware(account as never)
  }

  test('AUTO repay: small amount executes immediately', async () => {
    await applyMiddleware()
    const events: string[] = []
    let policyContext: unknown = undefined
    emitter.on('IntentProposed', (e: { type: string }) => events.push(e.type))
    emitter.on('PolicyEvaluated', (e: { type: string; context: unknown }) => { events.push(e.type); policyContext = e.context })
    emitter.on('ExecutionBroadcasted', (e: { type: string }) => events.push(e.type))
    emitter.on('ExecutionSettled', (e: { type: string }) => events.push(e.type))

    const tx = makeRepayTx(500)
    const result = await account.sendTransaction(tx)

    expect(result.hash).toBe('0xhash123')
    expect(events).toContain('IntentProposed')
    expect(events).toContain('PolicyEvaluated')
    expect(events).toContain('ExecutionBroadcasted')
    expect(policyContext).toBeNull()

    // Wait for settlement polling
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(events).toContain('ExecutionSettled')
  })

  test('REQUIRE_APPROVAL repay: waits for signed approval then executes', async () => {
    await applyMiddleware()
    const events: Array<{ type: string; requestId?: string; context?: unknown }> = []
    emitter.on('ApprovalRequested', (e: { type: string; requestId: string; context?: unknown }) => events.push(e))
    emitter.on('ApprovalGranted', (e: { type: string }) => events.push(e))
    emitter.on('ExecutionBroadcasted', (e: { type: string }) => events.push(e))

    const tx = makeRepayTx(5000)

    const targetHashForTx = intentHash({
      chainId: 1,
      to: tx.to,
      data: tx.data,
      value: tx.value || '0'
    })

    // Submit signed approval after a short delay
    setTimeout(async () => {
      try {
        await createSignedApprovalAndSubmit(broker, keyPair, {
          requestId: events.find(e => e.type === 'ApprovalRequested')?.requestId || '',
          chainId: 1,
          targetHash: targetHashForTx,
          nonce: 1
        })
      } catch {
        // If requestId not ready, we'll handle via listener
      }
    }, 50)

    // Use listener approach: wait for ApprovalRequested, then submit
    const requestIdPromise = new Promise<string>(resolve => {
      emitter.on('ApprovalRequested', (e: { requestId: string }) => resolve(e.requestId))
    })

    const txPromise = account.sendTransaction(tx)

    const requestId = await requestIdPromise
    await createSignedApprovalAndSubmit(broker, keyPair, {
      requestId,
      chainId: 1,
      targetHash: targetHashForTx,
      nonce: 2
    })

    const result = await txPromise
    expect(result.hash).toBe('0xhash123')
    const eventTypes = events.map(e => e.type)
    expect(eventTypes).toContain('ApprovalRequested')
    expect(eventTypes).toContain('ApprovalGranted')
    expect(eventTypes).toContain('ExecutionBroadcasted')
    const approvalEvt = events.find(e => e.type === 'ApprovalRequested')
    expect(approvalEvt?.context).toBeDefined()
    expect(approvalEvt?.context).not.toBeNull()
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

  test('approve to known spender + bounded amount -> AUTO', async () => {
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

    const tx1 = makeRepayTx(500) // AUTO
    const tx2 = { to: '0x0000000000000000000000000000000000000099', value: 0, data: '0xdeadbeef' + '00'.repeat(32) } // REJECT

    const [r1, r2] = await Promise.allSettled([
      account.sendTransaction(tx1),
      account.sendTransaction(tx2)
    ])

    expect(r1.status).toBe('fulfilled')
    expect(r2.status).toBe('rejected')
    expect((r2 as PromiseRejectedResult).reason).toBeInstanceOf(PolicyRejectionError)
  })

  test('signTransaction: AUTO repay returns signed tx', async () => {
    await applyMiddleware()

    const tx = makeRepayTx(500)
    const result = await account.signTransaction(tx) as unknown as { signedTx: string; intentHash: string; requestId: string; intentId: string }

    expect(result.signedTx).toBeDefined()
    expect(result.signedTx.startsWith('0x')).toBe(true)
    expect(result.intentHash).toBeDefined()
    expect(result.intentHash.startsWith('0x')).toBe(true)
    expect(result.requestId).toBeDefined()
    expect(result.intentId).toBeDefined()
  })

  test('signTransaction: REJECT throws PolicyRejectionError', async () => {
    await applyMiddleware()
    const tx = { to: '0x0000000000000000000000000000000000000099', value: 0, data: '0xdeadbeef' + '00'.repeat(32) }

    await expect(account.signTransaction(tx)).rejects.toThrow(PolicyRejectionError)
  })

  test('signTransaction: REQUIRE_APPROVAL waits for signed approval', async () => {
    await applyMiddleware()
    const events: Array<{ type: string; requestId?: string; context?: unknown }> = []
    emitter.on('ApprovalRequested', (e: { type: string; requestId: string; context?: unknown }) => events.push(e))
    emitter.on('TransactionSigned', (e: { type: string }) => events.push(e))

    const tx = makeRepayTx(5000)

    const targetHashForTx = intentHash({
      chainId: 1,
      to: tx.to,
      data: tx.data,
      value: tx.value || '0'
    })

    // Use listener approach: wait for ApprovalRequested, then submit
    const requestIdPromise = new Promise<string>(resolve => {
      emitter.on('ApprovalRequested', (e: { requestId: string }) => resolve(e.requestId))
    })

    const signPromise = account.signTransaction(tx)

    const requestId = await requestIdPromise
    await createSignedApprovalAndSubmit(broker, keyPair, {
      requestId,
      chainId: 1,
      targetHash: targetHashForTx,
      nonce: 2
    })

    const result = await signPromise as unknown as { signedTx: string; intentHash: string }
    expect(result.signedTx).toBeDefined()
    expect(result.signedTx.startsWith('0x')).toBe(true)
    expect(result.intentHash).toBeDefined()
    const eventTypes = events.map(e => e.type)
    expect(eventTypes).toContain('ApprovalRequested')
    expect(eventTypes).toContain('TransactionSigned')
    const signApprovalEvt = events.find(e => e.type === 'ApprovalRequested')
    expect(signApprovalEvt?.context).toBeDefined()
    expect(signApprovalEvt?.context).not.toBeNull()
  })

  test('updatePolicies snapshot: old policy preserved for in-flight', async () => {
    await applyMiddleware()

    // First call: repay 500 -> AUTO
    const tx = makeRepayTx(500)
    const result = await account.sendTransaction(tx)
    expect(result.hash).toBe('0xhash123')

    // Update policies to reject everything
    policies[1] = { policies: [{ type: 'call' as const, permissions: {} }] }

    // Next call should REJECT
    await expect(account.sendTransaction(tx)).rejects.toThrow(PolicyRejectionError)
  })
})
