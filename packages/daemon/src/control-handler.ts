import { createHash } from 'node:crypto'
import type { Logger } from 'pino'
import type { SignedApproval, VerificationContext, StoredSigner } from '@wdk-app/guarded-wdk'
import { SqliteApprovalStore, SignedApprovalBroker } from '@wdk-app/guarded-wdk'
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
  accountIndex?: number
  content?: string
  signerId?: string
  identityPubKey?: string
  encryptionPubKey?: string
  pairingToken?: string
  sas?: string
  policies?: Record<string, unknown>[]
  [key: string]: unknown
}

export interface ControlResult {
  ok: boolean
  type?: string
  requestId?: string
  messageId?: string
  error?: string
  reason?: string
  wasProcessing?: boolean
}

/**
 * Tracks the daemon's pending pairing session.
 */
export interface PairingSession {
  pairingToken: string
  expectedSAS: string
  daemonEncryptionPubKey: Uint8Array
  daemonEncryptionSecretKey: Uint8Array
  createdAt: number
}

// ---------------------------------------------------------------------------
// Wire payload → SignedApproval mapping
// ---------------------------------------------------------------------------

/**
 * Map wire payload fields to guarded-wdk SignedApproval shape.
 * Wire uses `signature`/`approverPubKey`, guarded-wdk uses `sig`/`approver`.
 */
