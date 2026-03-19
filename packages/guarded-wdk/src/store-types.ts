/**
 * @internal — snake_case row types used by store implementations.
 * NOT part of the public API. Do not import from outside this package.
 */

/** @internal snake_case representation for store implementations. */
export interface PendingApprovalRow {
  request_id: string
  seed_id: string
  type: string
  chain_id: number
  target_hash: string
  metadata_json: string | null
  created_at: number
}

/** @internal */
export interface StoredHistoryEntry {
  id?: number
  seed_id: string
  type: string
  chain_id: number | null
  target_hash: string
  approver: string
  device_id: string
  action: string
  signed_approval_json: string | null
  timestamp: number
}

/** @internal */
export interface CronRow {
  id: string
  seed_id: string
  session_id: string
  interval: string
  prompt: string
  chain_id: number | null
  created_at: number
  last_run_at: number | null
  is_active: number
}

/** @internal */
export interface StoredJournalEntry {
  intent_id: string
  seed_id: string
  chain_id: number
  target_hash: string
  status: string
  tx_hash: string | null
  created_at: number
  updated_at: number
}

/** @internal */
export interface DeviceRow {
  device_id: string
  public_key: string
  name: string | null
  paired_at: number
  revoked_at: number | null
}

/** @internal */
export interface SeedRow {
  id: string
  name: string
  mnemonic: string
  created_at: number
  is_active: number
}

/** @internal */
export interface PolicyRow {
  seed_id: string
  chain_id: number
  policies_json: string
  signature_json: string
  policy_version: number
  updated_at: number
}
