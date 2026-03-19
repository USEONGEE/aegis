import WebSocket from 'ws'
import { EventEmitter } from 'node:events'
import nacl from 'tweetnacl'
import type { Logger } from 'pino'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelayClientOptions {
  reconnectBaseMs?: number
  reconnectMaxMs?: number
  heartbeatIntervalMs?: number
}

export interface EncryptedPayload {
  nonce: string
  ciphertext: string
}

export interface RelayEnvelope {
  type: string
  payload?: any
  encrypted?: boolean
  sessionId?: string
}

export type MessageHandler = (type: string, payload: any, raw: any) => void

// ---------------------------------------------------------------------------
// RelayClient
// ---------------------------------------------------------------------------

/**
 * Relay WebSocket client with automatic reconnection and heartbeat.
 *
 * Usage:
 *   const relay = new RelayClient(logger)
 *   relay.connect(url, token)
 *   relay.onMessage((type, payload) => { ... })
 *   relay.send('chat', { sessionId, content: '...' })
 */
export class RelayClient extends EventEmitter {
  private _logger: Logger
  private _url: string | null
  private _token: string | null
  private _ws: WebSocket | null
  private _connected: boolean
  private _disposed: boolean

  // Reconnect settings
  private _reconnectBaseMs: number
  private _reconnectMaxMs: number
  private _reconnectAttempt: number
  private _reconnectTimer: ReturnType<typeof setTimeout> | null

  // Heartbeat
  private _heartbeatIntervalMs: number
  private _heartbeatTimer: ReturnType<typeof setInterval> | null
  private _lastPong: number

  // Message handler
  private _messageHandler: MessageHandler | null

  // E2E encryption -- set after pairing via setSessionKey()
  private _sessionKey: Uint8Array | null // 32 bytes, NaCl box shared key

  // Step 10: Track last stream ID for reconnect cursor
  private _lastStreamId: string

  constructor (logger: Logger, opts: RelayClientOptions = {}) {
    super()
    this._logger = logger
    this._url = null
    this._token = null
    this._ws = null
    this._connected = false
    this._disposed = false

    // Reconnect settings
    this._reconnectBaseMs = opts.reconnectBaseMs || 1000
    this._reconnectMaxMs = opts.reconnectMaxMs || 30000
    this._reconnectAttempt = 0
    this._reconnectTimer = null

    // Heartbeat
    this._heartbeatIntervalMs = opts.heartbeatIntervalMs || 30000
    this._heartbeatTimer = null
    this._lastPong = 0

    // Message handler
    this._messageHandler = null

    // E2E encryption
    this._sessionKey = null

    // Step 10: reconnect cursor
    this._lastStreamId = '$'
  }

  /**
   * Connect to the Relay WebSocket server.
   */
  connect (url: string, token: string): void {
    this._url = url
    this._token = token
    this._disposed = false
    this._doConnect()
  }

  /**
   * Set the E2E session key (shared secret from pairing ECDH).
   * Once set, all payloads are encrypted before sending and decrypted on receive.
   */
  setSessionKey (sessionKey: Uint8Array): void {
    this._sessionKey = sessionKey
    this._logger.info('E2E session key established')
  }

  /**
   * Clear the E2E session key (on disconnect / re-pair).
   */
  clearSessionKey (): void {
    this._sessionKey = null
  }

  /**
   * Encrypt a payload string using the E2E session key (NaCl secretbox).
   */
  private _encrypt (plaintext: string): EncryptedPayload {
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
    const messageBytes = new TextEncoder().encode(plaintext)
    const ciphertext = nacl.secretbox(messageBytes, nonce, this._sessionKey!)
    return {
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64')
    }
  }

  /**
   * Decrypt an encrypted payload using the E2E session key.
   */
  private _decrypt (encrypted: EncryptedPayload): string {
    const nonce = Buffer.from(encrypted.nonce, 'base64')
    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64')
    const plaintext = nacl.secretbox.open(ciphertext, nonce, this._sessionKey!)
    if (!plaintext) {
      throw new Error('E2E decryption failed -- invalid ciphertext or wrong key')
    }
    return new TextDecoder().decode(plaintext)
  }

  /**
   * Register a handler for incoming messages.
   */
  onMessage (handler: MessageHandler): void {
    this._messageHandler = handler
  }

  /**
   * Send a message to the Relay.
   * Uses relay's expected format: { type: 'control' | 'chat' | 'heartbeat', ... }
   * If E2E session key is set, payload is encrypted before sending.
   */
  send (type: string, payload: Record<string, unknown>): boolean {
    if (!this._ws || !this._connected) {
      this._logger.warn({ type }, 'Cannot send: not connected to Relay')
      return false
    }

    const envelope: RelayEnvelope = { type }

    // Encrypt payload if E2E session is established
    if (this._sessionKey) {
      envelope.payload = this._encrypt(JSON.stringify(payload))
      envelope.encrypted = true
    } else {
      envelope.payload = payload
    }

    // Include sessionId at top level for chat messages (relay needs it for routing)
    if (type === 'chat' && payload.sessionId) {
      envelope.sessionId = payload.sessionId as string
    }

    const message = JSON.stringify(envelope)

    try {
      this._ws.send(message)
      return true
    } catch (err: any) {
      this._logger.error({ err, type }, 'Failed to send message to Relay')
      return false
    }
  }

