import { jest } from '@jest/globals'
import { createHash } from 'node:crypto'
import { handleControlMessage } from '../src/control-handler.js'
import type { ControlMessage, ControlResult } from '../src/control-handler.js'

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
    _trustedApprovers: [] as string[],
    ...overrides
  }
}

function createMockStore (overrides: Record<string, any> = {}): any {
  return {
    saveDevice: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    listDevices: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    ...overrides
  }
}

function createMockWdk (store: any): any {
  return {
    getApprovalStore: jest.fn().mockReturnValue(store),
    updatePolicies: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleControlMessage', () => {
  let logger: MockLogger
  let broker: any
  let store: any
  let wdk: any

  beforeEach(() => {
    logger = createMockLogger()
    broker = createMockBroker()
    store = createMockStore()
    wdk = createMockWdk(store)
  })

  // -------------------------------------------------------------------------
  // Malformed messages
  // -------------------------------------------------------------------------

  test('returns error for message with missing type', async () => {
    const msg = { payload: { requestId: 'r1' } } as any
    const result = await handleControlMessage(msg, broker, logger as any, wdk)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Malformed control message')
    expect(logger.warn).toHaveBeenCalled()
  })

  test('returns error for message with missing payload', async () => {
    const msg = { type: 'tx_approval' } as any
    const result = await handleControlMessage(msg, broker, logger as any, wdk)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Malformed control message')
  })

  // -------------------------------------------------------------------------
  // pairing_confirm
  // -------------------------------------------------------------------------

  test('pairing_confirm: calls store.saveDevice with correct args', async () => {
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
        deviceId: 'dev_001',
        identityPubKey: '0xpubkey123',
        encryptionPubKey: '0xenckey456',
        pairingToken: 'tok_abc',
        sas: '1234'
      }
    }

    const result = await handleControlMessage(msg, broker, logger as any, wdk, undefined, undefined, pairingSession)

    expect(result.ok).toBe(true)
    expect(result.type).toBe('pairing_confirm')
    expect(result.deviceId).toBe('dev_001')
    expect(store.saveDevice).toHaveBeenCalledWith('dev_001', '0xpubkey123')
  })

  test('pairing_confirm: adds identityPubKey to trusted approvers', async () => {
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
        deviceId: 'dev_002',
        identityPubKey: '0xnewkey',
        pairingToken: 'tok_pair',
        sas: '5678'
      }
    }

    await handleControlMessage(msg, broker, logger as any, wdk, undefined, undefined, pairingSession)

    expect(broker.setTrustedApprovers).toHaveBeenCalledWith(['0xnewkey'])
  })

  test('pairing_confirm: returns error when deviceId is missing', async () => {
    const msg: ControlMessage = {
      type: 'pairing_confirm',
      payload: { identityPubKey: '0xkey' }
    }

    const result = await handleControlMessage(msg, broker, logger as any, wdk)

    expect(result.ok).toBe(false)
    expect(result.type).toBe('pairing_confirm')
    expect(result.error).toBe('Missing deviceId or identityPubKey')
  })

  test('pairing_confirm: returns error when identityPubKey is missing', async () => {
    const msg: ControlMessage = {
      type: 'pairing_confirm',
      payload: { deviceId: 'dev_003' }
    }

    const result = await handleControlMessage(msg, broker, logger as any, wdk)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Missing deviceId or identityPubKey')
  })

  // -------------------------------------------------------------------------
  // tx_approval
  // -------------------------------------------------------------------------

  test('tx_approval: calls broker.submitApproval with type "tx"', async () => {
    const msg: ControlMessage = {
      type: 'tx_approval',
      payload: {
        requestId: 'req_tx_1',
        signature: '0xsig',
        approverPubKey: '0xapprover'
      }
    }

    const result = await handleControlMessage(msg, broker, logger as any, wdk)

    expect(result.ok).toBe(true)
    expect(result.type).toBe('tx_approval')
    expect(result.requestId).toBe('req_tx_1')
    expect(broker.submitApproval).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tx',
      requestId: 'req_tx_1',
      signature: '0xsig'
    }), expect.any(Object))
  })

  test('tx_approval: returns error when broker.submitApproval throws', async () => {
    broker.submitApproval.mockRejectedValue(new Error('Invalid signature'))

    const msg: ControlMessage = {
      type: 'tx_approval',
      payload: { requestId: 'req_tx_2' }
    }

    const result = await handleControlMessage(msg, broker, logger as any, wdk)

    expect(result.ok).toBe(false)
    expect(result.type).toBe('tx_approval')
    expect(result.error).toBe('Invalid signature')
    expect(logger.error).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // policy_approval
  // -------------------------------------------------------------------------

  test('policy_approval: calls broker.submitApproval with type "policy"', async () => {
    const msg: ControlMessage = {
      type: 'policy_approval',
      payload: {
        requestId: 'req_pol_1',
        signature: '0xsig'
      }
    }

    const result = await handleControlMessage(msg, broker, logger as any, wdk)

    expect(result.ok).toBe(true)
    expect(result.type).toBe('policy_approval')
    expect(result.requestId).toBe('req_pol_1')
    expect(broker.submitApproval).toHaveBeenCalledWith(expect.objectContaining({
      type: 'policy',
      requestId: 'req_pol_1'
    }), expect.any(Object))
  })

  test('policy_approval: applies policies to WDK when metadata.policies present', async () => {
    const msg: ControlMessage = {
      type: 'policy_approval',
      payload: {
        requestId: 'req_pol_2',
        chainId: 1,
        metadata: {
          policies: [{ type: 'auto', maxUsd: 500 }]
        }
      }
    }

    await handleControlMessage(msg, broker, logger as any, wdk)

    expect(wdk.updatePolicies).toHaveBeenCalledWith(1, {
      policies: [{ type: 'auto', maxUsd: 500 }]
    })
  })

  test('policy_approval: returns error when broker.submitApproval throws', async () => {
    broker.submitApproval.mockRejectedValue(new Error('Policy verification failed'))

    const msg: ControlMessage = {
      type: 'policy_approval',
      payload: { requestId: 'req_pol_3' }
    }

    const result = await handleControlMessage(msg, broker, logger as any, wdk)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Policy verification failed')
  })

  // -------------------------------------------------------------------------
  // policy_reject
  // -------------------------------------------------------------------------

  test('policy_reject: calls broker.submitApproval with type "policy_reject"', async () => {
    const msg: ControlMessage = {
      type: 'policy_reject',
      payload: {
        requestId: 'req_rej_1',
        signature: '0xsig'
      }
    }

    const result = await handleControlMessage(msg, broker, logger as any, wdk)

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
    const deviceId = 'device_to_revoke'
    const expectedHash = '0x' + createHash('sha256').update(deviceId).digest('hex')

    store.listDevices.mockResolvedValue([
      { publicKey: '0xactive1', revokedAt: null },
      { publicKey: '0xrevoked', revokedAt: new Date() }
    ])

    const msg: ControlMessage = {
      type: 'device_revoke',
      payload: {
        requestId: 'req_rev_1',
        metadata: { deviceId }
      }
    }

    const result = await handleControlMessage(msg, broker, logger as any, wdk)

    expect(result.ok).toBe(true)
    expect(result.type).toBe('device_revoke')
    expect(broker.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'device_revoke',
        metadata: { deviceId }
      }),
      { expectedTargetHash: expectedHash }
    )
  })

  test('device_revoke: updates trusted approvers to only active devices', async () => {
    store.listDevices.mockResolvedValue([
      { publicKey: '0xactive1', revokedAt: null },
      { publicKey: '0xactive2', revokedAt: null },
      { publicKey: '0xrevoked', revokedAt: new Date() }
    ])

    const msg: ControlMessage = {
      type: 'device_revoke',
      payload: {
        requestId: 'req_rev_2',
        metadata: { deviceId: 'dev_x' }
      }
    }

    await handleControlMessage(msg, broker, logger as any, wdk)

    expect(broker.setTrustedApprovers).toHaveBeenCalledWith(['0xactive1', '0xactive2'])
  })

  test('device_revoke: returns error when broker.submitApproval throws', async () => {
    broker.submitApproval.mockRejectedValue(new Error('Revocation denied'))

    const msg: ControlMessage = {
      type: 'device_revoke',
      payload: {
        requestId: 'req_rev_3',
        metadata: { deviceId: 'dev_y' }
      }
    }

    const result = await handleControlMessage(msg, broker, logger as any, wdk)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Revocation denied')
  })

  // -------------------------------------------------------------------------
  // Unknown type
  // -------------------------------------------------------------------------

  test('unknown type: returns error with unknown type message', async () => {
    const msg: ControlMessage = {
      type: 'banana',
      payload: { requestId: 'r1' }
    }

    const result = await handleControlMessage(msg, broker, logger as any, wdk)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Unknown control type: banana')
    expect(logger.warn).toHaveBeenCalled()
  })
})
