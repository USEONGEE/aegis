// ---------------------------------------------------------------------------
// Control channel wire types (app → daemon, unidirectional)
//
// v0.4.8: control is app→daemon only. All daemon→app notifications
// (ControlResult, ControlEvent) removed — moved to event_stream channel.
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

interface PolicyApprovalPayload extends SignedApprovalFields {
  policies: Record<string, unknown>[]
}

interface DeviceRevokePayload extends SignedApprovalFields {
  targetPublicKey: string
}

export interface DeviceRegisterPayload {
  publicKey: string
  deviceId: string
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
  | { type: 'device_register'; payload: DeviceRegisterPayload }
  | { type: 'cancel_queued'; payload: CancelQueuedPayload }
  | { type: 'cancel_active'; payload: CancelActivePayload }
