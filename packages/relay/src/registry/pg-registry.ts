import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { RegistryAdapter } from './registry-adapter.js'
import type {
  SubjectRole,
  UserRecord,
  DeviceRecord,
  DeviceListItem,
  SessionRecord,
  SessionListItem,
  CreateUserParams,
  CreateDeviceParams,
  CreateSessionParams,
  DaemonRecord,
  CreateDaemonParams,
  DaemonUserRecord,
  CreateDaemonUserParams,
  RefreshTokenRecord,
  CreateRefreshTokenParams,
  EnrollmentCodeRecord,
  CreateEnrollmentCodeParams
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

  async getUser (id: string): Promise<UserRecord | null> {
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

  async createDevice ({ id, userId, type, pushToken }: CreateDeviceParams): Promise<DeviceRecord> {
    const { rows } = await this.pool.query(
      `INSERT INTO devices (id, user_id, type, push_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             type = EXCLUDED.type,
             push_token = COALESCE(EXCLUDED.push_token, devices.push_token)
       RETURNING id, user_id AS "userId", type, created_at AS "createdAt"`,
      [id, userId, type, pushToken],
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
   * Daemons
   * ----------------------------------------------------------------*/

  async createDaemon ({ id, secretHash }: CreateDaemonParams): Promise<DaemonRecord> {
    const { rows } = await this.pool.query(
      `INSERT INTO daemons (id, secret_hash)
       VALUES ($1, $2)
       RETURNING id, secret_hash AS "secretHash", created_at AS "createdAt"`,
      [id, secretHash],
    )
    return rows[0]
  }

  async getDaemon (id: string): Promise<DaemonRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT id, secret_hash AS "secretHash", created_at AS "createdAt"
       FROM daemons WHERE id = $1`,
      [id],
    )
    return rows[0] || null
  }

  /* ------------------------------------------------------------------
   * Daemon-User Binding
   * ----------------------------------------------------------------*/

  async bindUser ({ daemonId, userId }: CreateDaemonUserParams): Promise<DaemonUserRecord> {
    const { rows } = await this.pool.query(
      `INSERT INTO daemon_users (daemon_id, user_id)
       VALUES ($1, $2)
       RETURNING daemon_id AS "daemonId", user_id AS "userId", bound_at AS "boundAt"`,
      [daemonId, userId],
    )
    return rows[0]
  }

  async unbindUsers (daemonId: string, userIds: string[]): Promise<string[]> {
    const { rows } = await this.pool.query(
      `DELETE FROM daemon_users
       WHERE daemon_id = $1 AND user_id = ANY($2)
       RETURNING user_id AS "userId"`,
      [daemonId, userIds],
    )
    return rows.map((r: { userId: string }) => r.userId)
  }

  async getUsersByDaemon (daemonId: string): Promise<string[]> {
    const { rows } = await this.pool.query(
      `SELECT user_id AS "userId" FROM daemon_users WHERE daemon_id = $1`,
      [daemonId],
    )
    return rows.map((r: { userId: string }) => r.userId)
  }

  async getDaemonByUser (userId: string): Promise<string | null> {
    const { rows } = await this.pool.query(
      `SELECT daemon_id AS "daemonId" FROM daemon_users WHERE user_id = $1`,
      [userId],
    )
    return rows[0]?.daemonId || null
  }

  /* ------------------------------------------------------------------
   * Refresh Tokens
   * ----------------------------------------------------------------*/

  async createRefreshToken (params: CreateRefreshTokenParams): Promise<RefreshTokenRecord> {
    const { rows } = await this.pool.query(
      `INSERT INTO refresh_tokens (id, subject_id, role, device_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, subject_id AS "subjectId", role, device_id AS "deviceId",
                 expires_at AS "expiresAt", created_at AS "createdAt", revoked_at AS "revokedAt"`,
      [params.id, params.subjectId, params.role, params.deviceId, params.expiresAt],
    )
    return rows[0]
  }

  async getRefreshToken (id: string): Promise<RefreshTokenRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT id, subject_id AS "subjectId", role, device_id AS "deviceId",
              expires_at AS "expiresAt", created_at AS "createdAt", revoked_at AS "revokedAt"
       FROM refresh_tokens WHERE id = $1`,
      [id],
    )
    return rows[0] || null
  }

  async revokeRefreshToken (id: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
      [id],
    )
  }

  async revokeAllRefreshTokens (subjectId: string, role: SubjectRole): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE subject_id = $1 AND role = $2 AND revoked_at IS NULL`,
      [subjectId, role],
    )
  }

  /* ------------------------------------------------------------------
   * Enrollment Codes
   * ----------------------------------------------------------------*/

  async createEnrollmentCode ({ code, daemonId, expiresAt }: CreateEnrollmentCodeParams): Promise<EnrollmentCodeRecord> {
    const { rows } = await this.pool.query(
      `INSERT INTO enrollment_codes (code, daemon_id, expires_at)
       VALUES ($1, $2, $3)
       RETURNING code, daemon_id AS "daemonId", expires_at AS "expiresAt", used_at AS "usedAt"`,
      [code, daemonId, expiresAt],
    )
    return rows[0]
  }

  async getEnrollmentCode (code: string): Promise<EnrollmentCodeRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT code, daemon_id AS "daemonId", expires_at AS "expiresAt", used_at AS "usedAt"
       FROM enrollment_codes WHERE code = $1`,
      [code],
    )
    return rows[0] || null
  }

  async claimEnrollmentCode (code: string): Promise<EnrollmentCodeRecord | null> {
    const { rows } = await this.pool.query(
      `UPDATE enrollment_codes
       SET used_at = NOW()
       WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING code, daemon_id AS "daemonId", expires_at AS "expiresAt", used_at AS "usedAt"`,
      [code],
    )
    return rows[0] || null
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
