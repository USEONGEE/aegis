import { jest } from '@jest/globals'
import { createHash } from 'node:crypto'
import { handleControlMessage } from '../src/control-handler.js'
import type { ControlMessage, ControlResult, SignedApprovalFields } from '@wdk-app/protocol'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface MockLogger {
  info: jest.Mock
  warn: jest.Mock
  error: jest.Mock
  debug: jest.Mock
}

function createMockLogger (): MockLogger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}

function createMockBroker (overrides: Record<string, any> = {}): any {
  return {
    submitApproval: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    setTrustedApprovers: jest.fn(),
    ...overrides
  }
}

function createMockStore (overrides: Record<string, any> = {}): any {
  return {
    saveSigner: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    listSigners: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    savePolicy: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    loadPendingByRequestId: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    getPolicyVersion: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    ...overrides
  }
}

/**
 * Factory that returns default SignedApprovalFields. Tests override specific fields.
 */
function defaultApprovalFields (overrides: Partial<SignedApprovalFields> = {}): SignedApprovalFields {
  return {
    requestId: '',
    signature: '',
    approverPubKey: '',
    chainId: 0,
    accountIndex: 0,
    signerId: '',
    targetHash: '',
    policyVersion: 0,
    expiresAt: 0,
    nonce: 0,
    content: '',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleControlMessage', () => {
  let logger: MockLogger
  let broker: any
  let store: any

  beforeEach(() => {
    logger = createMockLogger()
    broker = createMockBroker()
    store = createMockStore()
  })

  // -------------------------------------------------------------------------
  // Malformed messages
  // -------------------------------------------------------------------------

  test('returns error for message with missing type', async () => {
    const msg = { payload: { requestId: 'r1' } } as any
    const result = await handleControlMessage(msg, broker, logger as any)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Malformed control message')
    expect(logger.warn).toHaveBeenCalled()
  })

  test('returns error for message with missing payload', async () => {
    const msg = { type: 'policy_approval' } as any
    const result = await handleControlMessage(msg, broker, logger as any)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Malformed control message')
  })

  // -------------------------------------------------------------------------
  // pairing_confirm
  // -------------------------------------------------------------------------

  test('pairing_confirm: calls store.saveSigner with correct args', async () => {
    const pairingSession = {
      pairingToken: 'tok_abc',
      expectedSAS: '1234',
      daemonEncryptionPubKey: new Uint8Array(32),
      daemonEncryptionSecretKey: new Uint8Array(32),
      createdAt: Date.now()
    }
    const msg: ControlMessage = {
      type: 'pairing_confirm',
      payload: {
        signerId: 'signer_1',
        identityPubKey: '0xpubkey123',
        encryptionPubKey: '0xenckey456',
        pairingToken: 'tok_abc',
        sas: '1234'
      }
    }

    const result = await handleControlMessage(msg, broker, logger as any, undefined, store, pairingSession)

    expect(result.ok).toBe(true)
    expect(result.type).toBe('pairing_confirm')
    expect(store.saveSigner).toHaveBeenCalledWith('0xpubkey123')
  })

  test('pairing_confirm: adds identityPubKey to trusted approvers', async () => {
    // After saveSigner, listSigners returns the newly added signer
    store.listSigners.mockResolvedValue([
      { publicKey: '0xnewkey', revokedAt: null }
    ])
    const pairingSession = {
      pairingToken: 'tok_pair',
      expectedSAS: '5678',
      daemonEncryptionPubKey: new Uint8Array(32),
      daemonEncryptionSecretKey: new Uint8Array(32),
      createdAt: Date.now()
    }
    const msg: ControlMessage = {
      type: 'pairing_confirm',
      payload: {
        signerId: 'signer_2',
        identityPubKey: '0xnewkey',
        encryptionPubKey: '',
        pairingToken: 'tok_pair',
        sas: '5678'
      }
    }

    await handleControlMessage(msg, broker, logger as any, undefined, store, pairingSession)

    expect(broker.setTrustedApprovers).toHaveBeenCalledWith(['0xnewkey'])
  })

  test('pairing_confirm: returns error when identityPubKey is missing', async () => {
    const msg: ControlMessage = {
      type: 'pairing_confirm',
      payload: {
        signerId: '',
        identityPubKey: '',
        encryptionPubKey: '',
        pairingToken: '',
        sas: ''
      }
    }

    const result = await handleControlMessage(msg, broker, logger as any)

    expect(result.ok).toBe(false)
    expect(result.type).toBe('pairing_confirm')
    expect(result.error).toBe('Missing identityPubKey')
  })

  // -------------------------------------------------------------------------
  // policy_approval
  // -------------------------------------------------------------------------

  test('policy_approval: calls broker.submitApproval with type "policy"', async () => {
    const msg: ControlMessage = {
      type: 'policy_approval',
      payload: {
        ...defaultApprovalFields({
          requestId: 'req_pol_1',
          signature: '0xsig'
        }),
        policies: []
      }
    }

    const result = await handleControlMessage(msg, broker, logger as any)

    expect(result.ok).toBe(true)
    expect(result.type).toBe('policy_approval')
    expect(result.requestId).toBe('req_pol_1')
    expect(broker.submitApproval).toHaveBeenCalledWith(expect.objectContaining({
      type: 'policy',
      requestId: 'req_pol_1'
    }), expect.any(Object))
  })

  test('policy_approval: saves policies to store when payload.policies present', async () => {
    const msg: ControlMessage = {
      type: 'policy_approval',
      payload: {
        ...defaultApprovalFields({
          requestId: 'req_pol_2',
          chainId: 1,
          accountIndex: 0
        }),
        policies: [{ type: 'auto', maxUsd: 500 }]
      }
    }

    await handleControlMessage(msg, broker, logger as any, undefined, store)

    expect(store.savePolicy).toHaveBeenCalledWith(0, 1, {
      policies: [{ type: 'auto', maxUsd: 500 }],
      signature: {}
    }, '')
  })

  test('E5: policy_approval passes pending.content as description to savePolicy', async () => {
    store.loadPendingByRequestId.mockResolvedValue({
      requestId: 'req_pol_desc',
      accountIndex: 0,
      type: 'policy',
      chainId: 1,
      targetHash: '0xhash',
      content: 'Increase daily limit to 500',
      createdAt: Date.now()
    })

    const msg: ControlMessage = {
      type: 'policy_approval',
      payload: {
        ...defaultApprovalFields({
          requestId: 'req_pol_desc',
          chainId: 1,
          accountIndex: 0
        }),
        policies: [{ type: 'auto', maxUsd: 500 }]
      }
    }

    await handleControlMessage(msg, broker, logger as any, undefined, store)

    expect(store.savePolicy).toHaveBeenCalledWith(0, 1, {
      policies: [{ type: 'auto', maxUsd: 500 }],
      signature: {}
    }, 'Increase daily limit to 500')
  })

  test('policy_approval: broker failure prevents savePolicy', async () => {
    broker.submitApproval.mockRejectedValue(new Error('Verification failed'))

    const msg: ControlMessage = {
      type: 'policy_approval',
      payload: {
        ...defaultApprovalFields({
          requestId: 'req_pol_fail',
          chainId: 1,
          accountIndex: 0
        }),
        policies: [{ type: 'auto', maxUsd: 500 }]
      }
    }

    const result = await handleControlMessage(msg, broker, logger as any, undefined, store)

    expect(result.ok).toBe(false)
    expect(store.savePolicy).not.toHaveBeenCalled()
  })

  test('policy_approval: returns error when broker.submitApproval throws', async () => {
    broker.submitApproval.mockRejectedValue(new Error('Policy verification failed'))

    const msg: ControlMessage = {
      type: 'policy_approval',
      payload: {
        ...defaultApprovalFields({ requestId: 'req_pol_3' }),
        policies: []
      }
    }

    const result = await handleControlMessage(msg, broker, logger as any)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Policy verification failed')
  })

  // -------------------------------------------------------------------------
  // policy_reject
  // -------------------------------------------------------------------------

  test('policy_reject: calls broker.submitApproval with type "policy_reject"', async () => {
    const msg: ControlMessage = {
      type: 'policy_reject',
      payload: defaultApprovalFields({
        requestId: 'req_rej_1',
        signature: '0xsig'
      })
    }

    const result = await handleControlMessage(msg, broker, logger as any)

    expect(result.ok).toBe(true)
    expect(result.type).toBe('policy_reject')
    expect(broker.submitApproval).toHaveBeenCalledWith(expect.objectContaining({
      type: 'policy_reject',
      requestId: 'req_rej_1'
    }))
  })

  // -------------------------------------------------------------------------
  // device_revoke
  // -------------------------------------------------------------------------

  test('device_revoke: calls broker.submitApproval with expectedTargetHash', async () => {
    const signerToRevoke = '0xpubkey_to_revoke'
    const expectedHash = '0x' + createHash('sha256').update(signerToRevoke).digest('hex')

    store.listSigners.mockResolvedValue([
      { publicKey: '0xactive1', revokedAt: null },
      { publicKey: '0xrevoked', revokedAt: new Date() }
    ])

    const msg: ControlMessage = {
      type: 'device_revoke',
      payload: { ...defaultApprovalFields({
        requestId: 'req_rev_1',
        signerId: signerToRevoke
      }), targetPublicKey: signerToRevoke }
    }

    const result = await handleControlMessage(msg, broker, logger as any, undefined, store)

    expect(result.ok).toBe(true)
    expect(result.type).toBe('device_revoke')
    expect(broker.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'device_revoke'
      }),
      { expectedTargetHash: expectedHash }
    )
  })

  test('device_revoke: updates trusted approvers to only active signers', async () => {
    store.listSigners.mockResolvedValue([
      { publicKey: '0xactive1', revokedAt: null },
      { publicKey: '0xactive2', revokedAt: null },
      { publicKey: '0xrevoked', revokedAt: new Date() }
    ])

    const msg: ControlMessage = {
      type: 'device_revoke',
      payload: { ...defaultApprovalFields({
        requestId: 'req_rev_2',
        signerId: '0xdev_x'
      }), targetPublicKey: '0xdev_x' }
    }

    await handleControlMessage(msg, broker, logger as any, undefined, store)

    expect(broker.setTrustedApprovers).toHaveBeenCalledWith(['0xactive1', '0xactive2'])
  })

  test('device_revoke: returns error when broker.submitApproval throws', async () => {
    broker.submitApproval.mockRejectedValue(new Error('Revocation denied'))

    const msg: ControlMessage = {
      type: 'device_revoke',
      payload: { ...defaultApprovalFields({
        requestId: 'req_rev_3',
        signerId: '0xdev_y'
      }), targetPublicKey: '0xdev_y' }
    }

    const result = await handleControlMessage(msg, broker, logger as any)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Revocation denied')
  })

  // -------------------------------------------------------------------------
  // cancel_queued
  // -------------------------------------------------------------------------

  test('cancel_queued: returns error when messageId is missing', async () => {
    const mockQueueManager = {
      cancelQueued: jest.fn(),
      cancelActive: jest.fn()
    }
    const msg: ControlMessage = {
      type: 'cancel_queued',
      payload: { messageId: '' }
    }

    const result = await handleControlMessage(msg, broker, logger as any, undefined, undefined, undefined, mockQueueManager as any)

    expect(result.ok).toBe(false)
    expect(result.type).toBe('cancel_queued')
    expect(result.error).toBe('Missing messageId or queue')
  })

  test('cancel_queued: returns error when queueManager is missing', async () => {
    const msg: ControlMessage = {
      type: 'cancel_queued',
      payload: { messageId: 'msg-123' }
    }

    const result = await handleControlMessage(msg, broker, logger as any)

    expect(result.ok).toBe(false)
    expect(result.type).toBe('cancel_queued')
    expect(result.error).toBe('Missing messageId or queue')
  })

  test('cancel_queued: successfully cancels queued message', async () => {
    const mockQueueManager = {
      cancelQueued: jest.fn().mockReturnValue({ ok: true, wasProcessing: false }),
      cancelActive: jest.fn()
    }
    const msg: ControlMessage = {
      type: 'cancel_queued',
      payload: { messageId: 'msg-123' }
    }

    const result = await handleControlMessage(msg, broker, logger as any, undefined, undefined, undefined, mockQueueManager as any)

    expect(result.ok).toBe(true)
    expect(result.type).toBe('cancel_queued')
    expect(result.messageId).toBe('msg-123')
    expect(mockQueueManager.cancelQueued).toHaveBeenCalledWith('msg-123')
  })

  test('E2: cancel_queued for already-processing message returns not_found', async () => {
    const mockQueueManager = {
      cancelQueued: jest.fn().mockReturnValue({ ok: false, reason: 'not_found' }),
      cancelActive: jest.fn()
    }
    const msg: ControlMessage = {
      type: 'cancel_queued',
      payload: { messageId: 'msg-active' }
    }

    const result = await handleControlMessage(msg, broker, logger as any, undefined, undefined, undefined, mockQueueManager as any)

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('not_found')
  })

  // -------------------------------------------------------------------------
  // cancel_active
  // -------------------------------------------------------------------------

  test('cancel_active: returns error when messageId is missing', async () => {
    const mockQueueManager = {
      cancelQueued: jest.fn(),
      cancelActive: jest.fn()
    }
    const msg: ControlMessage = {
      type: 'cancel_active',
      payload: { messageId: '' }
    }

    const result = await handleControlMessage(msg, broker, logger as any, undefined, undefined, undefined, mockQueueManager as any)

    expect(result.ok).toBe(false)
    expect(result.type).toBe('cancel_active')
    expect(result.error).toBe('Missing messageId or queue')
  })

  test('cancel_active: returns error when queueManager is missing', async () => {
    const msg: ControlMessage = {
      type: 'cancel_active',
      payload: { messageId: 'msg-123' }
    }

    const result = await handleControlMessage(msg, broker, logger as any)

    expect(result.ok).toBe(false)
    expect(result.type).toBe('cancel_active')
    expect(result.error).toBe('Missing messageId or queue')
  })

  test('cancel_active: successfully cancels active message', async () => {
    const mockQueueManager = {
      cancelQueued: jest.fn(),
      cancelActive: jest.fn().mockReturnValue({ ok: true, wasProcessing: true })
    }
    const msg: ControlMessage = {
      type: 'cancel_active',
      payload: { messageId: 'msg-456' }
    }

    const result = await handleControlMessage(msg, broker, logger as any, undefined, undefined, undefined, mockQueueManager as any)

    expect(result.ok).toBe(true)
    expect(result.type).toBe('cancel_active')
    expect(result.messageId).toBe('msg-456')
    expect(result.wasProcessing).toBe(true)
    expect(mockQueueManager.cancelActive).toHaveBeenCalledWith('msg-456')
  })

  test('E3: cancel_active for queued (not yet processing) message returns not_found', async () => {
    const mockQueueManager = {
      cancelQueued: jest.fn(),
      cancelActive: jest.fn().mockReturnValue({ ok: false, reason: 'not_found' })
    }
    const msg: ControlMessage = {
      type: 'cancel_active',
      payload: { messageId: 'msg-queued' }
    }

    const result = await handleControlMessage(msg, broker, logger as any, undefined, undefined, undefined, mockQueueManager as any)

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('not_found')
  })

  // -------------------------------------------------------------------------
  // Unknown type
  // -------------------------------------------------------------------------

  test('unknown type: returns error with unknown type message', async () => {
    const msg = {
      type: 'banana',
      payload: { requestId: 'r1' }
    } as any

    const result = await handleControlMessage(msg, broker, logger as any)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Unknown control type: banana')
    expect(logger.warn).toHaveBeenCalled()
  })
})
