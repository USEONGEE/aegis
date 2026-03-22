import { createHash } from 'node:crypto'
import type { Logger } from 'pino'
import type { SignedApproval, Policy } from '@wdk-app/guarded-wdk'
import type { ApprovalSubmitContext } from '@wdk-app/guarded-wdk'
import type { ControlFacadePort } from './ports.js'
import type {
  SignedApprovalFields, ControlMessage,
  CancelCompletedEvent, CancelFailedEvent
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
// Cancel event payload (returned to index.ts for event_stream delivery)
// ---------------------------------------------------------------------------

export type CancelEventPayload = CancelCompletedEvent | CancelFailedEvent

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
 * v0.4.8: 승인 6종은 null 반환 (WDK 이벤트가 앱에 전달).
 *         cancel 2종은 CancelEventPayload 반환 → index.ts가 event_stream으로 전송.
 *         ControlResult 제거됨.
 */
export async function handleControlMessage (
  msg: ControlMessage,
  deps: ControlHandlerDeps
): Promise<CancelEventPayload | null> {
  const { facade, logger, queueManager } = deps
  if (!msg.type || !msg.payload) {
    logger.warn({ msg }, 'Malformed control message: missing type or payload')
    return null
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
        return { type: 'CancelFailed', cancelType: 'cancel_queued', messageId: '', reason: 'Missing messageId', timestamp: Date.now() }
      }
      const cancelResult = queueManager.cancelQueued(payload.messageId)
      if (cancelResult.ok) {
        return { type: 'CancelCompleted', cancelType: 'cancel_queued', messageId: payload.messageId, wasProcessing: false, timestamp: Date.now() }
      }
      return { type: 'CancelFailed', cancelType: 'cancel_queued', messageId: payload.messageId, reason: cancelResult.reason, timestamp: Date.now() }
    }

    // -----------------------------------------------------------------------
    // cancel_active -- abort a currently processing message
    // -----------------------------------------------------------------------
    case 'cancel_active': {
      const payload = msg.payload
      if (!payload.messageId) {
        return { type: 'CancelFailed', cancelType: 'cancel_active', messageId: '', reason: 'Missing messageId', timestamp: Date.now() }
      }
      const cancelResult = queueManager.cancelActive(payload.messageId)
      if (cancelResult.ok) {
        return { type: 'CancelCompleted', cancelType: 'cancel_active', messageId: payload.messageId, wasProcessing: cancelResult.wasProcessing, timestamp: Date.now() }
      }
      return { type: 'CancelFailed', cancelType: 'cancel_active', messageId: payload.messageId, reason: cancelResult.reason, timestamp: Date.now() }
    }

    // -----------------------------------------------------------------------
    // Unknown (runtime safety — wire may send unexpected types)
    // -----------------------------------------------------------------------
    default: {
      const unknownType: string = (msg as { type: string }).type
      logger.warn({ type: unknownType }, 'Unknown control message type')
      return null
    }
  }
}
