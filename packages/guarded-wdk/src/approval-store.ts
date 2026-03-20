// Internal store row types (not part of public API)
import type { PendingApprovalRow, CronRow } from './store-types.js'

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
  policies: unknown[]
  signature: Record<string, unknown>
}

export interface StoredPolicy extends PolicyInput {
  accountIndex: number
  chainId: number
  policyVersion: number
  updatedAt: number
}

export interface PendingApprovalRequest extends ApprovalRequest {
  walletName?: string
}

// PendingApprovalRow: see store-types.ts (@internal)

export interface HistoryEntry {
  accountIndex: number
  requestId?: string
  type: ApprovalType
  chainId?: number | null
  targetHash: string
  approver: string
  action: HistoryAction
  content?: string
  signedApproval?: SignedApproval
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
  targetHash: string
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
  targetHash: string
  reason: string
  context: unknown
  policyVersion: number
  rejectedAt: number
}

export interface PolicyVersionEntry {
  accountIndex: number
  chainId: number
  version: number
  description: string
  diff: unknown
  changedAt: number
}

export interface RejectionQueryOpts {
  accountIndex?: number
  chainId?: number
  limit?: number
}

/**
 * Abstract interface for approval/policy/wallet/cron persistence.
 * Implementations: JsonApprovalStore, SqliteApprovalStore.
 */
export abstract class ApprovalStore {
  // --- Master Seed ---

  async getMasterSeed (): Promise<MasterSeed | null> { throw new Error('Not implemented') }
  async setMasterSeed (_mnemonic: string): Promise<void> { throw new Error('Not implemented') }

  // --- Wallets ---

  async listWallets (): Promise<StoredWallet[]> { throw new Error('Not implemented') }
  async getWallet (_accountIndex: number): Promise<StoredWallet | null> { throw new Error('Not implemented') }
  async createWallet (_accountIndex: number, _name: string, _address: string): Promise<StoredWallet> { throw new Error('Not implemented') }
  async deleteWallet (_accountIndex: number): Promise<void> { throw new Error('Not implemented') }

  // --- Active Policy ---

  async loadPolicy (_accountIndex: number, _chainId: number): Promise<StoredPolicy | null> { throw new Error('Not implemented') }
  async savePolicy (_accountIndex: number, _chainId: number, _input: PolicyInput, _description: string): Promise<void> { throw new Error('Not implemented') }
  async getPolicyVersion (_accountIndex: number, _chainId: number): Promise<number> { throw new Error('Not implemented') }
  async listPolicyChains (_accountIndex: number): Promise<string[]> { throw new Error('Not implemented') }

  // --- Pending Requests ---

  async loadPendingApprovals (_accountIndex: number | null, _type: string | null, _chainId: number | null): Promise<PendingApprovalRequest[]> { throw new Error('Not implemented') }
  async loadPendingByRequestId (_requestId: string): Promise<PendingApprovalRequest | null> { throw new Error('Not implemented') }
  async savePendingApproval (_accountIndex: number, _request: ApprovalRequest): Promise<void> { throw new Error('Not implemented') }
  async removePendingApproval (_requestId: string): Promise<void> { throw new Error('Not implemented') }

  // --- History ---

  async appendHistory (_entry: HistoryEntry): Promise<void> { throw new Error('Not implemented') }
  async getHistory (_opts: HistoryQueryOpts): Promise<HistoryEntry[]> { throw new Error('Not implemented') }

  // --- Signers ---

  async saveSigner (_publicKey: string, _name?: string): Promise<void> { throw new Error('Not implemented') }
  async getSigner (_publicKey: string): Promise<StoredSigner | null> { throw new Error('Not implemented') }
  async listSigners (): Promise<StoredSigner[]> { throw new Error('Not implemented') }
  async revokeSigner (_publicKey: string): Promise<void> { throw new Error('Not implemented') }
  async isSignerRevoked (_publicKey: string): Promise<boolean> { throw new Error('Not implemented') }

  // --- Nonce ---

  async getLastNonce (_approver: string): Promise<number> { throw new Error('Not implemented') }
  async updateNonce (_approver: string, _nonce: number): Promise<void> { throw new Error('Not implemented') }

  // --- Cron ---

  async listCrons (_accountIndex?: number): Promise<StoredCron[]> { throw new Error('Not implemented') }
  async saveCron (_accountIndex: number, _cron: CronInput): Promise<string> { throw new Error('Not implemented') }
  async removeCron (_cronId: string): Promise<void> { throw new Error('Not implemented') }
  async updateCronLastRun (_cronId: string, _timestamp: number): Promise<void> { throw new Error('Not implemented') }

  // --- Execution Journal ---

  async getJournalEntry (_intentHash: string): Promise<StoredJournal | null> { throw new Error('Not implemented') }
  async saveJournalEntry (_entry: JournalInput): Promise<void> { throw new Error('Not implemented') }
  async updateJournalStatus (_intentHash: string, _status: JournalStatus, _txHash?: string): Promise<void> { throw new Error('Not implemented') }
  async listJournal (_opts: JournalQueryOpts): Promise<StoredJournal[]> { throw new Error('Not implemented') }

  // --- Rejection History ---

  async saveRejection (_entry: RejectionEntry): Promise<void> { throw new Error('Not implemented') }
  async listRejections (_opts: RejectionQueryOpts): Promise<RejectionEntry[]> { throw new Error('Not implemented') }

  // --- Policy Versions ---

  async listPolicyVersions (_accountIndex: number, _chainId: number): Promise<PolicyVersionEntry[]> { throw new Error('Not implemented') }

  // --- Lifecycle ---

  async init (): Promise<void> {}
  async dispose (): Promise<void> {}
}
