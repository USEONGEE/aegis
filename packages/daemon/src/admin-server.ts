import { createServer } from 'node:net'
import type { Server, Socket } from 'node:net'
import { chmodSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import type { Logger } from 'pino'
import type { AdminFacadePort } from './ports.js'
import type { RelayClient } from './relay-client.js'
import type { CronScheduler } from './cron-scheduler.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminServerConfig {
  socketPath: string
}

interface AdminServerDeps {
  facade: AdminFacadePort
  cronScheduler: CronScheduler | null
  relayClient: RelayClient
  logger: Logger
}

type AdminRequest =
  | { command: 'status' }
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
 *   - signer_list    -> list paired signers
 *   - cron_list      -> list registered cron jobs
 *   - wallet_list    -> list wallets
 */
export class AdminServer {
  private _socketPath: string
  private _facade: AdminFacadePort
  private _cronScheduler: CronScheduler | null
  private _relayClient: RelayClient
  private _logger: Logger
  private _server: Server | null
  private _startedAt: number

  constructor (config: AdminServerConfig, deps: AdminServerDeps) {
    this._socketPath = config.socketPath
    this._facade = deps.facade
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
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
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
        } catch (err: unknown) {
          this._logger.error({ err, command: request.command }, 'Admin command error')
          this._respond(conn, { ok: false, error: err instanceof Error ? err.message : String(err) })
        }
      }
    })

    conn.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
        this._logger.warn({ err: err.message }, 'Admin connection error')
      }
    })
  }

  private _respond (conn: Socket, data: AdminResponse): void {
    try {
      conn.write(JSON.stringify(data) + '\n')
    } catch (err: unknown) {
      this._logger.debug({ err }, 'Failed to write admin response — connection closed')
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
            cronCount: this._cronScheduler?.size || 0
          }
        }
      }

      // -------------------------------------------------------------------
      // signer_list -- paired signers
      // -------------------------------------------------------------------
      case 'signer_list': {
        const signers = await this._facade.listSigners()
        return {
          ok: true,
          data: {
            signers: signers.map((d) => ({
              publicKey: d.publicKey,
              name: d.name,
              registeredAt: d.registeredAt,
              revokedAt: d.status.kind === 'revoked' ? d.status.revokedAt : null,
              active: d.status.kind === 'active'
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
        const wallets = await this._facade.listWallets()

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
