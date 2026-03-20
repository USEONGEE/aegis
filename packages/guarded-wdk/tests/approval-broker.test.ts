import { SignedApprovalBroker } from '../src/signed-approval-broker.js'
import { ApprovalStore } from '../src/approval-store.js'
import type { HistoryEntry, HistoryQueryOpts, ApprovalRequest } from '../src/approval-store.js'
import { generateKeyPair, sign } from '../src/crypto-utils.js'
import type { KeyPair } from '../src/crypto-utils.js'
import { canonicalJSON } from '@wdk-app/canonical'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'

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
  override async savePolicy (seedId: string, chain: string, policy: unknown, _description: string = '') { this._policies[`${seedId}:${chain}`] = policy }
  override async getPolicyVersion (_seedId: string, _chain: string) { return 0 }
  override async loadPendingApprovals (_seedId: string | null, type: string | null, chain: string | null) { return this._pending.filter(p => (!type || p.type === type) && (!chain || (p as any).chain === chain)) as never }
  override async savePendingApproval (_seedId: string, request: ApprovalRequest) { this._pending.push(request as ApprovalRequest & Record<string, unknown>) }
  override async removePendingApproval (requestId: string) { this._pending = this._pending.filter(p => p.requestId !== requestId) }
  override async appendHistory (entry: HistoryEntry) { this._history.push(entry) }
  override async getHistory (_opts?: HistoryQueryOpts) { return this._history as HistoryEntry[] }
  override async isSignerRevoked (signerId: string) { return this._signers[signerId]?.revoked === true }
  override async revokeSigner (signerId: string) { this._signers[signerId] = { revoked: true } }
  override async getLastNonce (approver: string, signerId: string) { return this._nonces[`${approver}:${signerId}`] || 0 }
  override async updateNonce (approver: string, signerId: string, nonce: number) { this._nonces[`${approver}:${signerId}`] = nonce }
}

function makeSignedApproval (keyPair: KeyPair, overrides: Record<string, unknown> = {}) {
  const approval: Record<string, unknown> = {
    type: 'policy',
    requestId: 'req-1',
    chainId: 1,
    targetHash: '0xabc123',
    approver: keyPair.publicKey,
    signerId: 'signer-1',
    policyVersion: 0,
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    nonce: 1,
    ...overrides
  }

  const { sig: _sig, ...fields } = approval
  const json = canonicalJSON(fields as unknown as Parameters<typeof canonicalJSON>[0])
  const hash = createHash('sha256').update(json).digest()
  approval.sig = sign(hash, keyPair.secretKey)

  return approval
}

