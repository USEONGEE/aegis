import { verifyToken } from './auth.js'
import { sendPushNotification } from './push.js'
import config from '../config.js'
import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import type { QueueAdapter } from '../queue/queue-adapter.js'
import type { RegistryAdapter } from '../registry/registry-adapter.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'daemon' | 'app'

interface ConnectionBucket {
  daemon: WebSocket | null
  apps: Set<WebSocket>
}

interface IncomingMessage {
  type: string
  payload?: any
  sessionId?: string
  encrypted?: boolean
}

interface OutgoingMessage {
  type: string
  id?: string
  payload?: any
  sessionId?: string
  encrypted?: boolean
  message?: string
  userId?: string
}

/**
 * WebSocket route plugin.
 *
 * Endpoints:
 *   /ws/daemon  -- daemon connections (one per userId, outbound from personal server)
 *   /ws/app     -- RN app connections (one+ per userId)
 *
 * Expects `fastify.queue` (RedisQueue) and `fastify.registry` (PgRegistry)
 * to be decorated before registration.
 */
export default async function wsRoutes (fastify: FastifyInstance): Promise<void> {
  const queue = (fastify as any).queue as QueueAdapter
  const registry = (fastify as any).registry as RegistryAdapter

  /**
   * Connected clients indexed by userId.
   * Each userId can have one daemon and multiple app connections.
   */
  const connections = new Map<string, ConnectionBucket>()

  /** Get or create the connection bucket for a userId. */
  function getBucket (userId: string): ConnectionBucket {
    let bucket = connections.get(userId)
    if (!bucket) {
      bucket = { daemon: null, apps: new Set() }
      connections.set(userId, bucket)
    }
    return bucket
  }

  /** Remove a socket from the connection map. */
  function removeSocket (userId: string, role: Role, socket: WebSocket): void {
    const bucket = connections.get(userId)
    if (!bucket) return
    if (role === 'daemon' && bucket.daemon === socket) {
      bucket.daemon = null
    } else {
      bucket.apps.delete(socket)
    }
    if (!bucket.daemon && bucket.apps.size === 0) {
      connections.delete(userId)
    }
  }

  /* ------------------------------------------------------------------
   * /ws/daemon
   * ----------------------------------------------------------------*/
  fastify.get('/ws/daemon', { websocket: true } as any, (socket: any, request: any) => {
    handleConnection(socket, request, 'daemon')
  })

  /* ------------------------------------------------------------------
   * /ws/app
   * ----------------------------------------------------------------*/
  fastify.get('/ws/app', { websocket: true } as any, (socket: any, request: any) => {
    handleConnection(socket, request, 'app')
  })

  /* ------------------------------------------------------------------
   * Shared connection handler
   * ----------------------------------------------------------------*/

  function handleConnection (socket: WebSocket, request: any, role: Role): void {
    let userId: string | null = null
    let authenticated = false

    /** Per-user cursor for consuming streams since last delivery. */
    let controlCursor = '$'
    let chatCursors = new Map<string, string>() // sessionId -> lastId

    /** Polling abort controller -- cancelled on socket close. */
    const ac = new AbortController()

    socket.on('message', async (raw: Buffer) => {
      let msg: IncomingMessage
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return send(socket, { type: 'error', message: 'Invalid JSON' })
      }

      /* ---- authenticate ---- */
      if (msg.type === 'authenticate') {
        const token: string | undefined = msg.payload?.token
        const payload = verifyToken(token!)
        if (!payload) {
          return send(socket, { type: 'error', message: 'Authentication failed' })
        }

        userId = payload.sub
        authenticated = true

        const bucket = getBucket(userId)
        if (role === 'daemon') {
          // Only one daemon connection per user
          if (bucket.daemon) {
            (bucket.daemon as any).close(4000, 'Replaced by new daemon connection')
          }
          bucket.daemon = socket
        } else {
          bucket.apps.add(socket)
        }

        send(socket, { type: 'authenticated', userId })
        fastify.log.info({ userId, role }, 'WebSocket authenticated')

        // Start forwarding stream messages to this client
        startStreamPolling(userId, role, socket, ac.signal)
        return
      }

      if (!authenticated) {
        return send(socket, { type: 'error', message: 'Not authenticated. Send { type: "authenticate" } first.' })
      }

      /* ---- heartbeat (daemon only) -- accept both 'heartbeat' and 'ping' ---- */
      if (msg.type === 'heartbeat' || msg.type === 'ping') {
        await queue.setWithTtl(`online:${userId}`, config.heartbeatTtl)
        return
      }

      /* ---- control message ---- */
      if (msg.type === 'control') {
        const stream = `control:${userId}`
        const entry: Record<string, string> = {
          sender: role,
          payload: JSON.stringify(msg.payload),
          timestamp: String(Date.now()),
        }
        if (msg.encrypted) entry.encrypted = '1'
        const id = await queue.publish(stream, entry)

        // Forward to the other side immediately via connected sockets
        const bucket = getBucket(userId!)
        const outgoing: OutgoingMessage = { type: 'control', id, payload: msg.payload }
        if (msg.encrypted) outgoing.encrypted = true

        if (role === 'daemon') {
          // Daemon sent -> forward to all apps
          for (const appSocket of bucket.apps) {
            send(appSocket, outgoing)
          }
          // Push notification to offline app devices
          await pushToOfflineApps(userId!, 'Control', 'New control message')
        } else {
          // App sent -> forward to daemon
          if (bucket.daemon) {
            send(bucket.daemon, outgoing)
          }
        }
        return
      }

      /* ---- chat message ---- */
      if (msg.type === 'chat') {
        const sessionId = msg.sessionId
        if (!sessionId) {
          return send(socket, { type: 'error', message: 'Missing sessionId for chat message' })
        }

        const stream = `chat:${userId}:${sessionId}`
        const entry: Record<string, string> = {
          sender: role,
          sessionId,
          payload: JSON.stringify(msg.payload),
          timestamp: String(Date.now()),
        }
        if (msg.encrypted) entry.encrypted = '1'
        const id = await queue.publish(stream, entry)

        // Forward to the other side
        const bucket = getBucket(userId!)
        const outgoing: OutgoingMessage = { type: 'chat', id, sessionId, payload: msg.payload }
        if (msg.encrypted) outgoing.encrypted = true

        if (role === 'daemon') {
          for (const appSocket of bucket.apps) {
            send(appSocket, outgoing)
          }
          await pushToOfflineApps(userId!, 'New message', 'You have a new chat message')
        } else {
          if (bucket.daemon) {
            send(bucket.daemon, outgoing)
          }
        }
        return
      }

      send(socket, { type: 'error', message: `Unknown message type: ${msg.type}` })
    })

    socket.on('close', () => {
      ac.abort()
      if (userId) {
        removeSocket(userId, role, socket)
        fastify.log.info({ userId, role }, 'WebSocket disconnected')
      }
    })

    socket.on('error', (err: Error) => {
      fastify.log.error({ userId, role, err: err.message }, 'WebSocket error')
    })
  }

  /* ------------------------------------------------------------------
   * Stream polling -- delivers queued messages that arrived while the
   * client was disconnected or between immediate forwards.
   * ----------------------------------------------------------------*/

  async function startStreamPolling (userId: string, role: Role, socket: WebSocket, signal: AbortSignal): Promise<void> {
    // Poll control channel
    pollStream(`control:${userId}`, role, socket, userId, signal)
  }

  async function pollStream (stream: string, role: Role, socket: WebSocket, userId: string, signal: AbortSignal): Promise<void> {
    let cursor = '$' // start from new messages only

    while (!signal.aborted) {
      try {
        const entries = await queue.consume(stream, cursor, 20)
        for (const entry of entries) {
          cursor = entry.id
          const sender = entry.data.sender

          // Don't echo messages back to the sender role
          if (sender === role) continue

          const payload = tryParseJSON(entry.data.payload)
          const sessionId = entry.data.sessionId
          const encrypted = entry.data.encrypted === '1'

          if (sessionId) {
            const out: OutgoingMessage = { type: 'chat', id: entry.id, sessionId, payload }
            if (encrypted) out.encrypted = true
            send(socket, out)
          } else {
            const out: OutgoingMessage = { type: 'control', id: entry.id, payload }
            if (encrypted) out.encrypted = true
            send(socket, out)
          }
        }
      } catch (err: any) {
        // XREAD can fail if connection drops -- log and retry
        if (!signal.aborted) {
          fastify.log.error({ err: err.message, stream }, 'Stream poll error')
          await sleep(1000)
        }
      }
    }
  }

  /* ------------------------------------------------------------------
   * Push notifications for offline app devices
   * ----------------------------------------------------------------*/

  async function pushToOfflineApps (userId: string, title: string, body: string): Promise<void> {
    try {
      const devices = await registry.getDevicesByUser(userId)
      const bucket = getBucket(userId)

      // Collect connected app device IDs (we'd need to track deviceId on socket
      // for precise matching; for now push to all app tokens when no apps connected)
      if (bucket.apps.size > 0) return // at least one app is online

      for (const device of devices) {
        if (device.type === 'app' && device.pushToken) {
          await sendPushNotification(device.pushToken, title, body, { userId })
        }
      }
    } catch (err: any) {
      fastify.log.error({ err: err.message, userId }, 'Push notification error')
    }
  }

  /* ------------------------------------------------------------------
   * Helpers
   * ----------------------------------------------------------------*/

  function send (socket: WebSocket, data: OutgoingMessage): void {
    if ((socket as any).readyState === 1) { // WebSocket.OPEN
      socket.send(JSON.stringify(data))
    }
  }

  function tryParseJSON (str: string): any {
    try {
      return JSON.parse(str)
    } catch {
      return str
    }
  }

  function sleep (ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
