// Internal store row types (not part of public API)
import type { PendingApprovalRow, CronRow } from './store-types.js'
import type { Policy, EvaluationContext } from './guarded-middleware.js'

// --- Domain interfaces ---

export type ApprovalType = 'tx' | 'policy' | 'policy_reject' | 'device_revoke' | 'wallet_create' | 'wallet_delete'

export type JournalStatus = 'received' | 'settled' | 'signed' | 'failed' | 'rejected'

export type HistoryAction = 'approved' | 'rejected'

// --- Master Seed & Wallet ---

export interface MasterSeed {
  mnemonic: string
  createdAt: number
}

export interface StoredWallet {
  accountIndex: number
  name: string
  address: string
  createdAt: number
}

// --- Approval ---

export interface SignedApproval {
  type: ApprovalType
  requestId: string
  chainId: number
  targetHash: string
  approver: string
  accountIndex: number
  policyVersion: number
  expiresAt: number
  nonce: number
  sig: string
  content: string
}

export interface ApprovalRequest {
  requestId: string
  type: ApprovalType
  chainId: number
  targetHash: string
  accountIndex: number
  content: string
  createdAt: number
}

export interface PolicyInput {
  policies: Policy[]
  signature: Record<string, unknown>
}

export interface StoredPolicy extends PolicyInput {
  accountIndex: number
  chainId: number
  policyVersion: number
  updatedAt: number
}

export interface PendingApprovalRequest extends ApprovalRequest {
  walletName: string | null
}

// PendingApprovalRow: see store-types.ts (@internal)

export interface HistoryEntry {
  accountIndex: number
  requestId: string
  type: ApprovalType
  chainId: number | null
  targetHash: string
  approver: string
  action: HistoryAction
  content: string
  signedApproval: SignedApproval | null
  timestamp: number
}

// StoredHistoryEntry moved to store-types.ts (@internal)

export interface StoredSigner {
  publicKey: string
  name: string | null
  registeredAt: number
  revokedAt: number | null
}

// CronRow: see store-types.ts (@internal)

export interface CronInput {
  sessionId: string
  interval: string
  prompt: string
  chainId: number | null
}

export interface StoredCron extends CronInput {
  id: string
  accountIndex: number
  createdAt: number
  lastRunAt: number | null
  isActive: boolean
}

export interface JournalInput {
  intentHash: string
  accountIndex: number
  chainId: number
  dedupKey: string
  status: JournalStatus
}

export interface StoredJournal extends JournalInput {
  txHash: string | null
  createdAt: number
  updatedAt: number
}

// StoredJournalEntry moved to store-types.ts (@internal)

export interface HistoryQueryOpts {
  accountIndex?: number
  type?: ApprovalType
  chainId?: number
  limit?: number
}

export interface JournalQueryOpts {
  accountIndex?: number
  status?: JournalStatus
  chainId?: number
  limit?: number
}

export interface RejectionEntry {
  intentHash: string
  accountIndex: number
  chainId: number
  dedupKey: string
  reason: string
  context: EvaluationContext | null
  policyVersion: number
  rejectedAt: number
}

export interface PolicyDiff {
  added: Policy[]
  removed: Policy[]
  modified: Array<{ before: Policy; after: Policy }>
}

export interface PolicyVersionEntry {
  accountIndex: number
  chainId: number
  version: number
  description: string
  diff: PolicyDiff | null
  changedAt: number
}

export interface RejectionQueryOpts {
  accountIndex?: number
  chainId?: number
  limit?: number
}

/**
 * Abstract interface for WDK persistence (wallet, policy, approval, journal, rejection).
 * Cron persistence is handled by DaemonStore in the daemon package.
 * Implementations: JsonWdkStore, SqliteWdkStore.
 */
export abstract class WdkStore {
  // --- Master Seed ---

  abstract getMasterSeed (): Promise<MasterSeed | null>
  abstract setMasterSeed (mnemonic: string): Promise<void>

  // --- Wallets ---

  abstract listWallets (): Promise<StoredWallet[]>
  abstract getWallet (accountIndex: number): Promise<StoredWallet | null>
  abstract createWallet (accountIndex: number, name: string, address: string): Promise<StoredWallet>
  abstract deleteWallet (accountIndex: number): Promise<void>

  // --- Active Policy ---

  abstract loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null>
  abstract savePolicy (accountIndex: number, chainId: number, input: PolicyInput, description: string): Promise<void>
  abstract getPolicyVersion (accountIndex: number, chainId: number): Promise<number>
  abstract listPolicyChains (accountIndex: number): Promise<string[]>

  // --- Pending Requests ---

  abstract loadPendingApprovals (accountIndex: number | null, type: string | null, chainId: number | null): Promise<PendingApprovalRequest[]>
  abstract loadPendingByRequestId (requestId: string): Promise<PendingApprovalRequest | null>
  abstract savePendingApproval (accountIndex: number, request: ApprovalRequest): Promise<void>
  abstract removePendingApproval (requestId: string): Promise<void>

  // --- History ---

  abstract appendHistory (entry: HistoryEntry): Promise<void>
  abstract getHistory (opts: HistoryQueryOpts): Promise<HistoryEntry[]>

  // --- Signers ---

  abstract saveSigner (publicKey: string, name: string | null): Promise<void>
  abstract getSigner (publicKey: string): Promise<StoredSigner | null>
  abstract listSigners (): Promise<StoredSigner[]>
  abstract revokeSigner (publicKey: string): Promise<void>
  abstract isSignerRevoked (publicKey: string): Promise<boolean>

  // --- Nonce ---

  abstract getLastNonce (approver: string): Promise<number>
  abstract updateNonce (approver: string, nonce: number): Promise<void>

  // --- Execution Journal ---

  abstract getJournalEntry (intentHash: string): Promise<StoredJournal | null>
  abstract saveJournalEntry (entry: JournalInput): Promise<void>
  abstract updateJournalStatus (intentHash: string, status: JournalStatus, txHash: string | null): Promise<void>
  abstract listJournal (opts: JournalQueryOpts): Promise<StoredJournal[]>

  // --- Rejection History ---

  abstract saveRejection (entry: RejectionEntry): Promise<void>
  abstract listRejections (opts: RejectionQueryOpts): Promise<RejectionEntry[]>

  // --- Policy Versions ---

  abstract listPolicyVersions (accountIndex: number, chainId: number): Promise<PolicyVersionEntry[]>

  // --- Lifecycle ---

  async init (): Promise<void> {}
  async dispose (): Promise<void> {}
}
