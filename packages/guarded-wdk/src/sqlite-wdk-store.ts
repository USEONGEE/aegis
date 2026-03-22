import { randomUUID } from 'node:crypto'
import { chmodSync } from 'node:fs'
import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import {
  WdkStore,
  type PolicyInput,
  type StoredPolicy,
  type ApprovalType,
  type ApprovalRequest,
  type PendingApprovalRequest,
  type HistoryEntry,
  type StoredSigner,
  type JournalStatus,
  type JournalInput,
  type MasterSeed,
  type StoredWallet,
  type StoredJournal,
  type HistoryQueryOpts,
  type JournalQueryOpts,
  type SignedApproval,
  type RejectionEntry,
  type RejectionQueryOpts,
  type PendingApprovalFilter,
  type PolicyVersionEntry,
  type PolicyDiff
} from './wdk-store.js'
import type { Policy, EvaluationContext } from './guarded-middleware.js'
import type { PendingApprovalRow, StoredHistoryEntry, StoredJournalEntry, SignerRow, MasterSeedRow, WalletRow, PolicyRow, RejectionRow, PolicyVersionRow } from './store-types.js'

/**
 * SQLite-backed implementation of WdkStore.
 * Uses better-sqlite3 with WAL mode for performance.
 * Tables follow the schema defined in the design doc.
 */
export class SqliteWdkStore extends WdkStore {
  private _dbPath: string
  _db: BetterSqlite3.Database | null

  constructor (dbPath: string) {
    super()
    this._dbPath = dbPath
    this._db = null
  }

  // --- Lifecycle ---

  override async init (): Promise<void> {
    this._db = new Database(this._dbPath)
    chmodSync(this._dbPath, 0o600)
    this._db.pragma('journal_mode = WAL')
    this._db.pragma('foreign_keys = ON')
    this._createTables()
  }

  override async dispose (): Promise<void> {
    if (this._db) {
      this._db.close()
      this._db = null
    }
  }

  private _createTables (): void {
    this._db!.exec(`
      CREATE TABLE IF NOT EXISTS master_seed (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        mnemonic TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS wallets (
        account_index INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS policies (
        account_index INTEGER NOT NULL REFERENCES wallets(account_index),
        chain_id INTEGER NOT NULL,
        policies_json TEXT NOT NULL,
        signature_json TEXT NOT NULL,
        policy_version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (account_index, chain_id)
      );

      CREATE TABLE IF NOT EXISTS pending_requests (
        request_id TEXT PRIMARY KEY,
        account_index INTEGER NOT NULL,
        type TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        target_hash TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        wallet_name TEXT,
        policies_json TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS approval_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_index INTEGER NOT NULL,
        request_id TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL,
        chain_id INTEGER,
        target_hash TEXT NOT NULL,
        approver TEXT NOT NULL,
        action TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        signed_approval_json TEXT,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS signers (
        public_key TEXT PRIMARY KEY,
        name TEXT,
        registered_at INTEGER NOT NULL,
        revoked_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS nonces (
        approver TEXT PRIMARY KEY,
        last_nonce INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS execution_journal (
        intent_hash TEXT PRIMARY KEY,
        account_index INTEGER NOT NULL,
        chain_id INTEGER NOT NULL,
        dedup_key TEXT NOT NULL,
        status TEXT NOT NULL,
        tx_hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rejection_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intent_hash TEXT NOT NULL,
        account_index INTEGER NOT NULL,
        chain_id INTEGER NOT NULL,
        dedup_key TEXT NOT NULL,
        reason TEXT NOT NULL,
        context_json TEXT,
        policy_version INTEGER NOT NULL,
        rejected_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS policy_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_index INTEGER NOT NULL,
        chain_id INTEGER NOT NULL,
        version INTEGER NOT NULL,
        description TEXT NOT NULL,
        diff_json TEXT,
        changed_at INTEGER NOT NULL
      );
    `)
  }

  // --- Master Seed ---

  override async getMasterSeed (): Promise<MasterSeed | null> {
    const row = this._db!.prepare('SELECT * FROM master_seed WHERE id = 1').get() as MasterSeedRow | undefined
    if (!row) return null
    return {
      mnemonic: row.mnemonic,
      createdAt: row.created_at
    }
  }

