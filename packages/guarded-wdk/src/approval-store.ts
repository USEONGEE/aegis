// Internal store row types (not part of public API)
import type { PendingApprovalRow, CronRow } from './store-types.js'

// --- Domain interfaces ---

export type ApprovalType = 'tx' | 'policy' | 'policy_reject' | 'device_revoke'

export interface SignedApproval {
  type: ApprovalType
  requestId: string
  chainId: number
  targetHash: string
  approver: string
  deviceId: string
  policyVersion: number
  expiresAt: number
  nonce: number
  sig: string
  metadata?: Record<string, unknown>
}

export interface ApprovalRequest {
  requestId: string
  type: ApprovalType
  chainId: number
  targetHash: string
  metadata?: Record<string, unknown>
  createdAt: number
}

export interface PolicyInput {
  policies: unknown[]
  signature: Record<string, unknown>
}

export interface StoredPolicy {
  seedId: string
  chainId: number
  policiesJson: string
  signatureJson: string
  policyVersion: number
  updatedAt: number
}

export interface PendingApprovalRequest extends ApprovalRequest {
  seedId: string
}

// PendingApprovalRow: see store-types.ts (@internal)

export interface HistoryEntry {
  seedId: string
  requestId?: string
  type: string
  chainId?: number | null
  targetHash: string
  approver: string
  deviceId: string
  action: string
  signedApproval?: SignedApproval
  timestamp: number
}

// StoredHistoryEntry moved to store-types.ts (@internal)

export interface StoredDevice {
  deviceId: string
  publicKey: string
  name: string | null
  pairedAt: number
  revokedAt: number | null
}

// CronRow: see store-types.ts (@internal)

export interface CronInput {
  sessionId: string
  interval: string
  prompt: string
  chainId: number | null
}

export interface StoredCron {
  id: string
  seedId: string
  sessionId: string
  interval: string
  prompt: string
  chainId: number | null
  createdAt: number
  lastRunAt: number | null
  isActive: boolean
}

export interface StoredSeed {
  id: string
  name: string
  mnemonic: string
  createdAt: number
  isActive: boolean
}

export interface JournalInput {
  intentId: string
  seedId: string
  chainId: number
  targetHash: string
  status: string
}

export interface StoredJournal {
  intentId: string
  seedId: string
  chainId: number
  targetHash: string
  status: string
  txHash: string | null
  createdAt: number
  updatedAt: number
}

// StoredJournalEntry moved to store-types.ts (@internal)

export interface HistoryQueryOpts {
  seedId?: string
  type?: string
  chainId?: number
  limit?: number
}

export interface JournalQueryOpts {
  seedId?: string
  status?: string
  chainId?: number
  limit?: number
}

/**
 * Abstract interface for approval/policy/seed/cron persistence.
 * Implementations: JsonApprovalStore, SqliteApprovalStore.
 */
export abstract class ApprovalStore {
  // --- Active Policy ---

  async loadPolicy (_seedId: string, _chainId: number): Promise<StoredPolicy | null> { throw new Error('Not implemented') }
  async savePolicy (_seedId: string, _chainId: number, _input: PolicyInput): Promise<void> { throw new Error('Not implemented') }
  async getPolicyVersion (_seedId: string, _chainId: number): Promise<number> { throw new Error('Not implemented') }
  async listPolicyChains (_seedId: string): Promise<string[]> { throw new Error('Not implemented') }

  // --- Pending Requests ---

  async loadPendingApprovals (_seedId: string | null, _type: string | null, _chainId: number | null): Promise<PendingApprovalRequest[]> { throw new Error('Not implemented') }
  async loadPendingByRequestId (_requestId: string): Promise<PendingApprovalRequest | null> { throw new Error('Not implemented') }
  async savePendingApproval (_seedId: string, _request: ApprovalRequest): Promise<void> { throw new Error('Not implemented') }
  async removePendingApproval (_requestId: string): Promise<void> { throw new Error('Not implemented') }

  // --- History ---

  async appendHistory (_entry: HistoryEntry): Promise<void> { throw new Error('Not implemented') }
  async getHistory (_opts: HistoryQueryOpts): Promise<HistoryEntry[]> { throw new Error('Not implemented') }

  // --- Devices ---

  async saveDevice (_deviceId: string, _publicKey: string): Promise<void> { throw new Error('Not implemented') }
  async getDevice (_deviceId: string): Promise<StoredDevice | null> { throw new Error('Not implemented') }
  async listDevices (): Promise<StoredDevice[]> { throw new Error('Not implemented') }
  async revokeDevice (_deviceId: string): Promise<void> { throw new Error('Not implemented') }
  async isDeviceRevoked (_deviceId: string): Promise<boolean> { throw new Error('Not implemented') }

  // --- Nonce ---

  async getLastNonce (_approver: string, _deviceId: string): Promise<number> { throw new Error('Not implemented') }
  async updateNonce (_approver: string, _deviceId: string, _nonce: number): Promise<void> { throw new Error('Not implemented') }

  // --- Cron ---

  async listCrons (_seedId?: string): Promise<StoredCron[]> { throw new Error('Not implemented') }
  async saveCron (_seedId: string, _cron: CronInput): Promise<string> { throw new Error('Not implemented') }
  async removeCron (_cronId: string): Promise<void> { throw new Error('Not implemented') }
  async updateCronLastRun (_cronId: string, _timestamp: number): Promise<void> { throw new Error('Not implemented') }

  // --- Seeds ---

  async listSeeds (): Promise<StoredSeed[]> { throw new Error('Not implemented') }
  async getSeed (_seedId: string): Promise<StoredSeed | null> { throw new Error('Not implemented') }
  async addSeed (_name: string, _mnemonic: string): Promise<StoredSeed> { throw new Error('Not implemented') }
  async removeSeed (_seedId: string): Promise<void> { throw new Error('Not implemented') }
  async setActiveSeed (_seedId: string): Promise<void> { throw new Error('Not implemented') }
  async getActiveSeed (): Promise<StoredSeed | null> { throw new Error('Not implemented') }

  // --- Execution Journal ---

  async getJournalEntry (_intentId: string): Promise<StoredJournal | null> { throw new Error('Not implemented') }
  async saveJournalEntry (_entry: JournalInput): Promise<void> { throw new Error('Not implemented') }
  async updateJournalStatus (_intentId: string, _status: string, _txHash?: string): Promise<void> { throw new Error('Not implemented') }
  async listJournal (_opts: JournalQueryOpts): Promise<StoredJournal[]> { throw new Error('Not implemented') }

  // --- Lifecycle ---

  async init (): Promise<void> {}
  async dispose (): Promise<void> {}
}
