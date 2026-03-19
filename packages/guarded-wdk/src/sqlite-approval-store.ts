import { randomUUID } from 'node:crypto'
import { chmodSync } from 'node:fs'
import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import {
  ApprovalStore,
  type PolicyInput,
  type StoredPolicy,
  type ApprovalType,
  type ApprovalRequest,
  type PendingApprovalRequest,
  type HistoryEntry,
  type StoredDevice,
  type JournalInput,
  type CronInput,
  type StoredCron,
  type StoredSeed,
  type StoredJournal,
  type HistoryQueryOpts,
  type JournalQueryOpts,
  type SignedApproval
} from './approval-store.js'
import type { PendingApprovalRow, StoredHistoryEntry, CronRow, StoredJournalEntry, DeviceRow, SeedRow, PolicyRow } from './store-types.js'

/**
 * SQLite-backed implementation of ApprovalStore.
 * Uses better-sqlite3 with WAL mode for performance.
 * Tables follow the schema defined in the design doc.
 */
export class SqliteApprovalStore extends ApprovalStore {
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
      CREATE TABLE IF NOT EXISTS seeds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mnemonic TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS policies (
        seed_id TEXT NOT NULL REFERENCES seeds(id),
        chain_id INTEGER NOT NULL,
        policies_json TEXT NOT NULL,
        signature_json TEXT NOT NULL,
        policy_version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (seed_id, chain_id)
      );

