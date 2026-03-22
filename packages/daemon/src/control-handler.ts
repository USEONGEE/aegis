import { createHash } from 'node:crypto'
import type { Logger } from 'pino'
import type { SignedApproval, VerificationContext, StoredSigner } from '@wdk-app/guarded-wdk'
import { SqliteApprovalStore, SignedApprovalBroker } from '@wdk-app/guarded-wdk'
import type {
  SignedApprovalFields, ControlMessage, ControlResult
} from '@wdk-app/protocol'
import type { MessageQueueManager } from './message-queue.js'

// ---------------------------------------------------------------------------
// Wire payload → SignedApproval mapping
// ---------------------------------------------------------------------------

/**
 * Map wire payload fields to guarded-wdk SignedApproval shape.
 * Wire uses `signature`/`approverPubKey`, guarded-wdk uses `sig`/`approver`.
 */
function toSignedApproval (fields: SignedApprovalFields, type: SignedApproval['type']): SignedApproval {
  return {
    type,
    requestId: fields.requestId,
    chainId: fields.chainId,
    targetHash: fields.targetHash,
    approver: fields.approverPubKey,
    accountIndex: fields.accountIndex,
    policyVersion: fields.policyVersion,
    expiresAt: fields.expiresAt,
    nonce: fields.nonce,
    sig: fields.signature,
    content: fields.content
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface ControlHandlerDeps {
  broker: SignedApprovalBroker
  logger: Logger
  approvalStore: InstanceType<typeof SqliteApprovalStore>
  queueManager: MessageQueueManager
}

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
  deps: ControlHandlerDeps
): Promise<ControlResult> {
  const { broker, logger, approvalStore, queueManager } = deps
  if (!msg.type || !msg.payload) {
    logger.warn({ msg }, 'Malformed control message: missing type or payload')
    return { ok: false, error: 'Malformed control message' }
  }

  logger.info({ type: msg.type, requestId: 'requestId' in msg.payload ? (msg.payload as SignedApprovalFields).requestId : undefined }, 'Processing control message')

  switch (msg.type) {
    // -----------------------------------------------------------------------
    // tx_approval -- owner approved a transaction
    // -----------------------------------------------------------------------
    case 'tx_approval': {
      const payload = msg.payload
      try {
        const signedApproval = toSignedApproval(payload, 'tx')
        const context: VerificationContext = { currentPolicyVersion: null, expectedTargetHash: payload.targetHash }
        await broker.submitApproval(signedApproval, context)

        logger.info({ requestId: payload.requestId }, 'Tx approval submitted successfully')
        return { ok: true, type: 'tx_approval', requestId: payload.requestId }
      } catch (err: unknown) {
        logger.error({ err, requestId: payload.requestId }, 'Tx approval verification failed')
        return { ok: false, type: 'tx_approval', requestId: payload.requestId, error: (err as Error).message }
      }
    }

    // -----------------------------------------------------------------------
    // policy_approval -- owner approved a pending policy change
    // -----------------------------------------------------------------------
    case 'policy_approval': {
      const payload = msg.payload
      try {
        const signedApproval = toSignedApproval(payload, 'policy')

        // Build verification context + capture description BEFORE submitApproval
        const context: VerificationContext = { currentPolicyVersion: null, expectedTargetHash: null }
        let description = ''
        if (payload.requestId) {
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

        if (payload.policies) {
          await approvalStore.savePolicy(
            payload.accountIndex,
            payload.chainId,
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
      const payload = msg.payload
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
      const payload = msg.payload
      try {
        const signedApproval = toSignedApproval(payload, 'device_revoke')

        // The signed approval's targetHash = SHA-256(publicKey of signer being revoked)
        // Verifier Step 6 checks targetHash matches expectedTargetHash if provided.
        // App sends targetPublicKey (the public key of the signer to revoke).
        const targetPubKey = payload.targetPublicKey || payload.signerId
        const expectedTargetHash = targetPubKey
          ? '0x' + createHash('sha256').update(targetPubKey).digest('hex')
          : null
        const context: VerificationContext = { currentPolicyVersion: null, expectedTargetHash }

        await broker.submitApproval(signedApproval, context)

        // After revocation, update trusted approvers from store (source of truth)
        const signers: StoredSigner[] = await approvalStore.listSigners()
        const active: string[] = signers
          .filter(d => d.revokedAt === null || d.revokedAt === undefined)
          .map(d => d.publicKey)
        broker.setTrustedApprovers(active)
        logger.info({ activeSigners: active.length }, 'Trusted approvers updated after signer revocation')

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
      const payload = msg.payload
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
      const payload = msg.payload
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
    // cancel_queued -- remove a message from the queue (not yet processing)
    // -----------------------------------------------------------------------
    case 'cancel_queued': {
      const payload = msg.payload
      if (!payload.messageId) {
        return { ok: false, type: 'cancel_queued', error: 'Missing messageId' }
      }
      const cancelResult = queueManager.cancelQueued(payload.messageId)
      if (cancelResult.ok) {
        return { ok: true, type: 'cancel_queued', messageId: payload.messageId }
      }
      return { ok: false, type: 'cancel_queued', messageId: payload.messageId, reason: cancelResult.reason }
    }

    // -----------------------------------------------------------------------
    // cancel_active -- abort a currently processing message
    // -----------------------------------------------------------------------
    case 'cancel_active': {
      const payload = msg.payload
      if (!payload.messageId) {
        return { ok: false, type: 'cancel_active', error: 'Missing messageId' }
      }
      const cancelResult = queueManager.cancelActive(payload.messageId)
      if (cancelResult.ok) {
        return { ok: true, type: 'cancel_active', messageId: payload.messageId, wasProcessing: cancelResult.wasProcessing }
      }
      return { ok: false, type: 'cancel_active', messageId: payload.messageId, reason: cancelResult.reason }
    }

    // -----------------------------------------------------------------------
    // Unknown (runtime safety — wire may send unexpected types)
    // -----------------------------------------------------------------------
    default: {
      const unknownType: string = (msg as { type: string }).type
      logger.warn({ type: unknownType }, 'Unknown control message type')
      return { ok: false, error: `Unknown control type: ${unknownType}` }
    }
  }
}
