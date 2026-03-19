// Internal store row types (not part of public API)
import type { PendingRequest, CronRecord } from './store-types.js'

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

export interface SignedPolicy {
  policies_json?: string
  signature_json?: string
  policies?: unknown[]
  signature?: Record<string, unknown>
  [key: string]: unknown
}

export interface StoredPolicy extends SignedPolicy {
  seed_id: string
  chain_id: number
  policy_version: number
  updated_at: number
}

export interface PendingApprovalRequest {
  requestId: string
  seedId: string
  type: string
  chainId: number
  targetHash: string
  metadata?: Record<string, unknown>
  createdAt: number
}

// PendingRequest: see store-types.ts (@internal)

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

export interface DeviceRecord {
  device_id: string
  public_key: string
  name: string | null
  paired_at: number
  revoked_at: number | null
}

// CronRecord: see store-types.ts (@internal)

export interface CronInput {
  id?: string
  sessionId?: string
  interval: string
  prompt: string
  chainId?: number | null
  createdAt?: number
}

export interface SeedRecord {
  id: string
  name: string
  mnemonic: string
  created_at: number
  is_active: number
}

export interface JournalEntry {
  intentId?: string
  seedId?: string
  chainId: number
  targetHash?: string
  status: string
  txHash?: string | null
  createdAt?: number
  updatedAt?: number
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
  async savePolicy (_seedId: string, _chainId: number, _signedPolicy: SignedPolicy): Promise<void> { throw new Error('Not implemented') }
  async getPolicyVersion (_seedId: string, _chainId: number): Promise<number> { throw new Error('Not implemented') }
  async listPolicyChains (_seedId: string): Promise<string[]> { throw new Error('Not implemented') }

  // --- Pending Requests ---

  async loadPendingApprovals (_seedId: string | null, _type: string | null, _chainId: number | null): Promise<PendingApprovalRequest[]> { throw new Error('Not implemented') }
  async loadPendingByRequestId (_requestId: string): Promise<PendingRequest | null> { throw new Error('Not implemented') }
  async savePendingApproval (_seedId: string, _request: ApprovalRequest): Promise<void> { throw new Error('Not implemented') }
  async removePendingApproval (_requestId: string): Promise<void> { throw new Error('Not implemented') }

  // --- History ---

  async appendHistory (_entry: HistoryEntry): Promise<void> { throw new Error('Not implemented') }
  async getHistory (_opts: HistoryQueryOpts): Promise<HistoryEntry[]> { throw new Error('Not implemented') }

  // --- Devices ---

  async saveDevice (_deviceId: string, _publicKey: string): Promise<void> { throw new Error('Not implemented') }
  async getDevice (_deviceId: string): Promise<DeviceRecord | null> { throw new Error('Not implemented') }
  async listDevices (): Promise<DeviceRecord[]> { throw new Error('Not implemented') }
  async revokeDevice (_deviceId: string): Promise<void> { throw new Error('Not implemented') }
  async isDeviceRevoked (_deviceId: string): Promise<boolean> { throw new Error('Not implemented') }

  // --- Nonce ---

  async getLastNonce (_approver: string, _deviceId: string): Promise<number> { throw new Error('Not implemented') }
  async updateNonce (_approver: string, _deviceId: string, _nonce: number): Promise<void> { throw new Error('Not implemented') }

  // --- Cron ---

  async listCrons (_seedId?: string): Promise<CronRecord[]> { throw new Error('Not implemented') }
  async saveCron (_seedId: string, _cron: CronInput): Promise<void> { throw new Error('Not implemented') }
  async removeCron (_cronId: string): Promise<void> { throw new Error('Not implemented') }
  async updateCronLastRun (_cronId: string, _timestamp: number): Promise<void> { throw new Error('Not implemented') }

  // --- Seeds ---

  async listSeeds (): Promise<SeedRecord[]> { throw new Error('Not implemented') }
  async getSeed (_seedId: string): Promise<SeedRecord | null> { throw new Error('Not implemented') }
  async addSeed (_name: string, _mnemonic: string): Promise<SeedRecord> { throw new Error('Not implemented') }
  async removeSeed (_seedId: string): Promise<void> { throw new Error('Not implemented') }
  async setActiveSeed (_seedId: string): Promise<void> { throw new Error('Not implemented') }
  async getActiveSeed (): Promise<SeedRecord | null> { throw new Error('Not implemented') }

  // --- Execution Journal ---

  async getJournalEntry (_intentId: string): Promise<JournalEntry | null> { throw new Error('Not implemented') }
  async saveJournalEntry (_entry: JournalEntry): Promise<void> { throw new Error('Not implemented') }
  async updateJournalStatus (_intentId: string, _status: string, _txHash?: string): Promise<void> { throw new Error('Not implemented') }
  async listJournal (_opts: JournalQueryOpts): Promise<JournalEntry[]> { throw new Error('Not implemented') }

  // --- Lifecycle ---

  async init (): Promise<void> {}
  async dispose (): Promise<void> {}
}
