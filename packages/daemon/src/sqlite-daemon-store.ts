import { randomUUID } from 'node:crypto'
import { chmodSync } from 'node:fs'
import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import type { CronInput, StoredCron, DaemonStore, CronFilter, ChainScope } from './daemon-store.js'

interface CronRow {
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

export class SqliteDaemonStore implements DaemonStore {
  private _dbPath: string
  private _db: BetterSqlite3.Database | null

  constructor (dbPath: string) {
    this._dbPath = dbPath
    this._db = null
  }

  async init (): Promise<void> {
    this._db = new Database(this._dbPath)
    chmodSync(this._dbPath, 0o600)
    this._db.pragma('journal_mode = WAL')
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS crons (
        id TEXT PRIMARY KEY,
        account_index INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        interval TEXT NOT NULL,
        prompt TEXT NOT NULL,
        chain_id INTEGER,
        created_at INTEGER NOT NULL,
        last_run_at INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1
      );
    `)
  }

  async dispose (): Promise<void> {
    if (this._db) { this._db.close(); this._db = null }
  }

  async listCrons (filter: CronFilter): Promise<StoredCron[]> {
    const { accountIndex } = filter
    const rows = accountIndex !== undefined
      ? this._db!.prepare('SELECT * FROM crons WHERE account_index = ?').all(accountIndex) as CronRow[]
      : this._db!.prepare('SELECT * FROM crons').all() as CronRow[]
    return rows.map(c => ({
      id: c.id,
      accountIndex: c.account_index,
      sessionId: c.session_id,
      interval: c.interval,
      prompt: c.prompt,
      chain: toChainScope(c.chain_id),
      createdAt: c.created_at,
      lastRunAt: c.last_run_at,
      isActive: c.is_active === 1
    }))
  }

  async saveCron (accountIndex: number, cron: CronInput): Promise<string> {
    const id = randomUUID()
    this._db!.prepare(`
      INSERT INTO crons (id, account_index, session_id, interval, prompt, chain_id, created_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      accountIndex,
      cron.sessionId,
      cron.interval,
      cron.prompt,
      fromChainScope(cron.chain),
      Date.now()
    )
    return id
  }

  async removeCron (cronId: string): Promise<void> {
    this._db!.prepare('DELETE FROM crons WHERE id = ?').run(cronId)
  }

  async updateCronLastRun (cronId: string, timestamp: number): Promise<void> {
    this._db!.prepare('UPDATE crons SET last_run_at = ? WHERE id = ?').run(timestamp, cronId)
  }
}

// ---------------------------------------------------------------------------
// ChainScope ↔ DB conversion
// ---------------------------------------------------------------------------

function toChainScope (chainId: number | null): ChainScope {
  return chainId === null ? { kind: 'all' } : { kind: 'specific', chainId }
}

function fromChainScope (scope: ChainScope): number | null {
  return scope.kind === 'specific' ? scope.chainId : null
}
