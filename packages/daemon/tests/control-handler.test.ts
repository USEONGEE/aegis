import { jest } from '@jest/globals'
import { createHash } from 'node:crypto'
import { handleControlMessage } from '../src/control-handler.js'
import type { ControlMessage, SignedApprovalFields, CancelCompletedEvent, CancelFailedEvent } from '@wdk-app/protocol'
import type { CancelEventPayload } from '../src/control-handler.js'

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

function createMockFacade (overrides: Record<string, any> = {}): any {
  return {
    submitApproval: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    setTrustedApprovers: jest.fn(),
    ...overrides
  }
}

function createMockQueueManager (): any {
  return {
    cancelQueued: jest.fn().mockReturnValue({ ok: true }),
    cancelActive: jest.fn().mockReturnValue({ ok: true })
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
  let facade: any
  let queueManager: any

  const signerRegistrar = { saveSigner: async () => {}, refreshTrustedApprovers: async () => {} }

  beforeEach(() => {
    logger = createMockLogger()
    facade = createMockFacade()
    queueManager = createMockQueueManager()
  })

  // -------------------------------------------------------------------------
  // Malformed messages
  // -------------------------------------------------------------------------

  test('returns null for message with missing type', async () => {
    const msg = { payload: { requestId: 'r1' } } as any
    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar })

    expect(result).toBeNull()
    expect(logger.warn).toHaveBeenCalled()
  })

  test('returns null for message with missing payload', async () => {
    const msg = { type: 'policy_approval' } as any
    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar })

    expect(result).toBeNull()
  })

  // -------------------------------------------------------------------------
  // policy_approval — v0.4.2: returns null (WDK events replace ControlResult)
  // -------------------------------------------------------------------------

  test('policy_approval: calls facade.submitApproval and returns null', async () => {
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

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar })

    expect(result).toBeNull()
    expect(facade.submitApproval).toHaveBeenCalledWith(expect.objectContaining({
      type: 'policy',
      requestId: 'req_pol_1'
    }), expect.objectContaining({ kind: 'policy_approval' }))
  })

  test('policy_approval: broker failure returns null (ApprovalFailed event handles error)', async () => {
    facade.submitApproval.mockRejectedValue(new Error('Verification failed'))

    const msg: ControlMessage = {
      type: 'policy_approval',
      payload: {
        ...defaultApprovalFields({ requestId: 'req_pol_fail' }),
        policies: []
      }
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar })

    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // policy_reject — v0.4.2: returns null
  // -------------------------------------------------------------------------

  test('policy_reject: calls facade.submitApproval and returns null', async () => {
    const msg: ControlMessage = {
      type: 'policy_reject',
      payload: defaultApprovalFields({
        requestId: 'req_rej_1',
        signature: '0xsig'
      })
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar })

    expect(result).toBeNull()
    expect(facade.submitApproval).toHaveBeenCalledWith(expect.objectContaining({
      type: 'policy_reject',
      requestId: 'req_rej_1'
    }), expect.objectContaining({ kind: 'policy_reject' }))
  })

  // -------------------------------------------------------------------------
  // device_revoke — v0.4.2: returns null, no setTrustedApprovers (broker internal)
  // -------------------------------------------------------------------------

  test('device_revoke: calls facade.submitApproval and returns null', async () => {
    const signerToRevoke = '0xpubkey_to_revoke'
    const expectedHash = '0x' + createHash('sha256').update(signerToRevoke).digest('hex')

    const msg: ControlMessage = {
      type: 'device_revoke',
      payload: { ...defaultApprovalFields({
        requestId: 'req_rev_1',
        signerId: signerToRevoke
      }), targetPublicKey: signerToRevoke }
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar })

    expect(result).toBeNull()
    expect(facade.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'device_revoke' }),
      expect.objectContaining({ kind: 'device_revoke', expectedTargetHash: expectedHash })
    )
  })

  test('device_revoke: does NOT call facade.setTrustedApprovers (moved to broker internal)', async () => {
    const msg: ControlMessage = {
      type: 'device_revoke',
      payload: { ...defaultApprovalFields({
        requestId: 'req_rev_2',
        signerId: '0xdev_x'
      }), targetPublicKey: '0xdev_x' }
    }

    await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar })

    expect(facade.setTrustedApprovers).not.toHaveBeenCalled()
  })

  test('device_revoke: broker failure returns null', async () => {
    facade.submitApproval.mockRejectedValue(new Error('Revocation denied'))

    const msg: ControlMessage = {
      type: 'device_revoke',
      payload: { ...defaultApprovalFields({
        requestId: 'req_rev_3',
        signerId: '0xdev_y'
      }), targetPublicKey: '0xdev_y' }
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar })

    expect(result).toBeNull()
  })

  // -------------------------------------------------------------------------
  // tx_approval — v0.4.2: returns null
  // -------------------------------------------------------------------------

  test('tx_approval: calls facade.submitApproval and returns null', async () => {
    const msg: ControlMessage = {
      type: 'tx_approval',
      payload: defaultApprovalFields({
        requestId: 'req_tx_1',
        targetHash: '0xtxhash'
      })
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar })

    expect(result).toBeNull()
    expect(facade.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tx', requestId: 'req_tx_1' }),
      expect.objectContaining({ kind: 'tx', expectedTargetHash: '0xtxhash' })
    )
  })

  // -------------------------------------------------------------------------
  // wallet_create / wallet_delete — v0.4.2: returns null
  // -------------------------------------------------------------------------

  test('wallet_create: calls facade.submitApproval and returns null', async () => {
    const msg: ControlMessage = {
      type: 'wallet_create',
      payload: defaultApprovalFields({ requestId: 'req_wc_1' })
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar })

    expect(result).toBeNull()
    expect(facade.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'wallet_create' }),
      expect.objectContaining({ kind: 'wallet_create' })
    )
  })

  test('wallet_delete: calls facade.submitApproval and returns null', async () => {
    const msg: ControlMessage = {
      type: 'wallet_delete',
      payload: defaultApprovalFields({ requestId: 'req_wd_1' })
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar })

    expect(result).toBeNull()
    expect(facade.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'wallet_delete' }),
      expect.objectContaining({ kind: 'wallet_delete' })
    )
  })

  // -------------------------------------------------------------------------
  // cancel_queued — v0.4.8: CancelEventPayload 반환
  // -------------------------------------------------------------------------

  test('cancel_queued: returns CancelFailed when messageId is missing', async () => {
    const msg: ControlMessage = {
      type: 'cancel_queued',
      payload: { messageId: '' }
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar }) as CancelFailedEvent

    expect(result).not.toBeNull()
    expect(result.type).toBe('CancelFailed')
    expect(result.cancelType).toBe('cancel_queued')
    expect(result.reason).toBe('Missing messageId')
  })

  test('cancel_queued: returns CancelCompleted on success', async () => {
    queueManager.cancelQueued.mockReturnValue({ ok: true, wasProcessing: false })
    const msg: ControlMessage = {
      type: 'cancel_queued',
      payload: { messageId: 'msg-123' }
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar }) as CancelCompletedEvent

    expect(result).not.toBeNull()
    expect(result.type).toBe('CancelCompleted')
    expect(result.cancelType).toBe('cancel_queued')
    expect(result.messageId).toBe('msg-123')
    expect(result.wasProcessing).toBe(false)
    expect(queueManager.cancelQueued).toHaveBeenCalledWith('msg-123')
  })

  test('cancel_queued: returns CancelFailed for not_found', async () => {
    queueManager.cancelQueued.mockReturnValue({ ok: false, reason: 'not_found' })
    const msg: ControlMessage = {
      type: 'cancel_queued',
      payload: { messageId: 'msg-active' }
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar }) as CancelFailedEvent

    expect(result).not.toBeNull()
    expect(result.type).toBe('CancelFailed')
    expect(result.reason).toBe('not_found')
  })

  // -------------------------------------------------------------------------
  // cancel_active — v0.4.8: CancelEventPayload 반환
  // -------------------------------------------------------------------------

  test('cancel_active: returns CancelFailed when messageId is missing', async () => {
    const msg: ControlMessage = {
      type: 'cancel_active',
      payload: { messageId: '' }
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar }) as CancelFailedEvent

    expect(result).not.toBeNull()
    expect(result.type).toBe('CancelFailed')
    expect(result.cancelType).toBe('cancel_active')
    expect(result.reason).toBe('Missing messageId')
  })

  test('cancel_active: returns CancelCompleted on success', async () => {
    queueManager.cancelActive.mockReturnValue({ ok: true, wasProcessing: true })
    const msg: ControlMessage = {
      type: 'cancel_active',
      payload: { messageId: 'msg-456' }
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar }) as CancelCompletedEvent

    expect(result).not.toBeNull()
    expect(result.type).toBe('CancelCompleted')
    expect(result.cancelType).toBe('cancel_active')
    expect(result.messageId).toBe('msg-456')
    expect(result.wasProcessing).toBe(true)
    expect(queueManager.cancelActive).toHaveBeenCalledWith('msg-456')
  })

  test('cancel_active: returns CancelFailed for not_found', async () => {
    queueManager.cancelActive.mockReturnValue({ ok: false, reason: 'not_found' })
    const msg: ControlMessage = {
      type: 'cancel_active',
      payload: { messageId: 'msg-queued' }
    }

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar }) as CancelFailedEvent

    expect(result).not.toBeNull()
    expect(result.type).toBe('CancelFailed')
    expect(result.reason).toBe('not_found')
  })

  // -------------------------------------------------------------------------
  // Unknown type
  // -------------------------------------------------------------------------

  test('unknown type: returns null and logs warning', async () => {
    const msg = {
      type: 'banana',
      payload: { requestId: 'r1' }
    } as any

    const result = await handleControlMessage(msg, { facade, logger: logger as any, queueManager, signerRegistrar })

    expect(result).toBeNull()
    expect(logger.warn).toHaveBeenCalled()
  })
})
