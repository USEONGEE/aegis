import { createHash } from 'node:crypto'
import type { Logger } from 'pino'
import type { SignedApproval, Policy } from '@wdk-app/guarded-wdk'
import type { ApprovalSubmitContext } from '@wdk-app/guarded-wdk'
import type { ControlFacadePort } from './ports.js'
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

interface ControlHandlerDeps {
  facade: ControlFacadePort
  logger: Logger
  queueManager: MessageQueueManager
}

/**
 * Handle control channel messages from the Relay.
 *
 * v0.4.2: 승인 6종은 broker.submitApproval() 한 줄로 처리 후 null 반환 (WDK 이벤트가 앱에 전달).
 *         cancel 2종은 기존 ControlResult 반환 유지.
 */
export async function handleControlMessage (
  msg: ControlMessage,
  deps: ControlHandlerDeps
): Promise<ControlResult | null> {
  const { facade, logger, queueManager } = deps
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
        const context: ApprovalSubmitContext = { kind: 'tx', expectedTargetHash: payload.targetHash }
        await facade.submitApproval(signedApproval, context)
        logger.info({ requestId: payload.requestId }, 'Tx approval submitted successfully')
        return null
      } catch (err: unknown) {
        logger.error({ err, requestId: payload.requestId }, 'Tx approval verification failed')
        return null
      }
    }

    // -----------------------------------------------------------------------
    // policy_approval -- owner approved a pending policy change
    // -----------------------------------------------------------------------
    case 'policy_approval': {
      const payload = msg.payload
      try {
        const signedApproval = toSignedApproval(payload, 'policy')
        const context: ApprovalSubmitContext = {
          kind: 'policy_approval',
          expectedTargetHash: payload.targetHash,
          policies: (payload.policies ?? []) as unknown as Policy[],
          description: ''
        }
        await facade.submitApproval(signedApproval, context)
        logger.info({ requestId: payload.requestId }, 'Policy approval submitted successfully')
        return null
      } catch (err: unknown) {
        logger.error({ err, requestId: payload.requestId }, 'Policy approval verification failed')
        return null
      }
    }

    // -----------------------------------------------------------------------
    // policy_reject -- owner rejected a pending policy request
    // -----------------------------------------------------------------------
    case 'policy_reject': {
      const payload = msg.payload
      try {
        const signedApproval = toSignedApproval(payload, 'policy_reject')
        const context: ApprovalSubmitContext = { kind: 'policy_reject' }
        await facade.submitApproval(signedApproval, context)
        logger.info({ requestId: payload.requestId }, 'Policy rejection submitted successfully')
        return null
      } catch (err: unknown) {
        logger.error({ err, requestId: payload.requestId }, 'Policy rejection verification failed')
        return null
      }
    }

    // -----------------------------------------------------------------------
    // device_revoke -- owner revoked a signer
    // -----------------------------------------------------------------------
    case 'device_revoke': {
      const payload = msg.payload
      try {
        const signedApproval = toSignedApproval(payload, 'device_revoke')
        const targetPubKey = payload.targetPublicKey || payload.signerId
        const expectedTargetHash = targetPubKey
          ? '0x' + createHash('sha256').update(targetPubKey).digest('hex')
          : ''
        const context: ApprovalSubmitContext = { kind: 'device_revoke', expectedTargetHash }
        await facade.submitApproval(signedApproval, context)
        logger.info({ requestId: payload.requestId }, 'Signer revocation submitted successfully')
        return null
      } catch (err: unknown) {
        logger.error({ err, requestId: payload.requestId }, 'Signer revocation verification failed')
        return null
      }
    }

    // -----------------------------------------------------------------------
    // wallet_create -- owner approved wallet creation
    // -----------------------------------------------------------------------
    case 'wallet_create': {
      const payload = msg.payload
      try {
        const signedApproval = toSignedApproval(payload, 'wallet_create')
        const context: ApprovalSubmitContext = { kind: 'wallet_create' }
        await facade.submitApproval(signedApproval, context)
        logger.info({ requestId: payload.requestId }, 'Wallet creation approval submitted successfully')
        return null
      } catch (err: unknown) {
        logger.error({ err, requestId: payload.requestId }, 'Wallet creation approval verification failed')
        return null
      }
    }

    // -----------------------------------------------------------------------
    // wallet_delete -- owner approved wallet deletion
    // -----------------------------------------------------------------------
    case 'wallet_delete': {
      const payload = msg.payload
      try {
        const signedApproval = toSignedApproval(payload, 'wallet_delete')
        const context: ApprovalSubmitContext = { kind: 'wallet_delete' }
        await facade.submitApproval(signedApproval, context)
        logger.info({ requestId: payload.requestId }, 'Wallet deletion approval submitted successfully')
        return null
      } catch (err: unknown) {
        logger.error({ err, requestId: payload.requestId }, 'Wallet deletion approval verification failed')
        return null
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
