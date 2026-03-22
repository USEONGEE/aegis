// ---------------------------------------------------------------------------
// Control channel wire types (app <-> daemon)
// ---------------------------------------------------------------------------

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

export interface PolicyApprovalPayload extends SignedApprovalFields {
  policies: Record<string, unknown>[]
}

export interface DeviceRevokePayload extends SignedApprovalFields {
  targetPublicKey: string
}

export interface CancelQueuedPayload {
  messageId: string
}

export interface CancelActivePayload {
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

export type ApprovalType = 'tx_approval' | 'policy_approval' | 'policy_reject' | 'device_revoke' | 'wallet_create' | 'wallet_delete'

export interface ControlResultApprovalOk {
  ok: true
  type: ApprovalType
  requestId: string
}

export interface ControlResultApprovalError {
  ok: false
  type: ApprovalType
  requestId: string
  error: string
}

export interface ControlResultCancelQueuedOk {
  ok: true
  type: 'cancel_queued'
  messageId: string
}

export interface ControlResultCancelQueuedError {
  ok: false
  type: 'cancel_queued'
  messageId: string
  reason: 'not_found' | 'already_completed'
}

export interface ControlResultCancelActiveOk {
  ok: true
  type: 'cancel_active'
  messageId: string
  wasProcessing: boolean
}

export interface ControlResultCancelActiveError {
  ok: false
  type: 'cancel_active'
  messageId: string
  reason: 'not_found' | 'already_completed'
}

export interface ControlResultCancelError {
  ok: false
  type: 'cancel_queued' | 'cancel_active'
  error: string
}

export interface ControlResultGenericError {
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

export interface MessageQueuedEvent {
  type: 'message_queued'
  userId: string
  sessionId: string
  messageId: string
}

export interface MessageStartedEvent {
  type: 'message_started'
  userId: string
  sessionId: string
  messageId: string
}

export interface CronSessionCreatedEvent {
  type: 'cron_session_created'
  userId: string
  sessionId: string
  cronId: string
}

export interface EventStreamEvent {
  type: 'event_stream'
  eventName: string
  event: unknown
}

export type ControlEvent =
  | MessageQueuedEvent
  | MessageStartedEvent
  | CronSessionCreatedEvent
  | EventStreamEvent