function toSignedApproval (payload: ControlPayload, type: string): SignedApproval {
  return {
    type: type as SignedApproval['type'],
    requestId: (payload.requestId || '') as string,
    chainId: (payload.chainId || 0) as number,
    targetHash: (payload.targetHash || '') as string,
    approver: (payload.approverPubKey || '') as string,
    accountIndex: (payload.accountIndex || 0) as number,
    policyVersion: (payload.policyVersion || 0) as number,
    expiresAt: (payload.expiresAt || 0) as number,
    nonce: (payload.nonce || 0) as number,
    sig: (payload.signature || '') as string,
    content: (payload.content || '') as string
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handle control channel messages from the Relay.
 *
 * Supported msg.type values:
 *   - policy_approval  -> broker.submitApproval (applies policy)
 *   - policy_reject    -> broker.submitApproval (rejects policy request)
 *   - device_revoke    -> broker.submitApproval (revokes a signer)
 */
export async function handleControlMessage (
  msg: ControlMessage,
  broker: SignedApprovalBroker,
  logger: Logger,
  relayClient?: RelayClient,
  approvalStore?: InstanceType<typeof SqliteApprovalStore> | null,
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
    // policy_approval -- owner approved a pending policy change
    // -----------------------------------------------------------------------
    case 'policy_approval': {
      try {
        const signedApproval = toSignedApproval(payload, 'policy')

        // Build verification context + capture description BEFORE submitApproval
        const context: VerificationContext = {}
        let description = ''
        if (approvalStore && payload.requestId) {
          const pending = await approvalStore.loadPendingByRequestId(payload.requestId)
          if (pending) {
            context.expectedTargetHash = pending.targetHash
            description = pending.content
            logger.debug({ requestId: payload.requestId, targetHash: pending.targetHash }, 'Policy context loaded from server-side pending')
          } else {
            logger.warn({ requestId: payload.requestId }, 'No pending request found for policy_approval')
          }
        }

        await broker.submitApproval(signedApproval, context)

        if (approvalStore && payload.policies && payload.chainId !== undefined) {
          await approvalStore.savePolicy(
            payload.accountIndex as number,
            payload.chainId as number,
            { policies: payload.policies as unknown[], signature: {} },
            description
          )
          logger.info({ chainId: payload.chainId, accountIndex: payload.accountIndex }, 'Policy saved to store')
        }

        logger.info({ requestId: payload.requestId }, 'Policy approval submitted successfully')
        return { ok: true, type: 'policy_approval', requestId: payload.requestId }
      } catch (err: unknown) {
        logger.error({ err, requestId: payload.requestId }, 'Policy approval verification failed')
        return { ok: false, type: 'policy_approval', requestId: payload.requestId, error: (err as Error).message }
      }
    }

    // -----------------------------------------------------------------------
    // policy_reject -- owner rejected a pending policy request
    // -----------------------------------------------------------------------
    case 'policy_reject': {
      try {
        const signedApproval = toSignedApproval(payload, 'policy_reject')
        await broker.submitApproval(signedApproval)

        logger.info({ requestId: payload.requestId }, 'Policy rejection submitted successfully')
        return { ok: true, type: 'policy_reject', requestId: payload.requestId }
      } catch (err: unknown) {
        logger.error({ err, requestId: payload.requestId }, 'Policy rejection verification failed')
        return { ok: false, type: 'policy_reject', requestId: payload.requestId, error: (err as Error).message }
      }
    }

    // -----------------------------------------------------------------------
    // device_revoke -- owner revoked a signer
    // -----------------------------------------------------------------------
    case 'device_revoke': {
      try {
        const signedApproval = toSignedApproval(payload, 'device_revoke')

        // The signed approval's targetHash = SHA-256(publicKey of signer being revoked)
        // Verifier Step 6 checks targetHash matches expectedTargetHash if provided.
        // We compute expectedTargetHash from payload if targetPublicKey is available,
        // otherwise skip (verifier trusts the signed targetHash).
        const targetPublicKey = (payload.targetPublicKey || payload.signerId) as string | undefined
        const context: VerificationContext = {}
        if (targetPublicKey) {
          context.expectedTargetHash = '0x' + createHash('sha256').update(targetPublicKey).digest('hex')
        }

        await broker.submitApproval(signedApproval, context)

        // After revocation, update trusted approvers from store (source of truth)
        if (approvalStore) {
          const signers: StoredSigner[] = await approvalStore.listSigners()
          const active: string[] = signers
            .filter(d => d.revokedAt === null || d.revokedAt === undefined)
            .map(d => d.publicKey)
          broker.setTrustedApprovers(active)
          logger.info({ activeSigners: active.length }, 'Trusted approvers updated after signer revocation')
        }

        logger.info({ requestId: payload.requestId }, 'Signer revocation submitted successfully')
        return { ok: true, type: 'device_revoke', requestId: payload.requestId }
      } catch (err: unknown) {
        logger.error({ err, requestId: payload.requestId }, 'Signer revocation verification failed')
        return { ok: false, type: 'device_revoke', requestId: payload.requestId, error: (err as Error).message }
      }
    }

    // -----------------------------------------------------------------------
    // wallet_create -- owner approved wallet creation
    // -----------------------------------------------------------------------
    case 'wallet_create': {
      try {
        const signedApproval = toSignedApproval(payload, 'wallet_create')
        await broker.submitApproval(signedApproval)

        logger.info({ requestId: payload.requestId, accountIndex: payload.accountIndex }, 'Wallet creation approval submitted successfully')
        return { ok: true, type: 'wallet_create', requestId: payload.requestId }
      } catch (err: unknown) {
        logger.error({ err, requestId: payload.requestId }, 'Wallet creation approval verification failed')
        return { ok: false, type: 'wallet_create', requestId: payload.requestId, error: (err as Error).message }
      }
    }

    // -----------------------------------------------------------------------
    // wallet_delete -- owner approved wallet deletion
    // -----------------------------------------------------------------------
    case 'wallet_delete': {
      try {
        const signedApproval = toSignedApproval(payload, 'wallet_delete')
        await broker.submitApproval(signedApproval)

        logger.info({ requestId: payload.requestId, accountIndex: payload.accountIndex }, 'Wallet deletion approval submitted successfully')
        return { ok: true, type: 'wallet_delete', requestId: payload.requestId }
      } catch (err: unknown) {
        logger.error({ err, requestId: payload.requestId }, 'Wallet deletion approval verification failed')
        return { ok: false, type: 'wallet_delete', requestId: payload.requestId, error: (err as Error).message }
      }
    }

    // -----------------------------------------------------------------------
    // pairing_confirm -- app completed SAS verification and sent its keys
    // -----------------------------------------------------------------------
    case 'pairing_confirm': {
      try {
        const { identityPubKey, encryptionPubKey, pairingToken, sas } = payload

        if (!identityPubKey) {
          return { ok: false, type: 'pairing_confirm', error: 'Missing identityPubKey' }
        }

        if (!pairingToken) {
          logger.warn({ identityPubKey }, 'Pairing rejected: missing pairingToken')
          return { ok: false, type: 'pairing_confirm', error: 'Missing pairingToken' }
        }

        if (!pairingSession) {
          logger.warn({ identityPubKey }, 'Pairing rejected: no active pairing session on daemon')
          return { ok: false, type: 'pairing_confirm', error: 'No active pairing session' }
        }

        const tokenValid = pairingToken === pairingSession.pairingToken
        if (!tokenValid) {
          logger.warn({ identityPubKey }, 'Pairing rejected: invalid pairingToken')
          return { ok: false, type: 'pairing_confirm', error: 'Invalid pairingToken' }
        }

        if (!sas) {
          logger.warn({ identityPubKey }, 'Pairing rejected: missing SAS')
          return { ok: false, type: 'pairing_confirm', error: 'Missing SAS for verification' }
        }

        if (sas !== pairingSession.expectedSAS) {
          logger.warn({ identityPubKey, receivedSAS: sas, expectedSAS: pairingSession.expectedSAS }, 'Pairing rejected: SAS mismatch (possible MITM)')
          return { ok: false, type: 'pairing_confirm', error: 'SAS mismatch — possible man-in-the-middle attack' }
        }

        logger.info({ identityPubKey, sas }, 'Pairing token and SAS verified successfully')

        // Register signer in store and update trusted approvers
        if (approvalStore) {
          await approvalStore.saveSigner(identityPubKey as string)
          logger.info({ identityPubKey }, 'Signer registered in store')

          // Re-read from store (source of truth) and update broker
          const signers: StoredSigner[] = await approvalStore.listSigners()
          const active: string[] = signers
            .filter(d => d.revokedAt === null || d.revokedAt === undefined)
            .map(d => d.publicKey)
          broker.setTrustedApprovers(active)
          logger.info({ identityPubKey }, 'Trusted approvers updated from store')
        }

        // E2E session key establishment via ECDH
        if (encryptionPubKey && relayClient) {
          try {
            const nacl = await import('tweetnacl')
            const peerPubKeyBytes = Buffer.from(encryptionPubKey as string, 'base64')
            const sharedSecret = nacl.default
              ? nacl.default.box.before(peerPubKeyBytes, pairingSession.daemonEncryptionSecretKey)
              : (nacl as Record<string, unknown> & { box: { before: (pk: Uint8Array, sk: Uint8Array) => Uint8Array } }).box.before(peerPubKeyBytes, pairingSession.daemonEncryptionSecretKey)
            relayClient.setSessionKey(sharedSecret)
            logger.info('E2E session key established via ECDH after pairing')
          } catch (e2eErr: unknown) {
            logger.error({ err: e2eErr }, 'Failed to establish E2E session key (pairing still succeeded)')
          }
        }

        logger.info({ identityPubKey, sas }, 'Pairing confirmed successfully')
        return { ok: true, type: 'pairing_confirm' }
      } catch (err: unknown) {
        logger.error({ err }, 'Pairing confirmation failed')
        return { ok: false, type: 'pairing_confirm', error: (err as Error).message }
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