      CREATE TABLE IF NOT EXISTS pending_requests (
        request_id TEXT PRIMARY KEY,
        seed_id TEXT NOT NULL REFERENCES seeds(id),
        type TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        target_hash TEXT NOT NULL,
        metadata_json TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS approval_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seed_id TEXT NOT NULL REFERENCES seeds(id),
        type TEXT NOT NULL,
        chain_id INTEGER,
        target_hash TEXT NOT NULL,
        approver TEXT NOT NULL,
        device_id TEXT NOT NULL,
        action TEXT NOT NULL,
        signed_approval_json TEXT,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        name TEXT,
        paired_at INTEGER NOT NULL,
        revoked_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS nonces (
        approver TEXT NOT NULL,
        device_id TEXT NOT NULL,
        last_nonce INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (approver, device_id)
      );

      CREATE TABLE IF NOT EXISTS crons (
        id TEXT PRIMARY KEY,
        seed_id TEXT NOT NULL REFERENCES seeds(id),
        session_id TEXT NOT NULL,
        interval TEXT NOT NULL,
        prompt TEXT NOT NULL,
        chain_id INTEGER,
        created_at INTEGER NOT NULL,
        last_run_at INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS execution_journal (
        intent_id TEXT PRIMARY KEY,
        seed_id TEXT NOT NULL REFERENCES seeds(id),
        chain_id INTEGER NOT NULL,
        target_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        tx_hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
  }

  // --- Active Policy ---

  override async loadPolicy (seedId: string, chainId: number): Promise<StoredPolicy | null> {
    const row = this._db!.prepare(
      'SELECT * FROM policies WHERE seed_id = ? AND chain_id = ?'
    ).get(seedId, chainId) as PolicyRow | undefined
    if (!row) return null
    return {
      seedId: row.seed_id,
      chainId: row.chain_id,
      policiesJson: row.policies_json,
      signatureJson: row.signature_json,
      policyVersion: row.policy_version,
      updatedAt: row.updated_at
    }
  }

  override async savePolicy (seedId: string, chainId: number, input: PolicyInput): Promise<void> {
    const existing = await this.loadPolicy(seedId, chainId)
    const version = existing ? existing.policyVersion + 1 : 1
    const now = Date.now()

    this._db!.prepare(`
      INSERT INTO policies (seed_id, chain_id, policies_json, signature_json, policy_version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (seed_id, chain_id) DO UPDATE SET
        policies_json = excluded.policies_json,
        signature_json = excluded.signature_json,
        policy_version = excluded.policy_version,
        updated_at = excluded.updated_at
    `).run(
      seedId,
      chainId,
      JSON.stringify(input.policies),
      JSON.stringify(input.signature),
      version,
      now
    )
  }

  override async getPolicyVersion (seedId: string, chainId: number): Promise<number> {
    const row = this._db!.prepare(
      'SELECT policy_version FROM policies WHERE seed_id = ? AND chain_id = ?'
    ).get(seedId, chainId) as { policy_version: number } | undefined
    return row ? row.policy_version : 0
  }

  override async listPolicyChains (seedId: string): Promise<string[]> {
    const rows = this._db!.prepare(
      'SELECT chain_id FROM policies WHERE seed_id = ?'
    ).all(seedId) as { chain_id: number }[]
    return rows.map(r => String(r.chain_id))
  }

  // --- Pending Requests ---

  override async loadPendingApprovals (seedId: string | null, type: string | null, chainId: number | null): Promise<PendingApprovalRequest[]> {
    let sql = 'SELECT * FROM pending_requests WHERE 1=1'
    const params: (string | number | null)[] = []
    if (seedId) { sql += ' AND seed_id = ?'; params.push(seedId) }
    if (type) { sql += ' AND type = ?'; params.push(type) }
    if (chainId !== null && chainId !== undefined) { sql += ' AND chain_id = ?'; params.push(chainId) }
    const rows = this._db!.prepare(sql).all(...params) as PendingApprovalRow[]
    return rows.map(p => ({
      requestId: p.request_id,
      seedId: p.seed_id,
      type: p.type as ApprovalType,
      chainId: p.chain_id,
      targetHash: p.target_hash,
      metadata: p.metadata_json ? JSON.parse(p.metadata_json) as Record<string, unknown> : undefined,
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
      seedId: row.seed_id,
      type: row.type as ApprovalType,
      chainId: row.chain_id,
      targetHash: row.target_hash,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : undefined,
      createdAt: row.created_at
    }
  }

  override async savePendingApproval (seedId: string, request: ApprovalRequest): Promise<void> {
    this._db!.prepare(`
      INSERT INTO pending_requests (request_id, seed_id, type, chain_id, target_hash, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.requestId,
      seedId,
      request.type,
      request.chainId,
      request.targetHash,
      request.metadata ? JSON.stringify(request.metadata) : null,
      request.createdAt || Date.now()
    )
  }

  override async removePendingApproval (requestId: string): Promise<void> {
    this._db!.prepare('DELETE FROM pending_requests WHERE request_id = ?').run(requestId)
  }

  // --- History ---

  override async appendHistory (entry: HistoryEntry): Promise<void> {
    this._db!.prepare(`
      INSERT INTO approval_history (seed_id, type, chain_id, target_hash, approver, device_id, action, signed_approval_json, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.seedId,
      entry.type,
      entry.chainId ?? null,
      entry.targetHash,
      entry.approver,
      entry.deviceId,
      entry.action,
      entry.signedApproval ? JSON.stringify(entry.signedApproval) : null,
      entry.timestamp
    )
  }

  override async getHistory (opts: HistoryQueryOpts = {}): Promise<HistoryEntry[]> {
    let sql = 'SELECT * FROM approval_history WHERE 1=1'
    const params: (string | number)[] = []
    if (opts.seedId) { sql += ' AND seed_id = ?'; params.push(opts.seedId) }
    if (opts.type) { sql += ' AND type = ?'; params.push(opts.type) }
    if (opts.chainId !== undefined) { sql += ' AND chain_id = ?'; params.push(opts.chainId) }
    sql += ' ORDER BY id ASC'
    if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit) }
    const rows = this._db!.prepare(sql).all(...params) as StoredHistoryEntry[]
    return rows.map(h => ({
      seedId: h.seed_id,
      type: h.type,
      chainId: h.chain_id,
      targetHash: h.target_hash,
      approver: h.approver,
      deviceId: h.device_id,
      action: h.action,
      signedApproval: h.signed_approval_json ? JSON.parse(h.signed_approval_json) as SignedApproval : undefined,
      timestamp: h.timestamp
    }))
  }

  // --- Devices ---

  override async saveDevice (deviceId: string, publicKey: string): Promise<void> {
    this._db!.prepare(`
      INSERT INTO devices (device_id, public_key, paired_at)
      VALUES (?, ?, ?)
      ON CONFLICT (device_id) DO UPDATE SET
        public_key = excluded.public_key,
        paired_at = excluded.paired_at
    `).run(deviceId, publicKey, Date.now())
  }

  override async getDevice (deviceId: string): Promise<StoredDevice | null> {
    const row = this._db!.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId) as DeviceRow | undefined
    if (!row) return null
    return {
      deviceId: row.device_id,
      publicKey: row.public_key,
      name: row.name,
      pairedAt: row.paired_at,
      revokedAt: row.revoked_at
    }
  }

  override async listDevices (): Promise<StoredDevice[]> {
    const rows = this._db!.prepare('SELECT * FROM devices').all() as DeviceRow[]
    return rows.map(row => ({
      deviceId: row.device_id,
      publicKey: row.public_key,
      name: row.name,
      pairedAt: row.paired_at,
      revokedAt: row.revoked_at
    }))
  }

  override async revokeDevice (deviceId: string): Promise<void> {
    this._db!.prepare('UPDATE devices SET revoked_at = ? WHERE device_id = ?').run(Date.now(), deviceId)
  }

  override async isDeviceRevoked (deviceId: string): Promise<boolean> {
    const row = this._db!.prepare('SELECT revoked_at FROM devices WHERE device_id = ?').get(deviceId) as { revoked_at: number | null } | undefined
    if (!row) return false
    return row.revoked_at !== null
  }

  // --- Nonce ---

  override async getLastNonce (approver: string, deviceId: string): Promise<number> {
    const row = this._db!.prepare(
      'SELECT last_nonce FROM nonces WHERE approver = ? AND device_id = ?'
    ).get(approver, deviceId) as { last_nonce: number } | undefined
    return row ? row.last_nonce : 0
  }

  override async updateNonce (approver: string, deviceId: string, nonce: number): Promise<void> {
    this._db!.prepare(`
      INSERT INTO nonces (approver, device_id, last_nonce)
      VALUES (?, ?, ?)
      ON CONFLICT (approver, device_id) DO UPDATE SET last_nonce = excluded.last_nonce
    `).run(approver, deviceId, nonce)
  }

  // --- Cron ---

  override async listCrons (seedId?: string): Promise<StoredCron[]> {
    const rows = seedId
      ? this._db!.prepare('SELECT * FROM crons WHERE seed_id = ?').all(seedId) as CronRow[]
      : this._db!.prepare('SELECT * FROM crons').all() as CronRow[]
    return rows.map(c => ({
      id: c.id,
      seedId: c.seed_id,
      sessionId: c.session_id,
      interval: c.interval,
      prompt: c.prompt,
      chainId: c.chain_id,
      createdAt: c.created_at,
      lastRunAt: c.last_run_at,
      isActive: c.is_active === 1
    }))
  }

  override async saveCron (seedId: string, cron: CronInput): Promise<string> {
    const id = randomUUID()
    this._db!.prepare(`
      INSERT INTO crons (id, seed_id, session_id, interval, prompt, chain_id, created_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      seedId,
      cron.sessionId,
      cron.interval,
      cron.prompt,
      cron.chainId,
      Date.now()
    )
    return id
  }

  override async removeCron (cronId: string): Promise<void> {
    this._db!.prepare('DELETE FROM crons WHERE id = ?').run(cronId)
  }

  override async updateCronLastRun (cronId: string, timestamp: number): Promise<void> {
    this._db!.prepare('UPDATE crons SET last_run_at = ? WHERE id = ?').run(timestamp, cronId)
  }

  // --- Seeds ---

  override async listSeeds (): Promise<StoredSeed[]> {
    const rows = this._db!.prepare('SELECT * FROM seeds ORDER BY created_at ASC').all() as SeedRow[]
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      mnemonic: row.mnemonic,
      createdAt: row.created_at,
      isActive: row.is_active === 1
    }))
  }

  override async getSeed (seedId: string): Promise<StoredSeed | null> {
    const row = this._db!.prepare('SELECT * FROM seeds WHERE id = ?').get(seedId) as SeedRow | undefined
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      mnemonic: row.mnemonic,
      createdAt: row.created_at,
      isActive: row.is_active === 1
    }
  }

  override async addSeed (name: string, mnemonic: string): Promise<StoredSeed> {
    const id = randomUUID()
    const now = Date.now()
    const count = (this._db!.prepare('SELECT COUNT(*) AS cnt FROM seeds').get() as { cnt: number }).cnt
    const isActive = count === 0 ? 1 : 0

    this._db!.prepare(`
      INSERT INTO seeds (id, name, mnemonic, created_at, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, mnemonic, now, isActive)

    return { id, name, mnemonic, createdAt: now, isActive: isActive === 1 }
  }

  override async removeSeed (seedId: string): Promise<void> {
    const removeTx = this._db!.transaction(() => {
      // Check if this seed is active
      const seed = this._db!.prepare('SELECT is_active FROM seeds WHERE id = ?').get(seedId) as { is_active: number } | undefined
      if (!seed) return

      // Remove related data
      this._db!.prepare('DELETE FROM policies WHERE seed_id = ?').run(seedId)
      this._db!.prepare('DELETE FROM pending_requests WHERE seed_id = ?').run(seedId)
      this._db!.prepare('DELETE FROM approval_history WHERE seed_id = ?').run(seedId)
      this._db!.prepare('DELETE FROM crons WHERE seed_id = ?').run(seedId)
      this._db!.prepare('DELETE FROM execution_journal WHERE seed_id = ?').run(seedId)
      this._db!.prepare('DELETE FROM seeds WHERE id = ?').run(seedId)

      // If it was the active seed, make first remaining seed active
      if (seed.is_active) {
        this._db!.prepare('UPDATE seeds SET is_active = 0').run()
        const first = this._db!.prepare('SELECT id FROM seeds ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined
        if (first) {
          this._db!.prepare('UPDATE seeds SET is_active = 1 WHERE id = ?').run(first.id)
        }
      }
    })
    removeTx()
  }

  override async setActiveSeed (seedId: string): Promise<void> {
    const seed = this._db!.prepare('SELECT id FROM seeds WHERE id = ?').get(seedId) as { id: string } | undefined
    if (!seed) throw new Error(`Seed not found: ${seedId}`)

    const setActiveTx = this._db!.transaction(() => {
      this._db!.prepare('UPDATE seeds SET is_active = 0').run()
      this._db!.prepare('UPDATE seeds SET is_active = 1 WHERE id = ?').run(seedId)
    })
    setActiveTx()
  }

  override async getActiveSeed (): Promise<StoredSeed | null> {
    const row = this._db!.prepare('SELECT * FROM seeds WHERE is_active = 1').get() as SeedRow | undefined
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      mnemonic: row.mnemonic,
      createdAt: row.created_at,
      isActive: row.is_active === 1
    }
  }

  // --- Execution Journal ---

  override async getJournalEntry (intentId: string): Promise<StoredJournal | null> {
    const row = this._db!.prepare('SELECT * FROM execution_journal WHERE intent_id = ?').get(intentId) as StoredJournalEntry | undefined
    if (!row) return null
    return {
      intentId: row.intent_id,
      seedId: row.seed_id,
      chainId: row.chain_id,
      targetHash: row.target_hash,
      status: row.status,
      txHash: row.tx_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  override async saveJournalEntry (entry: JournalInput): Promise<void> {
    const now = Date.now()
    this._db!.prepare(`
      INSERT INTO execution_journal (intent_id, seed_id, chain_id, target_hash, status, tx_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.intentId,
      entry.seedId,
      entry.chainId,
      entry.targetHash,
      entry.status,
      null,
      now,
      now
    )
  }

  override async updateJournalStatus (intentId: string, status: string, txHash?: string): Promise<void> {
    this._db!.prepare(`
      UPDATE execution_journal SET status = ?, tx_hash = COALESCE(?, tx_hash), updated_at = ?
      WHERE intent_id = ?
    `).run(status, txHash !== undefined ? txHash : null, Date.now(), intentId)
  }

  override async listJournal (opts: JournalQueryOpts = {}): Promise<StoredJournal[]> {
    let sql = 'SELECT * FROM execution_journal WHERE 1=1'
    const params: (string | number)[] = []
    if (opts.seedId) { sql += ' AND seed_id = ?'; params.push(opts.seedId) }
    if (opts.status) { sql += ' AND status = ?'; params.push(opts.status) }
    if (opts.chainId !== undefined) { sql += ' AND chain_id = ?'; params.push(opts.chainId) }
    sql += ' ORDER BY created_at ASC'
    if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit) }
    const rows = this._db!.prepare(sql).all(...params) as StoredJournalEntry[]
    return rows.map(j => ({
      intentId: j.intent_id,
      seedId: j.seed_id,
      chainId: j.chain_id,
      targetHash: j.target_hash,
      status: j.status,
      txHash: j.tx_hash,
      createdAt: j.created_at,
      updatedAt: j.updated_at
    }))
  }
}
