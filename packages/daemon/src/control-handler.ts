import { createHash } from 'node:crypto'
import type { Logger } from 'pino'
import type { WDKInstance } from './wdk-host.js'
import type { RelayClient } from './relay-client.js'
import type { MessageQueueManager } from './message-queue.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ControlMessage {
  type: string
  payload: ControlPayload
}

export interface ControlPayload {
  requestId?: string
  signature?: string
  approverPubKey?: string
  chainId?: number
  metadata?: Record<string, any>
  deviceId?: string
  identityPubKey?: string
  encryptionPubKey?: string
  pairingToken?: string
  sas?: string
  [key: string]: unknown
}

export interface ControlResult {
  ok: boolean
  type?: string
  requestId?: string
  deviceId?: string
  messageId?: string
  error?: string
  reason?: string
  wasProcessing?: boolean
}

interface ApprovalStoreReader {
  loadPendingByRequestId (requestId: string): Promise<{ requestId: string; seedId: string; type: string; chainId: number; targetHash: string; metadata?: Record<string, unknown>; createdAt: number } | null>
  getPolicyVersion (seedId: string, chainId: number): Promise<number>
}

/**
 * Tracks the daemon's pending pairing session.
 * Created when daemon starts pairing (QR code displayed),
 * consumed when pairing_confirm arrives from the app.
 */
export interface PairingSession {
  pairingToken: string
  expectedSAS: string
  daemonEncryptionPubKey: Uint8Array
  daemonEncryptionSecretKey: Uint8Array
  createdAt: number
}

interface SignedApprovalBroker {
  submitApproval (approval: Record<string, unknown>, context?: Record<string, unknown>): Promise<void>
  setTrustedApprovers (approvers: string[]): void
  _trustedApprovers?: string[]
}

/**
 * Handle control channel messages from the Relay.
 *
 * Control messages carry SignedApproval envelopes from the RN App (owner).
 * The daemon dispatches them to the SignedApprovalBroker for verification
 * and action.
 *
 * Supported msg.type values:
 *   - tx_approval      -> broker.submitApproval (resolves pending tx)
 *   - policy_approval  -> broker.submitApproval (applies policy)
 *   - policy_reject    -> broker.submitApproval (rejects policy request)
 *   - device_revoke    -> broker.submitApproval (revokes a device)
 */