  /**
   * Whether the client is currently connected.
   */
  get connected (): boolean {
    return this._connected
  }

  /**
   * Gracefully disconnect and stop reconnection.
   */
  disconnect (): void {
    this._disposed = true
    this._clearTimers()

    if (this._ws) {
      try {
        this._ws.close(1000, 'Client disconnect')
      } catch {
        // Ignore close errors
      }
      this._ws = null
    }

    this._connected = false
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private _doConnect (): void {
    if (this._disposed) return

    this._logger.info({ url: this._url, attempt: this._reconnectAttempt }, 'Connecting to Relay')

    try {
      this._ws = new WebSocket(this._url!, {
        headers: {
          authorization: `Bearer ${this._token}`
        }
      })
    } catch (err: any) {
      this._logger.error({ err }, 'Failed to create WebSocket')
      this._scheduleReconnect()
      return
    }

    this._ws.on('open', () => {
      this._connected = true
      this._reconnectAttempt = 0
      this._lastPong = Date.now()
      this._logger.info('Connected to Relay')

      // Authenticate — include lastStreamId for reconnect cursor (Step 10)
      this._ws!.send(JSON.stringify({
        type: 'authenticate',
        payload: { token: this._token, lastStreamId: this._lastStreamId }
      }))

      // Start heartbeat
      this._startHeartbeat()

      this.emit('connected')
    })

    this._ws.on('message', (data: WebSocket.Data) => {
      let msg: any
      try {
        msg = JSON.parse(data.toString())
      } catch (err) {
        this._logger.warn({ raw: data.toString().slice(0, 200) }, 'Unparseable message from Relay')
        return
      }

      // Handle pong
      if (msg.type === 'pong') {
        this._lastPong = Date.now()
        return
      }

      // Step 10: Track last stream ID for reconnect cursor
      if (msg.id) {
        this._lastStreamId = msg.id
      }

      // Dispatch to handler
      if (this._messageHandler) {
        const type: string = msg.type || 'unknown'
        let payload: any = msg.payload || msg

        // Decrypt payload if E2E session is established and message is encrypted
        if (this._sessionKey && msg.encrypted && payload.nonce && payload.ciphertext) {
          try {
            payload = JSON.parse(this._decrypt(payload))
          } catch (err) {
            this._logger.error({ err }, 'Failed to decrypt incoming message')
            return
          }
        }

        this._messageHandler(type, payload, msg)
      }
    })

    this._ws.on('close', (code: number, reason: Buffer) => {
      this._connected = false
      this._clearTimers()
      this._logger.info({ code, reason: reason?.toString() }, 'Relay connection closed')
      this.emit('disconnected', code)

      if (!this._disposed) {
        this._scheduleReconnect()
      }
    })

    this._ws.on('error', (err: Error) => {
      this._logger.error({ err: err.message }, 'Relay WebSocket error')
      // The 'close' event will follow -- reconnect is handled there
    })

    this._ws.on('pong', () => {
      this._lastPong = Date.now()
    })
  }

  private _scheduleReconnect (): void {
    if (this._disposed) return

    const delay = Math.min(
      this._reconnectBaseMs * Math.pow(2, this._reconnectAttempt),
      this._reconnectMaxMs
    )
    this._reconnectAttempt++

    this._logger.info({ delay, attempt: this._reconnectAttempt }, 'Scheduling reconnect')

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null
      this._doConnect()
    }, delay)
  }

  private _startHeartbeat (): void {
    this._stopHeartbeat()

    this._heartbeatTimer = setInterval(() => {
      if (!this._ws || !this._connected) return

      // Check if we missed a pong
      const elapsed = Date.now() - this._lastPong
      if (elapsed > this._heartbeatIntervalMs * 2) {
        this._logger.warn({ elapsed }, 'Heartbeat timeout -- closing connection')
        try {
          this._ws.close(4000, 'Heartbeat timeout')
        } catch {
          // Ignore
        }
        return
      }

      // Send ping
      try {
        this._ws.send(JSON.stringify({ type: 'heartbeat' }))
        this._ws.ping()
      } catch {
        // Ignore -- close handler will trigger reconnect
      }
    }, this._heartbeatIntervalMs)
  }

  private _stopHeartbeat (): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
  }

  private _clearTimers (): void {
    this._stopHeartbeat()
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
  }
}
