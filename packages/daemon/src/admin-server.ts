import { createServer } from 'node:net'
import type { Server, Socket } from 'node:net'
import { chmodSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import type { Logger } from 'pino'
import type { AdminStorePort } from './ports.js'
import type { RelayClient } from './relay-client.js'
import type { ExecutionJournal, JournalListOptions } from './execution-journal.js'
import type { CronScheduler } from './cron-scheduler.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminServerConfig {
  socketPath: string
}

interface AdminServerDeps {
  store: AdminStorePort
  journal: ExecutionJournal | null
  cronScheduler: CronScheduler | null
  relayClient: RelayClient
  logger: Logger
}

type AdminRequest =
  | { command: 'status' }
  | { command: 'journal_list'; status: string | null; chainId: number | null; limit: number | null }
  | { command: 'signer_list' }
  | { command: 'cron_list' }
  | { command: 'wallet_list' }
  | { command: string }

interface AdminResponseOk {
  ok: true
  data: Record<string, unknown>
}

interface AdminResponseError {
  ok: false
  error: string
}

type AdminResponse = AdminResponseOk | AdminResponseError

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
 *   - signer_list    -> list paired signers
 *   - cron_list      -> list registered cron jobs
 *   - wallet_list    -> list wallets
 */
export class AdminServer {
  private _socketPath: string
  private _store: AdminStorePort
  private _journal: ExecutionJournal | null
  private _cronScheduler: CronScheduler | null
  private _relayClient: RelayClient
  private _logger: Logger
  private _server: Server | null
  private _startedAt: number

  constructor (config: AdminServerConfig, deps: AdminServerDeps) {
    this._socketPath = config.socketPath
    this._store = deps.store
    this._journal = deps.journal
    this._cronScheduler = deps.cronScheduler
    this._relayClient = deps.relayClient
    this._logger = deps.logger
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

        const req = request as { command: 'journal_list'; status: string | null; chainId: number | null; limit: number | null }
        const entries = await this._journal.list({
          status: (req.status ?? undefined) as JournalListOptions['status'],
          chainId: req.chainId ?? undefined,
          limit: req.limit ?? 50
        })

        return { ok: true, data: { entries } }
      }

      // -------------------------------------------------------------------
      // signer_list -- paired signers
      // -------------------------------------------------------------------
      case 'signer_list': {
        const signers = await this._store.listSigners()
        return {
          ok: true,
          data: {
            signers: signers.map((d: { publicKey: string; name: string | null; registeredAt: number; revokedAt: number | null }) => ({
              publicKey: d.publicKey,
              name: d.name,
              registeredAt: d.registeredAt,
              revokedAt: d.revokedAt,
              active: d.revokedAt === null || d.revokedAt === undefined
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
      // wallet_list -- wallets
      // -------------------------------------------------------------------
      case 'wallet_list': {
        const wallets = await this._store.listWallets()

        return {
          ok: true,
          data: {
            wallets: wallets.map((w: { accountIndex: number; name: string; address: string; createdAt: number }) => ({
              accountIndex: w.accountIndex,
              name: w.name,
              address: w.address,
              createdAt: w.createdAt
            }))
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
