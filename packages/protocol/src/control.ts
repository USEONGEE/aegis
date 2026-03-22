// ---------------------------------------------------------------------------
// Control channel wire types (app <-> daemon)
// ---------------------------------------------------------------------------

import type { AnyWDKEvent } from './events.js'

// --- app -> daemon: ControlMessage ---

export interface SignedApprovalFields {
  requestId: string
  signature: string
  approverPubKey: string
  chainId: number
  accountIndex: number
  signerId: string
  targetHash: string
  policyVersion: number
  expiresAt: number
  nonce: number
  content: string
}

interface PolicyApprovalPayload extends SignedApprovalFields {
  policies: Record<string, unknown>[]
}

interface DeviceRevokePayload extends SignedApprovalFields {
  targetPublicKey: string
}

interface CancelQueuedPayload {
  messageId: string
}

interface CancelActivePayload {
  messageId: string
}

export type ControlMessage =
  | { type: 'tx_approval'; payload: SignedApprovalFields }
  | { type: 'policy_approval'; payload: PolicyApprovalPayload }
  | { type: 'policy_reject'; payload: SignedApprovalFields }
  | { type: 'device_revoke'; payload: DeviceRevokePayload }
  | { type: 'wallet_create'; payload: SignedApprovalFields }
  | { type: 'wallet_delete'; payload: SignedApprovalFields }
  | { type: 'cancel_queued'; payload: CancelQueuedPayload }
  | { type: 'cancel_active'; payload: CancelActivePayload }

// --- daemon -> app: ControlResult ---

type ApprovalType = 'tx_approval' | 'policy_approval' | 'policy_reject' | 'device_revoke' | 'wallet_create' | 'wallet_delete'

interface ControlResultApprovalOk {
  ok: true
  type: ApprovalType
  requestId: string
}

interface ControlResultApprovalError {
  ok: false
  type: ApprovalType
  requestId: string
  error: string
}

interface ControlResultCancelQueuedOk {
  ok: true
  type: 'cancel_queued'
  messageId: string
}

interface ControlResultCancelQueuedError {
  ok: false
  type: 'cancel_queued'
  messageId: string
  reason: 'not_found' | 'already_completed'
}

interface ControlResultCancelActiveOk {
  ok: true
  type: 'cancel_active'
  messageId: string
  wasProcessing: boolean
}

interface ControlResultCancelActiveError {
  ok: false
  type: 'cancel_active'
  messageId: string
  reason: 'not_found' | 'already_completed'
}

interface ControlResultCancelError {
  ok: false
  type: 'cancel_queued' | 'cancel_active'
  error: string
}

interface ControlResultGenericError {
  ok: false
  error: string
}

export type ControlResult =
  | ControlResultApprovalOk
  | ControlResultApprovalError
  | ControlResultCancelQueuedOk
  | ControlResultCancelQueuedError
  | ControlResultCancelActiveOk
  | ControlResultCancelActiveError
  | ControlResultCancelError
  | ControlResultGenericError

// --- daemon -> app: ControlEvent (async notifications) ---

interface MessageQueuedEvent {
  type: 'message_queued'
  userId: string
  sessionId: string
  messageId: string
}

interface MessageStartedEvent {
  type: 'message_started'
  userId: string
  sessionId: string
  messageId: string
}

interface CronSessionCreatedEvent {
  type: 'cron_session_created'
  userId: string
  sessionId: string
  cronId: string
}

interface EventStreamEvent {
  type: 'event_stream'
  event: AnyWDKEvent
}

export type ControlEvent =
  | MessageQueuedEvent
  | MessageStartedEvent
  | CronSessionCreatedEvent
  | EventStreamEvent
