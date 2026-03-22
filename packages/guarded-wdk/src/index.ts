export { createGuardedWDK } from './guarded-wdk-factory.js'
export { SignedApprovalBroker } from './signed-approval-broker.js'
export type { ApprovalSubmitContext } from './signed-approval-broker.js'
export { WdkStore } from './wdk-store.js'
export { SqliteWdkStore } from './sqlite-wdk-store.js'
export { JsonWdkStore } from './json-wdk-store.js'
export { ExecutionJournal } from './execution-journal.js'
export { verifyApproval } from './approval-verifier.js'
export { verify } from './crypto-utils.js'
export {
  ForbiddenError,
  PolicyRejectionError,
  DuplicateIntentError,
  ApprovalTimeoutError,
  SignatureError,
  UntrustedApproverError,
  SignerRevokedError,
  ApprovalExpiredError,
  ReplayError
} from './errors.js'

// Re-export types
export type {
  SignedApproval,
  ApprovalRequest,
  ApprovalType,
  JournalStatus,
  HistoryAction,
  PolicyInput,
  StoredPolicy,
  PendingApprovalRequest,
  HistoryEntry,
  StoredSigner,
  SignerStatus,
  MasterSeed,
  StoredWallet,
  JournalInput,
  StoredJournal,
  HistoryQueryOpts,
  JournalQueryOpts,
  RejectionEntry,
  PolicyVersionEntry,
  RejectionQueryOpts,
  PendingApprovalFilter,
  PolicyDiff
} from './wdk-store.js'
export type { VerificationTarget } from './approval-verifier.js'
export type { EvaluationContext, EvaluationResult, AllowResult, SimpleRejectResult, DetailedRejectResult, Rule, PermissionDict, ArgCondition, Decision, Policy } from './guarded-middleware.js'
export { validatePolicies } from './guarded-middleware.js'
