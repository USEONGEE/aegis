// ---------------------------------------------------------------------------
// WDK Event Type System — v0.4.2
//
// 14종 WDK 이벤트의 타입 규격. guarded-wdk가 이 타입에 맞춰 emit하고,
// daemon이 relay를 통해 app에 전달한다.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

interface WDKEventBase {
  type: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Policy evaluation wire types (structurally compatible with guarded-wdk)
// ---------------------------------------------------------------------------

interface PolicyArgConditionWire {
  condition: string
  value: string | string[]
}

interface PolicyRuleWire {
  order: number
  args?: Record<string, PolicyArgConditionWire>
  valueLimit?: string | number
  decision: 'ALLOW' | 'REJECT'
}

interface PolicyFailedArgWire {
  argIndex: string
  condition: string
  expected: string | string[]
  actual: string
}

interface PolicyRuleFailureWire {
  rule: PolicyRuleWire
  failedArgs: PolicyFailedArgWire[]
}

interface PolicyEvaluationContextWire {
  target: string
  selector: string
  effectiveRules: PolicyRuleWire[]
  ruleFailures: PolicyRuleFailureWire[]
}

// ---------------------------------------------------------------------------
// Transaction Lifecycle (from guarded-middleware)
// ---------------------------------------------------------------------------

interface IntentProposedEvent extends WDKEventBase {
  type: 'IntentProposed'
  requestId: string
  tx: { to: string; data: string | undefined; value: string | undefined }
  chainId: number
}

type PolicyEvaluatedEvent =
  | (WDKEventBase & {
      type: 'PolicyEvaluated'
      requestId: string
      decision: 'ALLOW'
      matchedPermission: PolicyRuleWire
    })
  | (WDKEventBase & {
      type: 'PolicyEvaluated'
      requestId: string
      decision: 'REJECT'
      reason: string
    })
  | (WDKEventBase & {
      type: 'PolicyEvaluated'
      requestId: string
      decision: 'REJECT'
      reason: string
      context: PolicyEvaluationContextWire
    })

interface ExecutionBroadcastedEvent extends WDKEventBase {
  type: 'ExecutionBroadcasted'
  requestId: string
  hash: string
  fee: string | null
}

interface ExecutionSettledEvent extends WDKEventBase {
  type: 'ExecutionSettled'
  requestId: string
  hash: string
  status: string
  confirmedAt: number
}

interface ExecutionFailedEvent extends WDKEventBase {
  type: 'ExecutionFailed'
  requestId: string
  error: string
}

interface TransactionSignedEvent extends WDKEventBase {
  type: 'TransactionSigned'
  requestId: string
  intentHash: string
}

// ---------------------------------------------------------------------------
// Approval (from signed-approval-broker)
// ---------------------------------------------------------------------------

interface PendingPolicyRequestedEvent extends WDKEventBase {
  type: 'PendingPolicyRequested'
  requestId: string
  chainId: number
}

interface ApprovalVerifiedEvent extends WDKEventBase {
  type: 'ApprovalVerified'
  requestId: string
  approvalType: string
  approver: string
}

interface ApprovalRejectedEvent extends WDKEventBase {
  type: 'ApprovalRejected'
  requestId: string
}

interface PolicyAppliedEvent extends WDKEventBase {
  type: 'PolicyApplied'
  requestId: string
  chainId: number
}

// ---------------------------------------------------------------------------
// Identity (from signed-approval-broker)
// ---------------------------------------------------------------------------

interface SignerRevokedEvent extends WDKEventBase {
  type: 'SignerRevoked'
  requestId: string
  publicKey: string
}

interface WalletCreatedEvent extends WDKEventBase {
  type: 'WalletCreated'
  requestId: string
  accountIndex: number
  name: string
}

interface WalletDeletedEvent extends WDKEventBase {
  type: 'WalletDeleted'
  requestId: string
  accountIndex: number
}

// ---------------------------------------------------------------------------
// Failure (new in v0.4.2)
// ---------------------------------------------------------------------------

interface ApprovalFailedEvent extends WDKEventBase {
  type: 'ApprovalFailed'
  requestId: string
  approvalType: string
  error: string
}

// ---------------------------------------------------------------------------
// Union — WDK events (from guarded-wdk)
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

// ---------------------------------------------------------------------------
// Daemon-originated events (NOT WDK events)
// ---------------------------------------------------------------------------

export interface CancelCompletedEvent extends WDKEventBase {
  type: 'CancelCompleted'
  cancelType: 'cancel_queued' | 'cancel_active'
  messageId: string
  wasProcessing: boolean
}

export interface CancelFailedEvent extends WDKEventBase {
  type: 'CancelFailed'
  cancelType: 'cancel_queued' | 'cancel_active'
  messageId: string
  reason: string
}

export type DaemonEvent = CancelCompletedEvent | CancelFailedEvent

// ---------------------------------------------------------------------------
// Daemon → App async notifications (moved from control.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// event_stream channel payload
// ---------------------------------------------------------------------------

/** All events deliverable via the event_stream channel */
export type AnyStreamEvent =
  | AnyWDKEvent
  | DaemonEvent
  | MessageQueuedEvent
  | MessageStartedEvent
  | CronSessionCreatedEvent

/** event_stream channel payload — independent from ControlEvent */
export interface EventStreamPayload {
  event: AnyStreamEvent
}