  override async setMasterSeed (mnemonic: string): Promise<void> {
    this._db!.prepare(`
      INSERT OR REPLACE INTO master_seed (id, mnemonic, created_at)
      VALUES (1, ?, ?)
    `).run(mnemonic, Date.now())
  }

  // --- Wallets ---

  override async listWallets (): Promise<StoredWallet[]> {
    const rows = this._db!.prepare('SELECT * FROM wallets ORDER BY account_index').all() as WalletRow[]
    return rows.map(row => ({
      accountIndex: row.account_index,
      name: row.name,
      createdAt: row.created_at
    }))
  }

  override async getWallet (accountIndex: number): Promise<StoredWallet | null> {
    const row = this._db!.prepare('SELECT * FROM wallets WHERE account_index = ?').get(accountIndex) as WalletRow | undefined
    if (!row) return null
    return {
      accountIndex: row.account_index,
      name: row.name,
      createdAt: row.created_at
    }
  }

  override async createWallet (accountIndex: number, name: string): Promise<StoredWallet> {
    const now = Date.now()
    this._db!.prepare(`
      INSERT INTO wallets (account_index, name, created_at)
      VALUES (?, ?, ?)
    `).run(accountIndex, name, now)
    return { accountIndex, name, createdAt: now }
  }

  override async deleteWallet (accountIndex: number): Promise<void> {
    const deleteTx = this._db!.transaction(() => {
      this._db!.prepare('DELETE FROM policies WHERE account_index = ?').run(accountIndex)
      this._db!.prepare('DELETE FROM pending_requests WHERE account_index = ?').run(accountIndex)
      this._db!.prepare('DELETE FROM execution_journal WHERE account_index = ?').run(accountIndex)
      // approval_history is preserved
      this._db!.prepare('DELETE FROM wallets WHERE account_index = ?').run(accountIndex)
    })
    deleteTx()
  }

  // --- Active Policy ---

  override async loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null> {
    const row = this._db!.prepare(
      'SELECT * FROM policies WHERE account_index = ? AND chain_id = ?'
    ).get(accountIndex, chainId) as PolicyRow | undefined
    if (!row) return null
    return {
      accountIndex: row.account_index,
      chainId: row.chain_id,
      policies: JSON.parse(row.policies_json) as Policy[],
      signature: JSON.parse(row.signature_json) as Record<string, unknown>,
      policyVersion: row.policy_version,
      updatedAt: row.updated_at
    }
  }

