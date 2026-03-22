// ---------------------------------------------------------------------------
// WDK Event Type System — v0.4.2
//
// 14종 WDK 이벤트의 타입 규격. guarded-wdk가 이 타입에 맞춰 emit하고,
// daemon이 relay를 통해 app에 전달한다.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

export interface WDKEventBase {
  type: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Transaction Lifecycle (from guarded-middleware)
// ---------------------------------------------------------------------------

export interface IntentProposedEvent extends WDKEventBase {
  type: 'IntentProposed'
  requestId: string
  tx: { to: string; data: string | undefined; value: string | undefined }
  chainId: number
}

export interface PolicyEvaluatedEvent extends WDKEventBase {
  type: 'PolicyEvaluated'
  requestId: string
  decision: string
  matchedPermission: unknown
  reason: string | null
  context: unknown
}

export interface ExecutionBroadcastedEvent extends WDKEventBase {
  type: 'ExecutionBroadcasted'
  requestId: string
  hash: string
  fee: string | null
}

export interface ExecutionSettledEvent extends WDKEventBase {
  type: 'ExecutionSettled'
  requestId: string
  hash: string
  status: string
  confirmedAt: number
}

export interface ExecutionFailedEvent extends WDKEventBase {
  type: 'ExecutionFailed'
  requestId: string
  error: string
}

export interface TransactionSignedEvent extends WDKEventBase {
  type: 'TransactionSigned'
  requestId: string
  intentHash: string
}

// ---------------------------------------------------------------------------
// Approval (from signed-approval-broker)
// ---------------------------------------------------------------------------

export interface PendingPolicyRequestedEvent extends WDKEventBase {
  type: 'PendingPolicyRequested'
  requestId: string
  chainId: number
}

export interface ApprovalVerifiedEvent extends WDKEventBase {
  type: 'ApprovalVerified'
  requestId: string
  approvalType: string
  approver: string
}

export interface ApprovalRejectedEvent extends WDKEventBase {
  type: 'ApprovalRejected'
  requestId: string
}

export interface PolicyAppliedEvent extends WDKEventBase {
  type: 'PolicyApplied'
  requestId: string
  chainId: number
}

// ---------------------------------------------------------------------------
// Identity (from signed-approval-broker)
// ---------------------------------------------------------------------------

export interface SignerRevokedEvent extends WDKEventBase {
  type: 'SignerRevoked'
  requestId: string
  publicKey: string
}

export interface WalletCreatedEvent extends WDKEventBase {
  type: 'WalletCreated'
  requestId: string
  accountIndex: number
  name: string
}

export interface WalletDeletedEvent extends WDKEventBase {
  type: 'WalletDeleted'
  requestId: string
  accountIndex: number
}

// ---------------------------------------------------------------------------
// Failure (new in v0.4.2)
// ---------------------------------------------------------------------------

export interface ApprovalFailedEvent extends WDKEventBase {
  type: 'ApprovalFailed'
  requestId: string
  approvalType: string
  error: string
}

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

export type AnyWDKEvent =
  | IntentProposedEvent
  | PolicyEvaluatedEvent
  | ExecutionBroadcastedEvent
  | ExecutionSettledEvent
  | ExecutionFailedEvent
  | TransactionSignedEvent
  | PendingPolicyRequestedEvent
  | ApprovalVerifiedEvent
  | ApprovalRejectedEvent
  | PolicyAppliedEvent
  | SignerRevokedEvent
  | WalletCreatedEvent
  | WalletDeletedEvent
  | ApprovalFailedEvent
