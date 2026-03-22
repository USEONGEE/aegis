import { createServer } from 'node:http'
import type { Server, IncomingMessage, ServerResponse } from 'node:http'
import type { Logger } from 'pino'
import { executeToolCall } from './tool-surface.js'
import type { ToolExecutionContext } from './tool-surface.js'

// ---------------------------------------------------------------------------
// Tool API HTTP Server — called by OpenClaw plugin to execute WDK tools
// ---------------------------------------------------------------------------

interface ToolApiConfig {
  port: number
  token: string
}

export class ToolApiServer {
  private _port: number
  private _token: string
  private _ctx: ToolExecutionContext
  private _logger: Logger
  private _server: Server | null

  constructor (config: ToolApiConfig, ctx: ToolExecutionContext, logger: Logger) {
    this._port = config.port
    this._token = config.token
    this._ctx = ctx
    this._logger = logger
    this._server = null
  }

  async start (): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._server = createServer((req, res) => this._handle(req, res))

      this._server.on('error', (err: Error) => {
        this._logger.error({ err }, 'Tool API server error')
        reject(err)
      })

      this._server.listen(this._port, '0.0.0.0', () => {
        this._logger.info({ port: this._port }, 'Tool API server listening')
        resolve()
      })
    })
  }

  async stop (): Promise<void> {
    if (!this._server) return
    return new Promise<void>((resolve) => {
      this._server!.close(() => {
        this._logger.info('Tool API server stopped')
        resolve()
      })
    })
  }

  // -------------------------------------------------------------------------

  private _handle (req: IncomingMessage, res: ServerResponse): void {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      this._json(res, 200, { ok: true })
      return
    }

    // POST /api/tools/:name
    const match = req.url?.match(/^\/api\/tools\/([a-zA-Z]+)$/)
    if (req.method !== 'POST' || !match) {
      this._json(res, 404, { ok: false, error: 'Not found' })
      return
    }

    // Auth
    if (this._token) {
      const auth = req.headers.authorization
      if (!auth || auth !== `Bearer ${this._token}`) {
        this._json(res, 401, { ok: false, error: 'Unauthorized' })
        return
      }
    }

    const toolName = match[1]
    this._readBody(req).then(async (body) => {
      let args: Record<string, unknown>
      try {
        const parsed = JSON.parse(body)
        args = parsed.args || {}
      } catch {
        this._json(res, 400, { ok: false, error: 'Invalid JSON body' })
        return
      }

      this._logger.info({ tool: toolName, args }, 'Tool API call')

      try {
        const result = await executeToolCall(toolName, args, this._ctx)
        this._json(res, 200, { ok: true, result })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        this._logger.error({ err, tool: toolName }, 'Tool execution error')
        this._json(res, 500, { ok: false, error: message })
      }
    }).catch(() => {
      this._json(res, 400, { ok: false, error: 'Failed to read request body' })
    })
  }

  private _json (res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  private _readBody (req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => resolve(body))
      req.on('error', reject)
    })
  }
}
