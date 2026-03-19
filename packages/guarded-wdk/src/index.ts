export { createGuardedWDK } from './guarded-wdk-factory.js'
export { SignedApprovalBroker } from './signed-approval-broker.js'
export { ApprovalStore } from './approval-store.js'
export { JsonApprovalStore } from './json-approval-store.js'
export { SqliteApprovalStore } from './sqlite-approval-store.js'
export { verifyApproval } from './approval-verifier.js'
export { verify, sign, generateKeyPair } from './crypto-utils.js'
export {
  ForbiddenError,
  PolicyRejectionError,
  ApprovalTimeoutError,
  SignatureError,
  UntrustedApproverError,
  DeviceRevokedError,
  ApprovalExpiredError,
  ReplayError
} from './errors.js'

// Re-export types
export type {
  SignedApproval,
  ApprovalRequest,
  ApprovalType,
  SignedPolicy,
  StoredPolicy,
  PendingApprovalRequest,
  HistoryEntry,
  DeviceRecord,
  CronInput,
  SeedRecord,
  JournalEntry,
  HistoryQueryOpts,
  JournalQueryOpts
} from './approval-store.js'
export type { VerificationContext } from './approval-verifier.js'
export type { KeyPair } from './crypto-utils.js'
export type { EvaluationResult, Rule, PermissionDict, SignTransactionResult } from './guarded-middleware.js'
export { permissionsToDict } from './guarded-middleware.js'
