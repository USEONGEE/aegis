import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { RegistryAdapter } from './registry-adapter.js'
import type {
  UserRecord,
  DeviceRecord,
  DeviceListItem,
  SessionRecord,
  SessionListItem,
  CreateUserParams,
  RegisterDeviceParams,
  CreateSessionParams
} from './registry-adapter.js'
import config from '../config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PgRegistryOptions {
  connectionString?: string
}

/**
 * PostgreSQL implementation of RegistryAdapter.
 *
 * Uses `pg.Pool` for connection pooling.  The schema is applied via
 * `migrate()` or automatically by docker-compose initdb.d.
 */
export class PgRegistry extends RegistryAdapter {
  pool: InstanceType<typeof pg.Pool>

  constructor (opts: PgRegistryOptions = {}) {
    super()
    this.pool = new pg.Pool({
      connectionString: opts.connectionString || config.database.url,
      max: 20,
      idleTimeoutMillis: 30_000,
    })
  }

  /* ------------------------------------------------------------------
   * Users
   * ----------------------------------------------------------------*/

  async createUser ({ id, passwordHash }: CreateUserParams): Promise<UserRecord> {
    const { rows } = await this.pool.query(
      `INSERT INTO users (id, password_hash)
       VALUES ($1, $2)
       RETURNING id, created_at AS "createdAt"`,
      [id, passwordHash],
    )
    return rows[0]
  }

  async getUser (id: string): Promise<(UserRecord & { passwordHash: string }) | null> {
    const { rows } = await this.pool.query(
      `SELECT id, password_hash AS "passwordHash", created_at AS "createdAt"
       FROM users WHERE id = $1`,
      [id],
    )
    return rows[0] || null
  }

  /* ------------------------------------------------------------------
   * Devices
   * ----------------------------------------------------------------*/

  async registerDevice ({ id, userId, type, pushToken }: RegisterDeviceParams): Promise<DeviceRecord> {
    const { rows } = await this.pool.query(
      `INSERT INTO devices (id, user_id, type, push_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             type = EXCLUDED.type,
             push_token = COALESCE(EXCLUDED.push_token, devices.push_token)
       RETURNING id, user_id AS "userId", type, created_at AS "createdAt"`,
      [id, userId, type, pushToken || null],
    )
    return rows[0]
  }

  async getDevice (id: string): Promise<DeviceRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id AS "userId", type, push_token AS "pushToken",
              last_seen_at AS "lastSeenAt", created_at AS "createdAt"
       FROM devices WHERE id = $1`,
      [id],
    )
    return rows[0] || null
  }

  async getDevicesByUser (userId: string): Promise<DeviceListItem[]> {
    const { rows } = await this.pool.query(
      `SELECT id, type, push_token AS "pushToken", last_seen_at AS "lastSeenAt"
       FROM devices WHERE user_id = $1
       ORDER BY created_at`,
      [userId],
    )
    return rows
  }

  async touchDevice (id: string): Promise<void> {
    await this.pool.query(
      `UPDATE devices SET last_seen_at = NOW() WHERE id = $1`,
      [id],
    )
  }

  async updatePushToken (id: string, pushToken: string): Promise<void> {
    await this.pool.query(
      `UPDATE devices SET push_token = $2 WHERE id = $1`,
      [id, pushToken],
    )
  }

  /* ------------------------------------------------------------------
   * Sessions
   * ----------------------------------------------------------------*/

  async createSession ({ id, userId, metadata }: CreateSessionParams): Promise<SessionRecord> {
    const { rows } = await this.pool.query(
      `INSERT INTO sessions (id, user_id, metadata)
       VALUES ($1, $2, $3)
       RETURNING id, user_id AS "userId", created_at AS "createdAt"`,
      [id, userId, metadata ? JSON.stringify(metadata) : null],
    )
    return rows[0]
  }

  async getSession (id: string): Promise<SessionRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id AS "userId", metadata, created_at AS "createdAt"
       FROM sessions WHERE id = $1`,
      [id],
    )
    return rows[0] || null
  }

  async getSessionsByUser (userId: string): Promise<SessionListItem[]> {
    const { rows } = await this.pool.query(
      `SELECT id, metadata, created_at AS "createdAt"
       FROM sessions WHERE user_id = $1
       ORDER BY created_at`,
      [userId],
    )
    return rows
  }

  /* ------------------------------------------------------------------
   * Lifecycle
   * ----------------------------------------------------------------*/

  async migrate (): Promise<void> {
    const schemaPath = join(__dirname, 'schema.sql')
    const sql = readFileSync(schemaPath, 'utf8')
    await this.pool.query(sql)
  }

  async close (): Promise<void> {
    await this.pool.end()
  }
}
