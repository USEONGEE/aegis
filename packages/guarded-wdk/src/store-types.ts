/**
 * @internal — snake_case row types used by store implementations.
 * NOT part of the public API. Do not import from outside this package.
 */
import type { ApprovalType, HistoryAction, JournalStatus } from './approval-store.js'

/** @internal snake_case representation for store implementations. */
export interface PendingApprovalRow {
  request_id: string
  account_index: number
  type: string
  chain_id: number
  target_hash: string
  content: string
  wallet_name: string | null
  created_at: number
}

/** @internal */
export interface StoredHistoryEntry {
  id?: number
  account_index: number
  request_id: string
  type: ApprovalType
  chain_id: number | null
  target_hash: string
  approver: string
  action: HistoryAction
  content: string
  signed_approval_json: string | null
  timestamp: number
}

/** @internal */
export interface CronRow {
  id: string
  account_index: number
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
  intent_hash: string
  account_index: number
  chain_id: number
  target_hash: string
  status: JournalStatus
  tx_hash: string | null
  created_at: number
  updated_at: number
}

/** @internal */
export interface SignerRow {
  public_key: string
  name: string | null
  registered_at: number
  revoked_at: number | null
}

/** @internal */
export interface MasterSeedRow {
  id: number
  mnemonic: string
  created_at: number
}

/** @internal */
export interface WalletRow {
  account_index: number
  name: string
  address: string
  created_at: number
}

/** @internal */
export interface PolicyRow {
  account_index: number
  chain_id: number
  policies_json: string
  signature_json: string
  policy_version: number
  updated_at: number
}

/** @internal */
export interface RejectionRow {
  id?: number
  intent_hash: string
  account_index: number
  chain_id: number
  target_hash: string
  reason: string
  context_json: string | null
  policy_version: number
  rejected_at: number
}

/** @internal */
export interface PolicyVersionRow {
  id?: number
  account_index: number
  chain_id: number
  version: number
  description: string
  diff_json: string | null
  changed_at: number
}
