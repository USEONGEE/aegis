import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import {
  ApprovalStore,
  type SignedPolicy,
  type StoredPolicy,
  type ApprovalRequest,
  type PendingRequest,
  type HistoryEntry,
  type StoredHistoryEntry,
  type DeviceRecord,
  type CronRecord,
  type CronInput,
  type SeedRecord,
  type JournalEntry,
  type StoredJournalEntry,
  type HistoryQueryOpts,
  type JournalQueryOpts
} from './approval-store.js'

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
        chain TEXT NOT NULL,
        policies_json TEXT NOT NULL,
        signature_json TEXT NOT NULL,
        wdk_countersig TEXT NOT NULL DEFAULT '',
        policy_version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (seed_id, chain)
      );

      CREATE TABLE IF NOT EXISTS pending_requests (
        request_id TEXT PRIMARY KEY,
        seed_id TEXT NOT NULL REFERENCES seeds(id),
        type TEXT NOT NULL,
        chain TEXT NOT NULL,
        target_hash TEXT NOT NULL,
        metadata_json TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS approval_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seed_id TEXT NOT NULL REFERENCES seeds(id),
        type TEXT NOT NULL,
        chain TEXT,
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
        chain TEXT,
        created_at INTEGER NOT NULL,
        last_run_at INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS execution_journal (
        intent_id TEXT PRIMARY KEY,
        seed_id TEXT NOT NULL REFERENCES seeds(id),
        chain TEXT NOT NULL,
        target_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        tx_hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
  }

  // --- Active Policy ---

  override async loadPolicy (seedId: string, chain: string): Promise<StoredPolicy | null> {
    const row = this._db!.prepare(
      'SELECT * FROM policies WHERE seed_id = ? AND chain = ?'
    ).get(seedId, chain) as StoredPolicy | undefined
    return row || null
  }

  override async savePolicy (seedId: string, chain: string, signedPolicy: SignedPolicy): Promise<void> {
    const existing = await this.loadPolicy(seedId, chain)
    const version = existing ? existing.policy_version + 1 : 1
    const now = Date.now()

    this._db!.prepare(`
      INSERT INTO policies (seed_id, chain, policies_json, signature_json, wdk_countersig, policy_version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (seed_id, chain) DO UPDATE SET
        policies_json = excluded.policies_json,
        signature_json = excluded.signature_json,
        wdk_countersig = excluded.wdk_countersig,
        policy_version = excluded.policy_version,
        updated_at = excluded.updated_at
    `).run(
      seedId,
      chain,
      signedPolicy.policies_json || JSON.stringify(signedPolicy.policies || {}),
      signedPolicy.signature_json || JSON.stringify(signedPolicy.signature || {}),
      signedPolicy.wdk_countersig || '',
      version,
      now
    )
  }

  override async getPolicyVersion (seedId: string, chain: string): Promise<number> {
    const row = this._db!.prepare(
      'SELECT policy_version FROM policies WHERE seed_id = ? AND chain = ?'
    ).get(seedId, chain) as { policy_version: number } | undefined
    return row ? row.policy_version : 0
  }

  // --- Pending Requests ---

  override async loadPending (seedId: string | null, type: string | null, chain: string | null): Promise<PendingRequest[]> {
    let sql = 'SELECT * FROM pending_requests WHERE 1=1'
    const params: (string | null)[] = []
    if (seedId) { sql += ' AND seed_id = ?'; params.push(seedId) }
    if (type) { sql += ' AND type = ?'; params.push(type) }
    if (chain) { sql += ' AND chain = ?'; params.push(chain) }
    return this._db!.prepare(sql).all(...params) as PendingRequest[]
  }

  override async savePending (seedId: string, request: ApprovalRequest): Promise<void> {
    this._db!.prepare(`
      INSERT INTO pending_requests (request_id, seed_id, type, chain, target_hash, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.requestId,
      seedId,
      request.type,
      request.chain,
      request.targetHash,
      request.metadata ? JSON.stringify(request.metadata) : null,
      request.createdAt || Date.now()
    )
  }

  override async removePending (requestId: string): Promise<void> {
    this._db!.prepare('DELETE FROM pending_requests WHERE request_id = ?').run(requestId)
  }

  // --- History ---

  override async appendHistory (entry: HistoryEntry): Promise<void> {
    this._db!.prepare(`
      INSERT INTO approval_history (seed_id, type, chain, target_hash, approver, device_id, action, signed_approval_json, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.seedId || entry.seed_id || '',
      entry.type,
      entry.chain || null,
      entry.targetHash || entry.target_hash,
      entry.approver,
      entry.deviceId || entry.device_id,
      entry.action,
      entry.signedApproval ? JSON.stringify(entry.signedApproval) : null,
      entry.timestamp || Date.now()
    )
  }

  override async getHistory (opts: HistoryQueryOpts = {}): Promise<StoredHistoryEntry[]> {
    let sql = 'SELECT * FROM approval_history WHERE 1=1'
    const params: (string | number)[] = []
    if (opts.seedId) { sql += ' AND seed_id = ?'; params.push(opts.seedId) }
    if (opts.type) { sql += ' AND type = ?'; params.push(opts.type) }
    if (opts.chain) { sql += ' AND chain = ?'; params.push(opts.chain) }
    sql += ' ORDER BY id ASC'
    if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit) }
    return this._db!.prepare(sql).all(...params) as StoredHistoryEntry[]
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

  override async getDevice (deviceId: string): Promise<DeviceRecord | null> {
    const row = this._db!.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId) as DeviceRecord | undefined
    return row || null
  }

  override async listDevices (): Promise<DeviceRecord[]> {
    return this._db!.prepare('SELECT * FROM devices').all() as DeviceRecord[]
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

  override async listCrons (seedId?: string): Promise<CronRecord[]> {
    if (seedId) {
      return this._db!.prepare('SELECT * FROM crons WHERE seed_id = ?').all(seedId) as CronRecord[]
    }
    return this._db!.prepare('SELECT * FROM crons').all() as CronRecord[]
  }

  override async saveCron (seedId: string, cron: CronInput): Promise<void> {
    const id = cron.id || randomUUID()
    this._db!.prepare(`
      INSERT INTO crons (id, seed_id, session_id, interval, prompt, chain, created_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      seedId,
      cron.sessionId || cron.session_id,
      cron.interval,
      cron.prompt,
      cron.chain || null,
      cron.createdAt || Date.now()
    )
  }

  override async removeCron (cronId: string): Promise<void> {
    this._db!.prepare('DELETE FROM crons WHERE id = ?').run(cronId)
  }

  override async updateCronLastRun (cronId: string, timestamp: number): Promise<void> {
    this._db!.prepare('UPDATE crons SET last_run_at = ? WHERE id = ?').run(timestamp, cronId)
  }

  // --- Seeds ---

  override async listSeeds (): Promise<SeedRecord[]> {
    return this._db!.prepare('SELECT * FROM seeds ORDER BY created_at ASC').all() as SeedRecord[]
  }

  override async getSeed (seedId: string): Promise<SeedRecord | null> {
    const row = this._db!.prepare('SELECT * FROM seeds WHERE id = ?').get(seedId) as SeedRecord | undefined
    return row || null
  }

  override async addSeed (name: string, mnemonic: string): Promise<SeedRecord> {
    const id = randomUUID()
    const now = Date.now()
    const count = (this._db!.prepare('SELECT COUNT(*) AS cnt FROM seeds').get() as { cnt: number }).cnt
    const isActive = count === 0 ? 1 : 0

    this._db!.prepare(`
      INSERT INTO seeds (id, name, mnemonic, created_at, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, mnemonic, now, isActive)

    return { id, name, mnemonic, created_at: now, is_active: isActive }
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

  override async getActiveSeed (): Promise<SeedRecord | null> {
    const row = this._db!.prepare('SELECT * FROM seeds WHERE is_active = 1').get() as SeedRecord | undefined
    return row || null
  }

  // --- Execution Journal ---

  override async getJournalEntry (intentId: string): Promise<StoredJournalEntry | null> {
    const row = this._db!.prepare('SELECT * FROM execution_journal WHERE intent_id = ?').get(intentId) as StoredJournalEntry | undefined
    return row || null
  }

  override async saveJournalEntry (entry: JournalEntry): Promise<void> {
    const now = Date.now()
    this._db!.prepare(`
      INSERT INTO execution_journal (intent_id, seed_id, chain, target_hash, status, tx_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.intentId || entry.intent_id,
      entry.seedId || entry.seed_id,
      entry.chain,
      entry.targetHash || entry.target_hash,
      entry.status,
      entry.txHash || entry.tx_hash || null,
      entry.createdAt || now,
      entry.updatedAt || now
    )
  }

  override async updateJournalStatus (intentId: string, status: string, txHash?: string): Promise<void> {
    this._db!.prepare(`
      UPDATE execution_journal SET status = ?, tx_hash = COALESCE(?, tx_hash), updated_at = ?
      WHERE intent_id = ?
    `).run(status, txHash !== undefined ? txHash : null, Date.now(), intentId)
  }

  override async listJournal (opts: JournalQueryOpts = {}): Promise<StoredJournalEntry[]> {
    let sql = 'SELECT * FROM execution_journal WHERE 1=1'
    const params: (string | number)[] = []
    if (opts.seedId) { sql += ' AND seed_id = ?'; params.push(opts.seedId) }
    if (opts.status) { sql += ' AND status = ?'; params.push(opts.status) }
    if (opts.chain) { sql += ' AND chain = ?'; params.push(opts.chain) }
    sql += ' ORDER BY created_at ASC'
    if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit) }
    return this._db!.prepare(sql).all(...params) as StoredJournalEntry[]
  }
}