describe('SignedApprovalBroker', () => {
  let broker: SignedApprovalBroker
  let store: MockApprovalStore
  let keyPair: KeyPair
  let emitter: EventEmitter

  beforeEach(() => {
    store = new MockApprovalStore()
    keyPair = generateKeyPair()
    emitter = new EventEmitter()
    broker = new SignedApprovalBroker([keyPair.publicKey], store, emitter)
  })

  afterEach(() => {
    broker.dispose()
  })

  test('createRequest creates a pending request for policy type', async () => {
    const request = await broker.createRequest('policy', {
      requestId: 'req-1',
      chainId: 1,
      targetHash: '0xabc123',
      accountIndex: 0,
      content: 'test'
    })
    expect(request.requestId).toBe('req-1')
    expect(request.type).toBe('policy')
    expect(request.chainId).toBe(1)
    expect(store._pending.length).toBe(1)
  })

  test('createRequest does NOT store pending for tx type', async () => {
    const request = await broker.createRequest('tx', {
      requestId: 'req-1',
      chainId: 1,
      targetHash: '0xabc123',
      accountIndex: 0,
      content: 'test'
    })
    expect(request.requestId).toBe('req-1')
    expect(store._pending.length).toBe(0)
  })

  test('createRequest generates requestId if not provided', async () => {
    const request = await broker.createRequest('policy', {
      chainId: 1,
      targetHash: '0xabc123',
      accountIndex: 0,
      content: 'test'
    })
    expect(request.requestId).toBeTruthy()
    expect(typeof request.requestId).toBe('string')
  })

  test('submitApproval records in history', async () => {
    await broker.createRequest('policy', {
      requestId: 'req-1',
      chainId: 1,
      targetHash: '0xabc123',
      accountIndex: 0,
      content: 'test'
    })
    const approval = makeSignedApproval(keyPair)
    await broker.submitApproval(approval as never)

    expect(store._history.length).toBe(1)
    expect(store._history[0].requestId).toBe('req-1')
    expect(store._history[0].action).toBe('approved')
  })

  test('submitApproval rejects untrusted approver', async () => {
    const otherKeyPair = generateKeyPair()
    const approval = makeSignedApproval(otherKeyPair)

    await expect(broker.submitApproval(approval as never)).rejects.toThrow('Approver not in trustedApprovers')
  })

  test('submitApproval rejects expired approval', async () => {
    const approval = makeSignedApproval(keyPair, {
      expiresAt: Math.floor(Date.now() / 1000) - 100
    })

    await expect(broker.submitApproval(approval as never)).rejects.toThrow('expired')
  })

  test('submitApproval rejects replayed nonce', async () => {
    await broker.createRequest('policy', {
      requestId: 'req-1',
      chainId: 1,
      targetHash: '0xabc123',
      accountIndex: 0,
      content: 'test'
    })
    const approval1 = makeSignedApproval(keyPair, { nonce: 1 })
    await broker.submitApproval(approval1 as never)

    const approval2 = makeSignedApproval(keyPair, { requestId: 'req-2', nonce: 1 })
    await expect(broker.submitApproval(approval2 as never)).rejects.toThrow('Nonce replay')
  })

  test('policy request stored as pending and removed on approval', async () => {
    await broker.createRequest('policy', {
      requestId: 'policy-1',
      chainId: 1,
      targetHash: '0xpolicyhash',
      accountIndex: 0,
      content: 'test'
    })

    expect(store._pending.length).toBe(1)

    const approval = makeSignedApproval(keyPair, {
      type: 'policy',
      requestId: 'policy-1',
      targetHash: '0xpolicyhash'
    })

    await broker.submitApproval(approval as never)

    expect(store._pending.length).toBe(0)
  })

  test('setTrustedApprovers updates the list', async () => {
    const newKeyPair = generateKeyPair()
    broker.setTrustedApprovers([newKeyPair.publicKey])

    const approval = makeSignedApproval(keyPair)
    await expect(broker.submitApproval(approval as never)).rejects.toThrow('Approver not in trustedApprovers')

    await broker.createRequest('policy', {
      requestId: 'req-2',
      chainId: 1,
      targetHash: '0xabc123',
      accountIndex: 0,
      content: 'test'
    })
    const approval2 = makeSignedApproval(newKeyPair, { requestId: 'req-2' })
    await broker.submitApproval(approval2 as never)
    expect(store._history.length).toBe(1)
  })

  test('dispose cleans up pending waiters', () => {
    broker.dispose()
  })

  test('emits ApprovalVerified event on successful submitApproval', async () => {
    const events: Array<{ type: string; approver: string }> = []
    emitter.on('ApprovalVerified', (e: { type: string; approver: string }) => events.push(e))

    await broker.createRequest('policy', {
      requestId: 'req-1',
      chainId: 1,
      targetHash: '0xabc123',
      accountIndex: 0,
      content: 'test'
    })
    const approval = makeSignedApproval(keyPair)
    await broker.submitApproval(approval as never)

    expect(events.length).toBe(1)
    expect(events[0].type).toBe('ApprovalVerified')
    expect(events[0].approver).toBe(keyPair.publicKey)
  })

  test('emits ApprovalRejected event on policy_reject', async () => {
    const events: Array<{ type: string; requestId: string; timestamp: number }> = []
    emitter.on('ApprovalRejected', (e: { type: string; requestId: string; timestamp: number }) => events.push(e))

    await broker.createRequest('policy', {
      requestId: 'policy-reject-1',
      chainId: 1,
      targetHash: '0xpolicyhash',
      accountIndex: 0,
      content: 'test'
    })

    const approval = makeSignedApproval(keyPair, {
      type: 'policy_reject',
      requestId: 'policy-reject-1',
      targetHash: '0xpolicyhash'
    })

    await broker.submitApproval(approval as never)

    expect(events.length).toBe(1)
    expect(events[0].type).toBe('ApprovalRejected')
    expect(events[0].requestId).toBe('policy-reject-1')
    expect(events[0].timestamp).toBeGreaterThan(0)
  })
})