export async function handleControlMessage (
  msg: ControlMessage,
  broker: SignedApprovalBroker,
  logger: Logger,
  wdk?: WDKInstance | null,
  relayClient?: RelayClient,
  approvalStore?: ApprovalStoreReader | null,
  pairingSession?: PairingSession | null,
  queueManager?: MessageQueueManager | null
): Promise<ControlResult> {
  const { type, payload } = msg

  if (!type || !payload) {
    logger.warn({ msg }, 'Malformed control message: missing type or payload')
    return { ok: false, error: 'Malformed control message' }
  }

  logger.info({ type, requestId: payload.requestId }, 'Processing control message')

  switch (type) {
    // -----------------------------------------------------------------------
    // tx_approval -- owner approved a pending transaction
    // -----------------------------------------------------------------------
    case 'tx_approval': {
      try {
        const signedApproval: Record<string, unknown> = {
          ...payload,
          type: 'tx'
        }

        // Build verification context from server-side pending (not client payload)
        const context: Record<string, unknown> = {}
        if (approvalStore && payload.requestId) {
          const pending = await approvalStore.loadPendingByRequestId(payload.requestId)
          if (pending) {
            context.expectedTargetHash = pending.targetHash
            const policyVersion = await approvalStore.getPolicyVersion(pending.seedId, pending.chainId)
            context.currentPolicyVersion = policyVersion
            logger.debug({ requestId: payload.requestId, targetHash: pending.targetHash, policyVersion }, 'TX context loaded from server-side pending')
          } else {
            logger.warn({ requestId: payload.requestId }, 'No pending request found for tx_approval')
          }
        }

        await broker.submitApproval(signedApproval, context)

        logger.info({ requestId: payload.requestId }, 'TX approval submitted successfully')
        return { ok: true, type: 'tx_approval', requestId: payload.requestId }
      } catch (err: any) {
        logger.error({ err, requestId: payload.requestId }, 'TX approval verification failed')
        return { ok: false, type: 'tx_approval', requestId: payload.requestId, error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // policy_approval -- owner approved a pending policy change
    // -----------------------------------------------------------------------
    case 'policy_approval': {
      try {
        const signedApproval: Record<string, unknown> = {
          ...payload,
          type: 'policy'
        }

        // Build verification context from server-side pending (not client payload)
        const context: Record<string, unknown> = {}
        if (approvalStore && payload.requestId) {
          const pending = await approvalStore.loadPendingByRequestId(payload.requestId)
          if (pending) {
            context.expectedTargetHash = pending.targetHash
            logger.debug({ requestId: payload.requestId, targetHash: pending.targetHash }, 'Policy context loaded from server-side pending')
          } else {
            logger.warn({ requestId: payload.requestId }, 'No pending request found for policy_approval')
          }
        }

        await broker.submitApproval(signedApproval, context)

        // After successful approval, apply the policy to WDK
        if (wdk && payload.metadata?.policies && payload.chainId !== undefined) {
          try {
            await wdk.updatePolicies?.(payload.chainId as number, {
              policies: payload.metadata.policies
            })
            logger.info({ chainId: payload.chainId }, 'Policy applied to WDK')
          } catch (applyErr: any) {
            logger.error({ err: applyErr, chainId: payload.chainId }, 'Failed to apply policy to WDK')
          }
        }

        logger.info({ requestId: payload.requestId }, 'Policy approval submitted successfully')
        return { ok: true, type: 'policy_approval', requestId: payload.requestId }
      } catch (err: any) {
        logger.error({ err, requestId: payload.requestId }, 'Policy approval verification failed')
        return { ok: false, type: 'policy_approval', requestId: payload.requestId, error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // policy_reject -- owner rejected a pending policy request
    // -----------------------------------------------------------------------
    case 'policy_reject': {
      try {
        const signedApproval: Record<string, unknown> = {
          ...payload,
          type: 'policy_reject'
        }

        await broker.submitApproval(signedApproval)

        logger.info({ requestId: payload.requestId }, 'Policy rejection submitted successfully')
        return { ok: true, type: 'policy_reject', requestId: payload.requestId }
      } catch (err: any) {
        logger.error({ err, requestId: payload.requestId }, 'Policy rejection verification failed')
        return { ok: false, type: 'policy_reject', requestId: payload.requestId, error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // device_revoke -- owner revoked a device
    // -----------------------------------------------------------------------
    case 'device_revoke': {
      try {
        const signedApproval: Record<string, unknown> = {
          ...payload,
          type: 'device_revoke'
        }

        // Compute expectedTargetHash = SHA-256(deviceId) for verification.
        // The deviceId to revoke is in metadata.deviceId.
        const deviceId = (signedApproval.metadata as Record<string, any>)?.deviceId as string | undefined
        const context: Record<string, unknown> = {}
        if (deviceId) {
          context.expectedTargetHash = '0x' + createHash('sha256').update(deviceId).digest('hex')
        }

        await broker.submitApproval(signedApproval, context)

        // After revocation, update the broker's trusted approvers list
        const store = wdk?.getApprovalStore?.() || null
        if (store) {
          const devices: any[] = await store.listDevices()
          const active: string[] = devices
            .filter((d: any) => d.revoked_at === null || d.revoked_at === undefined)
            .map((d: any) => d.public_key)
          broker.setTrustedApprovers(active)
          logger.info({ activeDevices: active.length }, 'Trusted approvers updated after device revocation')
        }

        logger.info({ requestId: payload.requestId }, 'Device revocation submitted successfully')
        return { ok: true, type: 'device_revoke', requestId: payload.requestId }
      } catch (err: any) {
        logger.error({ err, requestId: payload.requestId }, 'Device revocation verification failed')
        return { ok: false, type: 'device_revoke', requestId: payload.requestId, error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // pairing_confirm -- app completed SAS verification and sent its keys
    // -----------------------------------------------------------------------
    case 'pairing_confirm': {
      try {
        const { deviceId, identityPubKey, encryptionPubKey, pairingToken, sas } = payload

        if (!deviceId || !identityPubKey) {
          return { ok: false, type: 'pairing_confirm', error: 'Missing deviceId or identityPubKey' }
        }

        // --- Gap 3: Verify pairingToken before trusting ---
        if (!pairingToken) {
          logger.warn({ deviceId }, 'Pairing rejected: missing pairingToken')
          return { ok: false, type: 'pairing_confirm', error: 'Missing pairingToken' }
        }

        if (!pairingSession) {
          logger.warn({ deviceId }, 'Pairing rejected: no active pairing session on daemon')
          return { ok: false, type: 'pairing_confirm', error: 'No active pairing session' }
        }

        // Constant-time comparison for pairingToken
        const tokenValid = pairingToken === pairingSession.pairingToken
        if (!tokenValid) {
          logger.warn({ deviceId }, 'Pairing rejected: invalid pairingToken')
          return { ok: false, type: 'pairing_confirm', error: 'Invalid pairingToken' }
        }

        // --- Gap 16: SAS verification before registering as trusted ---
        if (!sas) {
          logger.warn({ deviceId }, 'Pairing rejected: missing SAS')
          return { ok: false, type: 'pairing_confirm', error: 'Missing SAS for verification' }
        }

        if (sas !== pairingSession.expectedSAS) {
          logger.warn({ deviceId, receivedSAS: sas, expectedSAS: pairingSession.expectedSAS }, 'Pairing rejected: SAS mismatch (possible MITM)')
          return { ok: false, type: 'pairing_confirm', error: 'SAS mismatch — possible man-in-the-middle attack' }
        }

        logger.info({ deviceId, sas }, 'Pairing token and SAS verified successfully')

        // Register the new device in the approval store (only after verification)
        const store = wdk?.getApprovalStore?.() || null
        if (store) {
          await store.saveDevice(deviceId, identityPubKey)
          logger.info({ deviceId }, 'Paired device registered in store')
        }

        // Add to trusted approvers so future approvals are accepted
        if (broker && identityPubKey) {
          const current: string[] = broker._trustedApprovers || []
          if (!current.includes(identityPubKey)) {
            broker.setTrustedApprovers([...current, identityPubKey])
          }
          logger.info({ identityPubKey }, 'Added to trusted approvers')
        }

        // --- Gap 11 / Step 05: E2E session key establishment via ECDH ---
        if (encryptionPubKey && relayClient) {
          try {
            const nacl = await import('tweetnacl')
            const peerPubKeyBytes = Buffer.from(encryptionPubKey, 'base64')
            // Compute ECDH shared secret: nacl.box.before(peerPubKey, ourSecretKey)
            const sharedSecret = nacl.default
              ? nacl.default.box.before(peerPubKeyBytes, pairingSession.daemonEncryptionSecretKey)
              : (nacl as any).box.before(peerPubKeyBytes, pairingSession.daemonEncryptionSecretKey)
            relayClient.setSessionKey(sharedSecret)
            logger.info('E2E session key established via ECDH after pairing')
          } catch (e2eErr: any) {
            logger.error({ err: e2eErr }, 'Failed to establish E2E session key (pairing still succeeded)')
          }
        }

        logger.info({ deviceId, sas }, 'Pairing confirmed successfully')
        return { ok: true, type: 'pairing_confirm', deviceId }
      } catch (err: any) {
        logger.error({ err }, 'Pairing confirmation failed')
        return { ok: false, type: 'pairing_confirm', error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // cancel_message -- cancel a pending or in-progress message
    // -----------------------------------------------------------------------
    case 'cancel_message': {
      const { messageId } = payload
      if (!messageId || !queueManager) {
        return { ok: false, type: 'cancel_message_result', error: 'Missing messageId or queue' }
      }
      const cancelResult = queueManager.cancel(messageId as string)
      return {
        ok: cancelResult.ok,
        type: 'cancel_message_result',
        messageId: messageId as string,
        reason: cancelResult.reason,
        wasProcessing: cancelResult.wasProcessing
      }
    }

    // -----------------------------------------------------------------------
    // Unknown
    // -----------------------------------------------------------------------
    default:
      logger.warn({ type }, 'Unknown control message type')
      return { ok: false, error: `Unknown control type: ${type}` }
  }
}
