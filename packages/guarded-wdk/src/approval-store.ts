// --- Domain interfaces ---

export type ApprovalType = 'tx' | 'policy' | 'policy_reject' | 'device_revoke'

export interface SignedApproval {
  type: ApprovalType
  requestId: string
  chain: string
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
  chain: string
  targetHash: string
  metadata?: Record<string, unknown>
  createdAt: number
}

export interface SignedPolicy {
  policies_json?: string
  signature_json?: string
  wdk_countersig?: string
  policies?: unknown[]
  signature?: Record<string, unknown>
  [key: string]: unknown
}

export interface StoredPolicy extends SignedPolicy {
  seed_id: string
  chain: string
  policy_version: number
  updated_at: number
}

export interface PendingRequest {
  request_id: string
  seed_id: string
  type: string
  chain: string
  target_hash: string
  metadata_json: string | null
  created_at: number
}

export interface HistoryEntry {
  seedId?: string
  seed_id?: string
  requestId?: string
  type: string
  chain?: string | null
  targetHash?: string
  target_hash?: string
  approver: string
  deviceId?: string
  device_id?: string
  action: string
  signedApproval?: SignedApproval
  signed_approval_json?: string | null
  timestamp?: number
}

export interface StoredHistoryEntry {
  id?: number
  seed_id: string
  type: string
  chain: string | null
  target_hash: string
  approver: string
  device_id: string
  action: string
  signed_approval_json: string | null
  timestamp: number
}

export interface DeviceRecord {
  device_id: string
  public_key: string
  name: string | null
  paired_at: number
  revoked_at: number | null
}

export interface CronRecord {
  id: string
  seed_id: string
  session_id: string
  interval: string
  prompt: string
  chain: string | null
  created_at: number
  last_run_at: number | null
  is_active: number
}

export interface CronInput {
  id?: string
  sessionId?: string
  session_id?: string
  interval: string
  prompt: string
  chain?: string | null
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
  intent_id?: string
  seedId?: string
  seed_id?: string
  chain: string
  targetHash?: string
  target_hash?: string
  status: string
  txHash?: string | null
  tx_hash?: string | null
  createdAt?: number
  created_at?: number
  updatedAt?: number
  updated_at?: number
}

export interface StoredJournalEntry {
  intent_id: string
  seed_id: string
  chain: string
  target_hash: string
  status: string
  tx_hash: string | null
  created_at: number
  updated_at: number
}

export interface HistoryQueryOpts {
  seedId?: string
  type?: string
  chain?: string
  limit?: number
}

export interface JournalQueryOpts {
  seedId?: string
  status?: string
  chain?: string
  limit?: number
}

/**
 * Abstract interface for approval/policy/seed/cron persistence.
 * Implementations: JsonApprovalStore, SqliteApprovalStore.
 */
export abstract class ApprovalStore {
  // --- Active Policy ---

  async loadPolicy (_seedId: string, _chain: string): Promise<StoredPolicy | null> { throw new Error('Not implemented') }
  async savePolicy (_seedId: string, _chain: string, _signedPolicy: SignedPolicy): Promise<void> { throw new Error('Not implemented') }
  async getPolicyVersion (_seedId: string, _chain: string): Promise<number> { throw new Error('Not implemented') }

  // --- Pending Requests ---

  async loadPending (_seedId: string | null, _type: string | null, _chain: string | null): Promise<PendingRequest[]> { throw new Error('Not implemented') }
  async savePending (_seedId: string, _request: ApprovalRequest): Promise<void> { throw new Error('Not implemented') }
  async removePending (_requestId: string): Promise<void> { throw new Error('Not implemented') }

  // --- History ---

  async appendHistory (_entry: HistoryEntry): Promise<void> { throw new Error('Not implemented') }
  async getHistory (_opts: HistoryQueryOpts): Promise<StoredHistoryEntry[]> { throw new Error('Not implemented') }

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

  async getJournalEntry (_intentId: string): Promise<StoredJournalEntry | null> { throw new Error('Not implemented') }
  async saveJournalEntry (_entry: JournalEntry): Promise<void> { throw new Error('Not implemented') }
  async updateJournalStatus (_intentId: string, _status: string, _txHash?: string): Promise<void> { throw new Error('Not implemented') }
  async listJournal (_opts: JournalQueryOpts): Promise<StoredJournalEntry[]> { throw new Error('Not implemented') }

  // --- Lifecycle ---

  async init (): Promise<void> {}
  async dispose (): Promise<void> {}
}