  override async savePolicy (accountIndex: number, chainId: number, input: PolicyInput, description: string = ''): Promise<void> {
    const existing = await this.loadPolicy(accountIndex, chainId)
    const oldPolicies: Policy[] = existing ? existing.policies : []
    const version = existing ? existing.policyVersion + 1 : 1
    const now = Date.now()

    const diff = version === 1 ? null : computePolicyDiff(oldPolicies, input.policies)

    this._db!.prepare(`
      INSERT INTO policies (account_index, chain_id, policies_json, signature_json, policy_version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (account_index, chain_id) DO UPDATE SET
        policies_json = excluded.policies_json,
        signature_json = excluded.signature_json,
        policy_version = excluded.policy_version,
        updated_at = excluded.updated_at
    `).run(
      accountIndex,
      chainId,
      JSON.stringify(input.policies),
      JSON.stringify(input.signature),
      version,
      now
    )

    this._db!.prepare(`
      INSERT INTO policy_versions (account_index, chain_id, version, description, diff_json, changed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      accountIndex,
      chainId,
      version,
      description,
      diff !== null ? JSON.stringify(diff) : null,
      now
    )
  }

  override async getPolicyVersion (accountIndex: number, chainId: number): Promise<number> {
    const row = this._db!.prepare(
      'SELECT policy_version FROM policies WHERE account_index = ? AND chain_id = ?'
    ).get(accountIndex, chainId) as { policy_version: number } | undefined
    return row ? row.policy_version : 0
  }

  override async listPolicyChains (accountIndex: number): Promise<string[]> {
    const rows = this._db!.prepare(
      'SELECT chain_id FROM policies WHERE account_index = ?'
    ).all(accountIndex) as { chain_id: number }[]
    return rows.map(r => String(r.chain_id))
  }

  // --- Pending Requests ---

  override async loadPendingApprovals (filter: PendingApprovalFilter): Promise<PendingApprovalRequest[]> {
    const { accountIndex, type, chainId } = filter
    let sql = 'SELECT * FROM pending_requests WHERE 1=1'
    const params: (string | number | null)[] = []
    if (accountIndex !== undefined) { sql += ' AND account_index = ?'; params.push(accountIndex) }
    if (type !== undefined) { sql += ' AND type = ?'; params.push(type) }
    if (chainId !== undefined) { sql += ' AND chain_id = ?'; params.push(chainId) }
    const rows = this._db!.prepare(sql).all(...params) as PendingApprovalRow[]
    return rows.map(p => ({
      requestId: p.request_id,
      accountIndex: p.account_index,
      type: p.type as ApprovalType,
      chainId: p.chain_id,
      targetHash: p.target_hash,
      content: p.content,
      walletName: p.wallet_name ?? `Wallet ${p.account_index}`,
      policies: p.policies_json ? JSON.parse(p.policies_json) as Policy[] : [],
      createdAt: p.created_at
    }))
  }

  override async loadPendingByRequestId (requestId: string): Promise<PendingApprovalRequest | null> {
    const row = this._db!.prepare(
      'SELECT * FROM pending_requests WHERE request_id = ?'
    ).get(requestId) as PendingApprovalRow | undefined
    if (!row) return null
    return {
      requestId: row.request_id,
      accountIndex: row.account_index,
      type: row.type as ApprovalType,
      chainId: row.chain_id,
      targetHash: row.target_hash,
      content: row.content,
      walletName: row.wallet_name ?? `Wallet ${row.account_index}`,
      policies: row.policies_json ? JSON.parse(row.policies_json) as Policy[] : [],
      createdAt: row.created_at
    }
  }

  override async savePendingApproval (accountIndex: number, request: ApprovalRequest): Promise<void> {
    const pending = request as PendingApprovalRequest
    const walletName = pending.walletName ?? `Wallet ${accountIndex}`
    const policiesJson = pending.policies && pending.policies.length > 0
      ? JSON.stringify(pending.policies)
      : null
    this._db!.prepare(`
      INSERT INTO pending_requests (request_id, account_index, type, chain_id, target_hash, content, wallet_name, policies_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.requestId,
      accountIndex,
      request.type,
      request.chainId,
      request.targetHash,
      request.content,
      walletName,
      policiesJson,
      request.createdAt || Date.now()
    )
  }

  override async removePendingApproval (requestId: string): Promise<void> {
    this._db!.prepare('DELETE FROM pending_requests WHERE request_id = ?').run(requestId)
  }

  // --- History ---

  override async appendHistory (entry: HistoryEntry): Promise<void> {
    this._db!.prepare(`
      INSERT INTO approval_history (account_index, request_id, type, chain_id, target_hash, approver, action, content, signed_approval_json, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.accountIndex,
      entry.requestId,
      entry.type,
      entry.chainId,
      entry.targetHash,
      entry.approver,
      entry.action,
      entry.content,
      JSON.stringify(entry.signedApproval),
      entry.timestamp
    )
  }

  override async getHistory (opts: HistoryQueryOpts = {}): Promise<HistoryEntry[]> {
    let sql = 'SELECT * FROM approval_history WHERE 1=1'
    const params: (string | number)[] = []
    if (opts.accountIndex !== undefined) { sql += ' AND account_index = ?'; params.push(opts.accountIndex) }
    if (opts.type) { sql += ' AND type = ?'; params.push(opts.type) }
    if (opts.chainId !== undefined) { sql += ' AND chain_id = ?'; params.push(opts.chainId) }
    sql += ' ORDER BY id ASC'
    if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit) }
    const rows = this._db!.prepare(sql).all(...params) as StoredHistoryEntry[]
    const result: HistoryEntry[] = []
    for (const h of rows) {
      // Legacy: skip rows with null signed_approval_json
      if (h.signed_approval_json === null) continue
      const signedApproval = JSON.parse(h.signed_approval_json) as SignedApproval
      // Legacy: skip rows with null chain_id (try to recover from signedApproval)
      const chainId = h.chain_id ?? signedApproval.chainId
      if (chainId === undefined || chainId === null) continue
      result.push({
        accountIndex: h.account_index,
        requestId: h.request_id ?? '',
        type: h.type,
        chainId,
        targetHash: h.target_hash,
        approver: h.approver,
        action: h.action,
        content: h.content ?? '',
        signedApproval,
        timestamp: h.timestamp
      })
    }
    return result
  }

  // --- Signers ---

  override async saveSigner (publicKey: string, name: string): Promise<void> {
    this._db!.prepare(`
      INSERT INTO signers (public_key, name, registered_at)
      VALUES (?, ?, ?)
      ON CONFLICT (public_key) DO UPDATE SET
        name = COALESCE(excluded.name, signers.name),
        registered_at = excluded.registered_at
    `).run(publicKey, name ?? null, Date.now())
  }

  override async getSigner (publicKey: string): Promise<StoredSigner | null> {
    const row = this._db!.prepare('SELECT * FROM signers WHERE public_key = ?').get(publicKey) as SignerRow | undefined
    if (!row) return null
    return {
      publicKey: row.public_key,
      name: row.name ?? row.public_key.slice(0, 8),
      registeredAt: row.registered_at,
      status: row.revoked_at !== null ? { kind: 'revoked', revokedAt: row.revoked_at } : { kind: 'active' }
    }
  }

  override async listSigners (): Promise<StoredSigner[]> {
    const rows = this._db!.prepare('SELECT * FROM signers').all() as SignerRow[]
    return rows.map(row => ({
      publicKey: row.public_key,
      name: row.name ?? row.public_key.slice(0, 8),
      registeredAt: row.registered_at,
      status: row.revoked_at !== null ? { kind: 'revoked', revokedAt: row.revoked_at } : { kind: 'active' }
    }))
  }

  override async revokeSigner (publicKey: string): Promise<void> {
    this._db!.prepare('UPDATE signers SET revoked_at = ? WHERE public_key = ?').run(Date.now(), publicKey)
  }

  override async isSignerRevoked (publicKey: string): Promise<boolean> {
    const row = this._db!.prepare('SELECT revoked_at FROM signers WHERE public_key = ?').get(publicKey) as { revoked_at: number | null } | undefined
    if (!row) return false
    return row.revoked_at !== null
  }

  // --- Nonce ---

  override async getLastNonce (approver: string): Promise<number> {
    const row = this._db!.prepare(
      'SELECT last_nonce FROM nonces WHERE approver = ?'
    ).get(approver) as { last_nonce: number } | undefined
    return row ? row.last_nonce : 0
  }

  override async updateNonce (approver: string, nonce: number): Promise<void> {
    this._db!.prepare(`
      INSERT INTO nonces (approver, last_nonce)
      VALUES (?, ?)
      ON CONFLICT (approver) DO UPDATE SET last_nonce = excluded.last_nonce
    `).run(approver, nonce)
  }

  // --- Execution Journal ---

  override async getJournalEntry (intentHash: string): Promise<StoredJournal | null> {
    const row = this._db!.prepare('SELECT * FROM execution_journal WHERE intent_hash = ?').get(intentHash) as StoredJournalEntry | undefined
    if (!row) return null
    return {
      intentHash: row.intent_hash,
      accountIndex: row.account_index,
      chainId: row.chain_id,
      dedupKey: row.dedup_key,
      status: row.status,
      txHash: row.tx_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  override async saveJournalEntry (entry: JournalInput): Promise<void> {
    const now = Date.now()
    this._db!.prepare(`
      INSERT INTO execution_journal (intent_hash, account_index, chain_id, dedup_key, status, tx_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.intentHash,
      entry.accountIndex,
      entry.chainId,
      entry.dedupKey,
      entry.status,
      null,
      now,
      now
    )
  }

  override async updateJournalStatus (intentHash: string, status: JournalStatus, txHash: string | null): Promise<void> {
    this._db!.prepare(`
      UPDATE execution_journal SET status = ?, tx_hash = COALESCE(?, tx_hash), updated_at = ?
      WHERE intent_hash = ?
    `).run(status, txHash, Date.now(), intentHash)
  }

  override async listJournal (opts: JournalQueryOpts = {}): Promise<StoredJournal[]> {
    let sql = 'SELECT * FROM execution_journal WHERE 1=1'
    const params: (string | number)[] = []
    if (opts.accountIndex !== undefined) { sql += ' AND account_index = ?'; params.push(opts.accountIndex) }
    if (opts.status) { sql += ' AND status = ?'; params.push(opts.status) }
    if (opts.chainId !== undefined) { sql += ' AND chain_id = ?'; params.push(opts.chainId) }
    sql += ' ORDER BY created_at ASC'
    if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit) }
    const rows = this._db!.prepare(sql).all(...params) as StoredJournalEntry[]
    return rows.map(j => ({
      intentHash: j.intent_hash,
      accountIndex: j.account_index,
      chainId: j.chain_id,
      dedupKey: j.dedup_key,
      status: j.status,
      txHash: j.tx_hash,
      createdAt: j.created_at,
      updatedAt: j.updated_at
    }))
  }

