import { createHash } from 'node:crypto'
import type { Logger } from 'pino'
import type { WDKInstance } from './wdk-host.js'
import type { RelayClient } from './relay-client.js'

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
  chain?: string
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
  error?: string
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
  relayClient?: RelayClient
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

        await broker.submitApproval(signedApproval)

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

        await broker.submitApproval(signedApproval)

        // After successful approval, apply the policy to WDK
        if (wdk && payload.metadata?.policies && payload.chain) {
          try {
            await wdk.updatePolicies?.(payload.chain, {
              policies: payload.metadata.policies
            })
            logger.info({ chain: payload.chain }, 'Policy applied to WDK')
          } catch (applyErr: any) {
            logger.error({ err: applyErr, chain: payload.chain }, 'Failed to apply policy to WDK')
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

        // Register the new device in the approval store
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

        // Activate E2E encryption: derive shared secret via ECDH
        // In Phase 1, store the peer's encryption public key for future ECDH.
        // Full ECDH session key derivation is Phase 2 (requires daemon's own ephemeral keypair).
        if (encryptionPubKey) {
          logger.info({ encryptionPubKey }, 'Peer encryption public key stored for E2E (Phase 2 ECDH)')
        }

        logger.info({ deviceId, sas }, 'Pairing confirmed successfully')
        return { ok: true, type: 'pairing_confirm', deviceId }
      } catch (err: any) {
        logger.error({ err }, 'Pairing confirmation failed')
        return { ok: false, type: 'pairing_confirm', error: err.message }
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
