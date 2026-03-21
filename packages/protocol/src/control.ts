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

export interface ControlResult {
  ok: boolean
  type?: string
  requestId?: string
  messageId?: string
  error?: string
  reason?: string
  wasProcessing?: boolean
}

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