  // --- Rejection History ---

  override async saveRejection (entry: RejectionEntry): Promise<void> {
    this._db!.prepare(`
      INSERT INTO rejection_history (intent_hash, account_index, chain_id, dedup_key, reason, context_json, policy_version, rejected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.intentHash,
      entry.accountIndex,
      entry.chainId,
      entry.dedupKey,
      entry.reason,
      entry.context !== null && entry.context !== undefined ? JSON.stringify(entry.context) : null,
      entry.policyVersion,
      entry.rejectedAt
    )
  }

  override async listRejections (opts: RejectionQueryOpts = {}): Promise<RejectionEntry[]> {
    let sql = 'SELECT * FROM rejection_history WHERE 1=1'
    const params: (number)[] = []
    if (opts.accountIndex !== undefined) { sql += ' AND account_index = ?'; params.push(opts.accountIndex) }
    if (opts.chainId !== undefined) { sql += ' AND chain_id = ?'; params.push(opts.chainId) }
    sql += ' ORDER BY id ASC'
    if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit) }
    const rows = this._db!.prepare(sql).all(...params) as RejectionRow[]
    return rows.map(r => ({
      intentHash: r.intent_hash,
      accountIndex: r.account_index,
      chainId: r.chain_id,
      dedupKey: r.dedup_key,
      reason: r.reason,
      context: r.context_json ? JSON.parse(r.context_json) as EvaluationContext : null,
      policyVersion: r.policy_version,
      rejectedAt: r.rejected_at
    }))
  }

  // --- Policy Versions ---

  override async listPolicyVersions (accountIndex: number, chainId: number): Promise<PolicyVersionEntry[]> {
    const rows = this._db!.prepare(
      'SELECT * FROM policy_versions WHERE account_index = ? AND chain_id = ? ORDER BY version ASC'
    ).all(accountIndex, chainId) as PolicyVersionRow[]
    return rows.map(v => ({
      accountIndex: v.account_index,
      chainId: v.chain_id,
      version: v.version,
      description: v.description,
      diff: v.diff_json ? JSON.parse(v.diff_json) as PolicyDiff : null,
      changedAt: v.changed_at
    }))
  }
}

function computePolicyDiff (oldPolicies: Policy[], newPolicies: Policy[]): PolicyDiff {
  const oldJSON = oldPolicies.map(p => JSON.stringify(p))
  const newJSON = newPolicies.map(p => JSON.stringify(p))

  const added: Policy[] = []
  const removed: Policy[] = []
  const modified: Array<{ before: Policy; after: Policy }> = []

  const matchedNew = new Set<number>()

  for (let i = 0; i < oldPolicies.length; i++) {
    const exactIdx = newJSON.indexOf(oldJSON[i])
    if (exactIdx !== -1 && !matchedNew.has(exactIdx)) {
      matchedNew.add(exactIdx)
    } else if (i < newPolicies.length && !matchedNew.has(i)) {
      modified.push({ before: oldPolicies[i], after: newPolicies[i] })
      matchedNew.add(i)
    } else {
      removed.push(oldPolicies[i])
    }
  }

  for (let j = 0; j < newPolicies.length; j++) {
    if (!matchedNew.has(j)) {
      added.push(newPolicies[j])
    }
  }

  return { added, removed, modified }
}
