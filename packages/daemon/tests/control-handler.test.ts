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
  let broker: any
  let queueManager: any

  beforeEach(() => {
    logger = createMockLogger()
    broker = createMockBroker()
    queueManager = createMockQueueManager()
  })

  // -------------------------------------------------------------------------
  // Malformed messages
  // -------------------------------------------------------------------------

  test('returns error for message with missing type', async () => {
    const msg = { payload: { requestId: 'r1' } } as any
    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).not.toBeNull()
    expect(result!.ok).toBe(false)
    expect((result as any).error).toBe('Malformed control message')
    expect(logger.warn).toHaveBeenCalled()
  })

  test('returns error for message with missing payload', async () => {
    const msg = { type: 'policy_approval' } as any
    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).not.toBeNull()
    expect(result!.ok).toBe(false)
    expect((result as any).error).toBe('Malformed control message')
  })

  // -------------------------------------------------------------------------
  // policy_approval — v0.4.2: returns null (WDK events replace ControlResult)
  // -------------------------------------------------------------------------

  test('policy_approval: calls broker.submitApproval and returns null', async () => {
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

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).toBeNull()
    expect(broker.submitApproval).toHaveBeenCalledWith(expect.objectContaining({
      type: 'policy',
      requestId: 'req_pol_1'
    }), expect.objectContaining({ kind: 'policy_approval' }))
  })

  test('policy_approval: broker failure returns null (ApprovalFailed event handles error)', async () => {
    broker.submitApproval.mockRejectedValue(new Error('Verification failed'))

    const msg: ControlMessage = {
      type: 'policy_approval',
      payload: {
        ...defaultApprovalFields({ requestId: 'req_pol_fail' }),
        policies: []
      }
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // policy_reject — v0.4.2: returns null
  // -------------------------------------------------------------------------

  test('policy_reject: calls broker.submitApproval and returns null', async () => {
    const msg: ControlMessage = {
      type: 'policy_reject',
      payload: defaultApprovalFields({
        requestId: 'req_rej_1',
        signature: '0xsig'
      })
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).toBeNull()
    expect(broker.submitApproval).toHaveBeenCalledWith(expect.objectContaining({
      type: 'policy_reject',
      requestId: 'req_rej_1'
    }), expect.objectContaining({ kind: 'policy_reject' }))
  })

  // -------------------------------------------------------------------------
  // device_revoke — v0.4.2: returns null, no setTrustedApprovers (broker internal)
  // -------------------------------------------------------------------------

  test('device_revoke: calls broker.submitApproval and returns null', async () => {
    const signerToRevoke = '0xpubkey_to_revoke'
    const expectedHash = '0x' + createHash('sha256').update(signerToRevoke).digest('hex')

    const msg: ControlMessage = {
      type: 'device_revoke',
      payload: { ...defaultApprovalFields({
        requestId: 'req_rev_1',
        signerId: signerToRevoke
      }), targetPublicKey: signerToRevoke }
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).toBeNull()
    expect(broker.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'device_revoke' }),
      expect.objectContaining({ kind: 'device_revoke', expectedTargetHash: expectedHash })
    )
  })

  test('device_revoke: does NOT call broker.setTrustedApprovers (moved to broker internal)', async () => {
    const msg: ControlMessage = {
      type: 'device_revoke',
      payload: { ...defaultApprovalFields({
        requestId: 'req_rev_2',
        signerId: '0xdev_x'
      }), targetPublicKey: '0xdev_x' }
    }

    await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(broker.setTrustedApprovers).not.toHaveBeenCalled()
  })

  test('device_revoke: broker failure returns null', async () => {
    broker.submitApproval.mockRejectedValue(new Error('Revocation denied'))

    const msg: ControlMessage = {
      type: 'device_revoke',
      payload: { ...defaultApprovalFields({
        requestId: 'req_rev_3',
        signerId: '0xdev_y'
      }), targetPublicKey: '0xdev_y' }
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).toBeNull()
  })

  // -------------------------------------------------------------------------
  // tx_approval — v0.4.2: returns null
  // -------------------------------------------------------------------------

  test('tx_approval: calls broker.submitApproval and returns null', async () => {
    const msg: ControlMessage = {
      type: 'tx_approval',
      payload: defaultApprovalFields({
        requestId: 'req_tx_1',
        targetHash: '0xtxhash'
      })
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).toBeNull()
    expect(broker.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tx', requestId: 'req_tx_1' }),
      expect.objectContaining({ kind: 'tx', expectedTargetHash: '0xtxhash' })
    )
  })

  // -------------------------------------------------------------------------
  // wallet_create / wallet_delete — v0.4.2: returns null
  // -------------------------------------------------------------------------

  test('wallet_create: calls broker.submitApproval and returns null', async () => {
    const msg: ControlMessage = {
      type: 'wallet_create',
      payload: defaultApprovalFields({ requestId: 'req_wc_1' })
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).toBeNull()
    expect(broker.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'wallet_create' }),
      expect.objectContaining({ kind: 'wallet_create' })
    )
  })

  test('wallet_delete: calls broker.submitApproval and returns null', async () => {
    const msg: ControlMessage = {
      type: 'wallet_delete',
      payload: defaultApprovalFields({ requestId: 'req_wd_1' })
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).toBeNull()
    expect(broker.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'wallet_delete' }),
      expect.objectContaining({ kind: 'wallet_delete' })
    )
  })

  // -------------------------------------------------------------------------
  // cancel_queued — ControlResult 유지
  // -------------------------------------------------------------------------

  test('cancel_queued: returns error when messageId is missing', async () => {
    const msg: ControlMessage = {
      type: 'cancel_queued',
      payload: { messageId: '' }
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).not.toBeNull()
    expect(result!.ok).toBe(false)
    expect((result as any).type).toBe('cancel_queued')
    expect((result as any).error).toBe('Missing messageId')
  })

  test('cancel_queued: successfully cancels queued message', async () => {
    queueManager.cancelQueued.mockReturnValue({ ok: true, wasProcessing: false })
    const msg: ControlMessage = {
      type: 'cancel_queued',
      payload: { messageId: 'msg-123' }
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).not.toBeNull()
    expect(result!.ok).toBe(true)
    expect((result as any).type).toBe('cancel_queued')
    expect((result as any).messageId).toBe('msg-123')
    expect(queueManager.cancelQueued).toHaveBeenCalledWith('msg-123')
  })

  test('cancel_queued: returns not_found for already-processing message', async () => {
    queueManager.cancelQueued.mockReturnValue({ ok: false, reason: 'not_found' })
    const msg: ControlMessage = {
      type: 'cancel_queued',
      payload: { messageId: 'msg-active' }
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).not.toBeNull()
    expect(result!.ok).toBe(false)
    expect((result as any).reason).toBe('not_found')
  })

  // -------------------------------------------------------------------------
  // cancel_active — ControlResult 유지
  // -------------------------------------------------------------------------

  test('cancel_active: returns error when messageId is missing', async () => {
    const msg: ControlMessage = {
      type: 'cancel_active',
      payload: { messageId: '' }
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).not.toBeNull()
    expect(result!.ok).toBe(false)
    expect((result as any).type).toBe('cancel_active')
    expect((result as any).error).toBe('Missing messageId')
  })

  test('cancel_active: successfully cancels active message', async () => {
    queueManager.cancelActive.mockReturnValue({ ok: true, wasProcessing: true })
    const msg: ControlMessage = {
      type: 'cancel_active',
      payload: { messageId: 'msg-456' }
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).not.toBeNull()
    expect(result!.ok).toBe(true)
    expect((result as any).type).toBe('cancel_active')
    expect((result as any).messageId).toBe('msg-456')
    expect((result as any).wasProcessing).toBe(true)
    expect(queueManager.cancelActive).toHaveBeenCalledWith('msg-456')
  })

  test('cancel_active: returns not_found for queued message', async () => {
    queueManager.cancelActive.mockReturnValue({ ok: false, reason: 'not_found' })
    const msg: ControlMessage = {
      type: 'cancel_active',
      payload: { messageId: 'msg-queued' }
    }

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).not.toBeNull()
    expect(result!.ok).toBe(false)
    expect((result as any).reason).toBe('not_found')
  })

  // -------------------------------------------------------------------------
  // Unknown type
  // -------------------------------------------------------------------------

  test('unknown type: returns error with unknown type message', async () => {
    const msg = {
      type: 'banana',
      payload: { requestId: 'r1' }
    } as any

    const result = await handleControlMessage(msg, { broker, logger: logger as any, queueManager })

    expect(result).not.toBeNull()
    expect(result!.ok).toBe(false)
    expect((result as any).error).toBe('Unknown control type: banana')
    expect(logger.warn).toHaveBeenCalled()
  })
})
