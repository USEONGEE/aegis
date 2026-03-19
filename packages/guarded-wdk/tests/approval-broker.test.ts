import { SignedApprovalBroker } from '../src/signed-approval-broker.js'
import { ApprovalStore } from '../src/approval-store.js'
import type { HistoryEntry, HistoryQueryOpts, ApprovalRequest } from '../src/approval-store.js'
import { ApprovalTimeoutError } from '../src/errors.js'
import { generateKeyPair, sign } from '../src/crypto-utils.js'
import type { KeyPair } from '../src/crypto-utils.js'
import { canonicalJSON } from '@wdk-app/canonical'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'

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
  override async loadPendingApprovals (_seedId: string | null, type: string | null, chain: string | null) { return this._pending.filter(p => (!type || p.type === type) && (!chain || (p as any).chain === chain)) as never }
  override async savePendingApproval (_seedId: string, request: ApprovalRequest) { this._pending.push(request as ApprovalRequest & Record<string, unknown>) }
  override async removePendingApproval (requestId: string) { this._pending = this._pending.filter(p => p.requestId !== requestId) }
  override async appendHistory (entry: HistoryEntry) { this._history.push(entry) }
  override async getHistory (_opts?: HistoryQueryOpts) { return this._history as HistoryEntry[] }
  override async isDeviceRevoked (deviceId: string) { return this._devices[deviceId]?.revoked === true }
  override async revokeDevice (deviceId: string) { this._devices[deviceId] = { revoked: true } }
  override async getLastNonce (approver: string, deviceId: string) { return this._nonces[`${approver}:${deviceId}`] || 0 }
  override async updateNonce (approver: string, deviceId: string, nonce: number) { this._nonces[`${approver}:${deviceId}`] = nonce }
}

function makeSignedApproval (keyPair: KeyPair, overrides: Record<string, unknown> = {}) {
  const approval: Record<string, unknown> = {
    type: 'tx',
    requestId: 'req-1',
    chainId: 1,
    targetHash: '0xabc123',
    approver: keyPair.publicKey,
    deviceId: 'device-1',
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

  test('createRequest creates a pending request', async () => {
    const request = await broker.createRequest('tx', {
      requestId: 'req-1',
      chainId: 1,
      targetHash: '0xabc123'
    })
    expect(request.requestId).toBe('req-1')
    expect(request.type).toBe('tx')
    expect(request.chainId).toBe(1)
  })

  test('createRequest generates requestId if not provided', async () => {
    const request = await broker.createRequest('tx', {
      chainId: 1,
      targetHash: '0xabc123'
    })
    expect(request.requestId).toBeTruthy()
    expect(typeof request.requestId).toBe('string')
  })

  test('submitApproval + waitForApproval resolves', async () => {
    const approval = makeSignedApproval(keyPair)
    const waitPromise = broker.waitForApproval('req-1', 5000)

    setTimeout(async () => {
      await broker.submitApproval(approval as never)
    }, 50)

    const result = await waitPromise
    expect(result.approver).toBe(keyPair.publicKey)
    expect(result.requestId).toBe('req-1')
  })

  test('waitForApproval times out', async () => {
    await expect(broker.waitForApproval('req-1', 300))
      .rejects.toThrow(ApprovalTimeoutError)
  })

  test('submitApproval records in history', async () => {
    const approval = makeSignedApproval(keyPair)
    broker.waitForApproval('req-1', 5000).catch(() => {})

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
    const approval1 = makeSignedApproval(keyPair, { nonce: 1 })
    broker.waitForApproval('req-1', 5000).catch(() => {})
    await broker.submitApproval(approval1 as never)

    const approval2 = makeSignedApproval(keyPair, { requestId: 'req-2', nonce: 1 })
    await expect(broker.submitApproval(approval2 as never)).rejects.toThrow('Nonce replay')
  })

  test('policy request stored as pending and removed on approval', async () => {
    const request = await broker.createRequest('policy', {
      requestId: 'policy-1',
      chainId: 1,
      targetHash: '0xpolicyhash',
      metadata: { seedId: 'seed-1' }
    })

    expect(store._pending.length).toBe(1)

    const approval = makeSignedApproval(keyPair, {
      type: 'policy',
      requestId: 'policy-1',
      targetHash: '0xpolicyhash'
    })

    broker.waitForApproval('policy-1', 5000).catch(() => {})
    await broker.submitApproval(approval as never)

    expect(store._pending.length).toBe(0)
  })

  test('setTrustedApprovers updates the list', async () => {
    const newKeyPair = generateKeyPair()
    broker.setTrustedApprovers([newKeyPair.publicKey])

    const approval = makeSignedApproval(keyPair)
    await expect(broker.submitApproval(approval as never)).rejects.toThrow('Approver not in trustedApprovers')

    const approval2 = makeSignedApproval(newKeyPair, { requestId: 'req-2' })
    broker.waitForApproval('req-2', 5000).catch(() => {})
    await broker.submitApproval(approval2 as never)
    expect(store._history.length).toBe(1)
  })

  test('dispose cleans up pending waiters', () => {
    const promise = broker.waitForApproval('req-1', 60000)
    broker.dispose()
    return expect(promise).rejects.toThrow('Broker disposed')
  })

  test('emits ApprovalVerified event on successful submitApproval', async () => {
    const events: Array<{ type: string; approver: string }> = []
    emitter.on('ApprovalVerified', (e: { type: string; approver: string }) => events.push(e))

    const approval = makeSignedApproval(keyPair)
    broker.waitForApproval('req-1', 5000).catch(() => {})
    await broker.submitApproval(approval as never)

    expect(events.length).toBe(1)
    expect(events[0].type).toBe('ApprovalVerified')
    expect(events[0].approver).toBe(keyPair.publicKey)
  })

  test('emits ApprovalRejected event on policy_reject', async () => {
    const events: Array<{ type: string; requestId: string; timestamp: number }> = []
    emitter.on('ApprovalRejected', (e: { type: string; requestId: string; timestamp: number }) => events.push(e))

    // Create a policy request first so removePending has something to remove
    await broker.createRequest('policy', {
      requestId: 'policy-reject-1',
      chainId: 1,
      targetHash: '0xpolicyhash',
      metadata: { seedId: 'seed-1' }
    })

    const approval = makeSignedApproval(keyPair, {
      type: 'policy_reject',
      requestId: 'policy-reject-1',
      targetHash: '0xpolicyhash'
    })

    const waitPromise = broker.waitForApproval('policy-reject-1', 5000)
    await broker.submitApproval(approval as never)

    // The waiter should be rejected
    await expect(waitPromise).rejects.toThrow('Policy rejected by owner')

    // ApprovalRejected event should have been emitted
    expect(events.length).toBe(1)
    expect(events[0].type).toBe('ApprovalRejected')
    expect(events[0].requestId).toBe('policy-reject-1')
    expect(events[0].timestamp).toBeGreaterThan(0)
  })
})
