import { createServer } from 'node:net'
import type { Server, Socket } from 'node:net'
import { chmodSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import type { Logger } from 'pino'
import type { WDKContext } from './tool-surface.js'
import type { RelayClient } from './relay-client.js'
import type { ExecutionJournal } from './execution-journal.js'
import type { CronScheduler } from './cron-scheduler.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminServerOptions {
  socketPath: string
  store: any
  journal: ExecutionJournal | null
  cronScheduler: CronScheduler | null
  relayClient: RelayClient
  wdkContext: WDKContext
  logger: Logger
}

interface AdminRequest {
  command: string
  status?: string
  chainId?: number
  limit?: number
  [key: string]: unknown
}

interface AdminResponse {
  ok: boolean
  data?: Record<string, unknown>
  error?: string
}

/**
 * Admin server -- listens on a Unix domain socket for local admin commands.
 *
 * Protocol: JSON-line (newline-delimited JSON).
 * Each request is a single JSON object; each response is a single JSON object
 * followed by a newline.
 *
 * Socket path: ~/.wdk/daemon.sock (configurable via config.socketPath)
 *
 * Commands:
 *   - status         -> daemon health and connection state
 *   - journal_list   -> list execution journal entries
 *   - device_list    -> list paired devices
 *   - cron_list      -> list registered cron jobs
 *   - seed_list      -> list seeds (mnemonic redacted)
 */
export class AdminServer {
  private _socketPath: string
  private _store: any
  private _journal: ExecutionJournal | null
  private _cronScheduler: CronScheduler | null
  private _relayClient: RelayClient
  private _wdkContext: WDKContext
  private _logger: Logger
  private _server: Server | null
  private _startedAt: number

  constructor (opts: AdminServerOptions) {
    this._socketPath = opts.socketPath
    this._store = opts.store
    this._journal = opts.journal
    this._cronScheduler = opts.cronScheduler
    this._relayClient = opts.relayClient
    this._wdkContext = opts.wdkContext
    this._logger = opts.logger
    this._server = null
    this._startedAt = Date.now()
  }

  /**
   * Start the admin Unix socket server.
   */
  async start (): Promise<void> {
    // Remove stale socket file if present
    try {
      await unlink(this._socketPath)
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err
    }

    return new Promise<void>((resolve, reject) => {
      this._server = createServer((conn: Socket) => this._handleConnection(conn))

      this._server.on('error', (err: Error) => {
        this._logger.error({ err }, 'Admin server error')
        reject(err)
      })

      this._server.listen(this._socketPath, () => {
        chmodSync(this._socketPath, 0o600)
        this._logger.info({ socketPath: this._socketPath }, 'Admin server listening')
        resolve()
      })
    })
  }

  /**
   * Stop the admin server.
   */
  async stop (): Promise<void> {
    if (!this._server) return

    return new Promise<void>((resolve) => {
      this._server!.close(() => {
        this._logger.info('Admin server stopped')
        resolve()
      })
    })
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private _handleConnection (conn: Socket): void {
    let buffer = ''

    conn.on('data', async (chunk: Buffer) => {
      buffer += chunk.toString()

      // Process complete lines
      let newlineIdx: number
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim()
        buffer = buffer.slice(newlineIdx + 1)

        if (!line) continue

        let request: AdminRequest
        try {
          request = JSON.parse(line)
        } catch {
          this._respond(conn, { ok: false, error: 'Invalid JSON' })
          continue
        }

        try {
          const result = await this._dispatch(request)
          this._respond(conn, result)
        } catch (err: any) {
          this._logger.error({ err, command: request.command }, 'Admin command error')
          this._respond(conn, { ok: false, error: err.message })
        }
      }
    })

    conn.on('error', (err: any) => {
      if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
        this._logger.warn({ err: err.message }, 'Admin connection error')
      }
    })
  }

  private _respond (conn: Socket, data: AdminResponse): void {
    try {
      conn.write(JSON.stringify(data) + '\n')
    } catch {
      // Connection may have closed -- ignore
    }
  }

  /**
   * Dispatch an admin command.
   */
  private async _dispatch (request: AdminRequest): Promise<AdminResponse> {
    const { command } = request

    switch (command) {
      // -------------------------------------------------------------------
      // status -- daemon health
      // -------------------------------------------------------------------
      case 'status': {
        return {
          ok: true,
          data: {
            uptime: Date.now() - this._startedAt,
            startedAt: this._startedAt,
            seedId: this._wdkContext?.seedId || null,
            relayConnected: this._relayClient?.connected || false,
            journalActive: this._journal?.activeCount || 0,
            cronCount: this._cronScheduler?.size || 0
          }
        }
      }

      // -------------------------------------------------------------------
      // journal_list -- execution journal entries
      // -------------------------------------------------------------------
      case 'journal_list': {
        if (!this._journal) {
          return { ok: true, data: { entries: [] } }
        }

        const entries = await this._journal.list({
          status: request.status || undefined,
          chainId: request.chainId || undefined,
          limit: request.limit || 50
        })

        return { ok: true, data: { entries } }
      }

      // -------------------------------------------------------------------
      // device_list -- paired devices
      // -------------------------------------------------------------------
      case 'device_list': {
        const devices: any[] = await this._store.listDevices()
        return {
          ok: true,
          data: {
            devices: devices.map((d: any) => ({
              deviceId: d.device_id,
              name: d.name,
              pairedAt: d.paired_at,
              revokedAt: d.revoked_at,
              active: d.revoked_at === null || d.revoked_at === undefined
            }))
          }
        }
      }

      // -------------------------------------------------------------------
      // cron_list -- registered cron jobs
      // -------------------------------------------------------------------
      case 'cron_list': {
        const crons = this._cronScheduler
          ? this._cronScheduler.list()
          : []

        return { ok: true, data: { crons } }
      }

      // -------------------------------------------------------------------
      // seed_list -- seeds (mnemonic redacted)
      // -------------------------------------------------------------------
      case 'seed_list': {
        const seeds: any[] = await this._store.listSeeds()
        const activeSeed = await this._store.getActiveSeed()

        return {
          ok: true,
          data: {
            seeds: seeds.map((s: any) => ({
              id: s.id,
              name: s.name,
              createdAt: s.created_at,
              isActive: s.id === activeSeed?.id
            })),
            activeSeedId: activeSeed?.id || null
          }
        }
      }

      // -------------------------------------------------------------------
      // Unknown
      // -------------------------------------------------------------------
      default:
        return { ok: false, error: `Unknown command: ${command}` }
    }
  }
}
