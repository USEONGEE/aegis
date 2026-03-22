import { verifyToken } from './auth.js'
import type { JwtPayload } from './auth.js'
import { sendPushNotification } from './push.js'
import config from '../config.js'
import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import type { QueueAdapter } from '../queue/queue-adapter.js'
import type { RegistryAdapter } from '../registry/registry-adapter.js'
import type { RelayEnvelope } from '@wdk-app/protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DaemonSocket {
  socket: WebSocket
  daemonId: string
  userIds: Set<string>
  pollerAbort: AbortController
  userPollerAborts: Map<string, AbortController>
}

/** Incoming message: wire JSON with required RelayEnvelope fields + extras */
interface IncomingMessage {
  type: string
  payload: unknown
  encrypted: boolean
  sessionId: string | null
  userId: string | null
  daemonId: string | null
  userIds: string[] | null
  id: string | null
  message: string | null
  lastControlIds: Record<string, string> | null
}

/** Outgoing message: wire JSON response */
interface OutgoingMessage {
  type: string
  [key: string]: unknown
}

/**
 * WebSocket route plugin — v0.3.0 multiplex architecture.
 *
 * Endpoints:
 *   /ws/daemon  — single daemon connection serving N users
 *   /ws/app     — per-user app connections
 *
 * Expects `fastify.queue` (QueueAdapter) and `fastify.registry` (RegistryAdapter)
 * to be decorated before registration.
 */
export default async function wsRoutes (fastify: FastifyInstance): Promise<void> {
  const queue = (fastify as unknown as { queue: QueueAdapter }).queue
  const registry = (fastify as unknown as { registry: RegistryAdapter }).registry

  // -----------------------------------------------------------------------
  // Connection state
  // -----------------------------------------------------------------------

  const daemonSockets = new Map<string, DaemonSocket>()
  const userToDaemon = new Map<string, string>()
  const appBuckets = new Map<string, Set<WebSocket>>()

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  function send (socket: WebSocket, data: OutgoingMessage): void {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(data))
    }
  }

  function tryParseJSON (str: string): unknown {
    try { return JSON.parse(str) } catch { return str }
  }

  function sleep (ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  function getAppSockets (userId: string): Set<WebSocket> {
    let s = appBuckets.get(userId)
    if (!s) { s = new Set(); appBuckets.set(userId, s) }
    return s
  }

  // -----------------------------------------------------------------------
  // /ws/daemon
  // -----------------------------------------------------------------------

  fastify.get('/ws/daemon', { websocket: true }, (socket, _request) => {
    handleDaemonConnection(socket)
  })

  function handleDaemonConnection (socket: WebSocket): void {
    let daemonId: string | null = null
    let authenticated = false

    socket.on('message', async (raw: Buffer) => {
      let msg: IncomingMessage
      try { msg = JSON.parse(raw.toString()) } catch {
        return send(socket, { type: 'error', message: 'Invalid JSON' })
      }

      /* ---- authenticate ---- */
      if (msg.type === 'authenticate') {
        const authPayload = msg.payload as Record<string, unknown> | undefined
        const token: string | undefined = authPayload?.token as string | undefined
        if (!token) {
          send(socket, { type: 'error', message: 'Missing token' })
          socket.close(4001, 'Missing token')
          return
        }

        const payload = verifyToken(token)
        if (!payload || payload.role !== 'daemon') {
          send(socket, { type: 'error', message: 'Authentication failed' })
          socket.close(4001, 'Authentication failed')
          return
        }

        daemonId = payload.sub
        authenticated = true

        // Replace existing daemon connection (abort all pollers)
        const existing = daemonSockets.get(daemonId)
        if (existing && existing.socket !== socket) {
          existing.pollerAbort.abort()
          for (const ac of existing.userPollerAborts.values()) { ac.abort() }
          existing.userPollerAborts.clear()
          existing.socket.close(4000, 'Replaced by new daemon connection')
        }

        // Load bound users from DB
        const userIds = await registry.getUsersByDaemon(daemonId)
        const pollerAbort = new AbortController()
        const ds: DaemonSocket = { socket, daemonId, userIds: new Set(userIds), pollerAbort, userPollerAborts: new Map() }
        daemonSockets.set(daemonId, ds)

        for (const uid of userIds) {
          userToDaemon.set(uid, daemonId)
        }

        send(socket, { type: 'authenticated', daemonId, userIds })
        fastify.log.info({ daemonId, userCount: userIds.length }, 'Daemon authenticated')

        // Start control stream polling (per user with individual abort)
        const lastControlIds: Record<string, string> = msg.lastControlIds ?? (authPayload?.lastControlIds as Record<string, string>) ?? {}
        for (const uid of userIds) {
          const cursor = lastControlIds[uid] || '$'
          const userAc = new AbortController()
          ds.userPollerAborts.set(uid, userAc)
          pollControlForDaemon(ds, uid, cursor, userAc.signal)
        }

        // Start daemon-events polling
        pollDaemonEvents(ds, pollerAbort.signal)
        return
      }

      if (!authenticated || !daemonId) {
        return send(socket, { type: 'error', message: 'Not authenticated' })
      }

      /* ---- heartbeat ---- */
      if (msg.type === 'heartbeat' || msg.type === 'ping') {
        await queue.setWithTtl(`online:daemon:${daemonId}`, config.heartbeatTtl)
        return
      }

      /* ---- query_result (daemon → app, WS 직접 전달, Redis bypass) ---- */
      if (msg.type === 'query_result') {
        if (!msg.userId) {
          return send(socket, { type: 'error', message: 'Missing userId for query_result' })
        }
        const apps = appBuckets.get(msg.userId)
        if (apps) {
          const outgoing: OutgoingMessage = { type: 'query_result', payload: msg.payload }
          if (msg.encrypted) outgoing.encrypted = true
          for (const appSocket of apps) { send(appSocket, outgoing) }
        }
        return
      }

      /* ---- control / chat (daemon → app) ---- */
      if (msg.type === 'control' || msg.type === 'chat') {
        const ds = daemonSockets.get(daemonId)
        if (!ds) return

        // v0.3.0: userId is required unless it's an event_stream broadcast
        if (!msg.userId) {
          const payloadObj = msg.payload as Record<string, unknown> | undefined
          const isEventStream = payloadObj?.type === 'event_stream'
          if (!isEventStream) {
            return send(socket, { type: 'error', message: 'Missing userId' })
          }
        }

        const targetUserIds = msg.userId ? [msg.userId] : [...ds.userIds]

        // Validate ownership for targeted messages
        if (msg.userId && !ds.userIds.has(msg.userId)) {
          return send(socket, { type: 'error', message: 'Unauthorized userId' })
        }

        for (const userId of targetUserIds) {
          const stream = msg.type === 'chat'
            ? `chat:${userId}:${msg.sessionId}`
            : `control:${userId}`
          const entry: Record<string, string> = {
            sender: 'daemon',
            payload: JSON.stringify(msg.payload),
            timestamp: String(Date.now()),
          }
          if (msg.sessionId) entry.sessionId = msg.sessionId
          if (msg.encrypted) entry.encrypted = '1'
          const id = await queue.publish(stream, entry)

          // v0.4.8: 직접 forward 제거. Redis → poller가 유일한 전달 경로.

          const apps = appBuckets.get(userId)
          if (!apps || apps.size === 0) {
            await pushToOfflineApps(userId, msg.type === 'chat' ? 'New message' : 'Control', 'You have a new message')
          }
        }
        return
      }

      send(socket, { type: 'error', message: `Unknown message type: ${msg.type}` })
    })

    socket.on('close', () => {
      if (daemonId) {
        const ds = daemonSockets.get(daemonId)
        if (ds && ds.socket === socket) {
          ds.pollerAbort.abort()
          // Abort all per-user pollers
          for (const ac of ds.userPollerAborts.values()) { ac.abort() }
          ds.userPollerAborts.clear()
          for (const uid of ds.userIds) {
            if (userToDaemon.get(uid) === daemonId) userToDaemon.delete(uid)
          }
          daemonSockets.delete(daemonId)
        }
        fastify.log.info({ daemonId }, 'Daemon disconnected')
      }
    })

    socket.on('error', (err: Error) => {
      fastify.log.error({ daemonId, err: err.message }, 'Daemon WS error')
    })
  }

  // -----------------------------------------------------------------------
  // /ws/app
  // -----------------------------------------------------------------------

  fastify.get('/ws/app', { websocket: true }, (socket, _request) => {
    handleAppConnection(socket)
  })

  function handleAppConnection (socket: WebSocket): void {
    let userId: string | null = null
    let authenticated = false
    let controlCursor = '$'
    const ac = new AbortController()

    socket.on('message', async (raw: Buffer) => {
      let msg: IncomingMessage
      try { msg = JSON.parse(raw.toString()) } catch {
        return send(socket, { type: 'error', message: 'Invalid JSON' })
      }

      /* ---- authenticate ---- */
      if (msg.type === 'authenticate') {
        const authPayload = msg.payload as Record<string, unknown> | undefined
        const token: string | undefined = authPayload?.token as string | undefined
        if (!token) {
          send(socket, { type: 'error', message: 'Missing token' })
          socket.close(4001, 'Missing token')
          return
        }

        const payload = verifyToken(token)
        if (!payload || payload.role !== 'app') {
          send(socket, { type: 'error', message: 'Authentication failed' })
          socket.close(4001, 'Authentication failed')
          return
        }

        userId = payload.sub
        authenticated = true

        const clientLastStreamId: string | undefined = authPayload?.lastStreamId as string | undefined
        if (clientLastStreamId && clientLastStreamId !== '$' && clientLastStreamId !== '0') {
          controlCursor = clientLastStreamId
        }

        getAppSockets(userId).add(socket)
        send(socket, { type: 'authenticated', userId })
        fastify.log.info({ userId }, 'App authenticated')

        pollControlForApp(userId, socket, controlCursor, ac.signal)

        // Backfill known chat sessions for offline cron recovery (one-shot, non-blocking)
        const chatCursors: Record<string, string> = (authPayload?.chatCursors as Record<string, string>) ?? {}
        for (const [sessionId, cursor] of Object.entries(chatCursors)) {
          backfillChatStream(userId, sessionId, cursor, socket)
        }

        return
      }

      if (!authenticated || !userId) {
        return send(socket, { type: 'error', message: 'Not authenticated' })
      }

      /* ---- subscribe_chat: backfill + continuous polling ---- */
      if (msg.type === 'subscribe_chat') {
        const sessionId = (msg.payload as Record<string, unknown> | undefined)?.sessionId as string | undefined
        const cursor = (msg.payload as Record<string, unknown> | undefined)?.cursor as string | undefined
        if (sessionId && userId) {
          backfillChatStream(userId, sessionId, cursor || '0', socket)
          pollChatForApp(userId, sessionId, cursor || '$', socket, ac.signal)
        }
        return
      }

      /* ---- heartbeat ---- */
      if (msg.type === 'heartbeat' || msg.type === 'ping') {
        return
      }

      /* ---- query (app → daemon, WS 직접 전달, Redis bypass) ---- */
      if (msg.type === 'query') {
        const daemonId = userToDaemon.get(userId)
        if (daemonId) {
          const ds = daemonSockets.get(daemonId)
          if (ds) {
            send(ds.socket, { type: 'query', userId, payload: msg.payload })
          } else {
            // daemon socket gone — respond with error
            send(socket, { type: 'query_result', payload: { requestId: (msg.payload as Record<string, unknown>)?.requestId, status: 'error', error: 'daemon_offline' } })
          }
        } else {
          send(socket, { type: 'query_result', payload: { requestId: (msg.payload as Record<string, unknown>)?.requestId, status: 'error', error: 'daemon_offline' } })
        }
        return
      }

      /* ---- control / chat (app → daemon) ---- */
      if (msg.type === 'control' || msg.type === 'chat') {
        if (msg.type === 'chat' && !msg.sessionId) {
          return send(socket, { type: 'error', message: 'Missing sessionId for chat message' })
        }

        const stream = msg.type === 'chat'
          ? `chat:${userId}:${msg.sessionId}`
          : `control:${userId}`

        const entry: Record<string, string> = {
          sender: 'app',
          payload: JSON.stringify(msg.payload),
          timestamp: String(Date.now()),
        }
        if (msg.sessionId) entry.sessionId = msg.sessionId
        if (msg.encrypted) entry.encrypted = '1'
        await queue.publish(stream, entry)

        // v0.5.0: Chat은 daemon에 직접 forward (sessionId 기반이라 polling 불가)
        if (msg.type === 'chat') {
          const daemonId = userToDaemon.get(userId)
          if (daemonId) {
            const ds = daemonSockets.get(daemonId)
            if (ds) {
              send(ds.socket, { type: 'chat', userId, sessionId: msg.sessionId, payload: msg.payload })
            }
          }
        }
        // control은 pollControlForDaemon()이 전달
        return
      }

      send(socket, { type: 'error', message: `Unknown message type: ${msg.type}` })
    })

    socket.on('close', () => {
      ac.abort()
      if (userId) {
        const apps = appBuckets.get(userId)
        if (apps) {
          apps.delete(socket)
          if (apps.size === 0) appBuckets.delete(userId)
        }
        fastify.log.info({ userId }, 'App disconnected')
      }
    })

    socket.on('error', (err: Error) => {
      fastify.log.error({ userId, err: err.message }, 'App WS error')
    })
  }

  // -----------------------------------------------------------------------
  // Stream polling — Daemon (control only, per-user)
  // -----------------------------------------------------------------------

  async function pollControlForDaemon (
    ds: DaemonSocket, userId: string, initialCursor: string, signal: AbortSignal
  ): Promise<void> {
    let cursor = initialCursor
    while (!signal.aborted) {
      try {
        const entries = await queue.consume(`control:${userId}`, cursor, 20)
        for (const entry of entries) {
          cursor = entry.id
          if (entry.data.sender === 'daemon') continue
          const payload = tryParseJSON(entry.data.payload)
          const encrypted = entry.data.encrypted === '1'
          const out: OutgoingMessage = { type: 'control', id: entry.id, userId, payload }
          if (encrypted) out.encrypted = true
          send(ds.socket, out)
        }
      } catch (err: unknown) {
        if (!signal.aborted) {
          fastify.log.error({ err: err instanceof Error ? err.message : String(err), userId }, 'Daemon control poll error')
          await sleep(1000)
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Stream polling — App (control for single user)
  // -----------------------------------------------------------------------

  async function pollControlForApp (
    userId: string, socket: WebSocket, initialCursor: string, signal: AbortSignal
  ): Promise<void> {
    let cursor = initialCursor
    while (!signal.aborted) {
      try {
        const entries = await queue.consume(`control:${userId}`, cursor, 20)
        for (const entry of entries) {
          cursor = entry.id
          if (entry.data.sender === 'app') continue
          const payload = tryParseJSON(entry.data.payload)
          const encrypted = entry.data.encrypted === '1'
          // v0.4.8: sender=daemon 메시지는 event_stream 채널로 전달
          const out: OutgoingMessage = { type: 'event_stream', id: entry.id, payload }
          if (encrypted) out.encrypted = true
          send(socket, out)
        }
      } catch (err: unknown) {
        if (!signal.aborted) {
          fastify.log.error({ err: err instanceof Error ? err.message : String(err), userId }, 'App control poll error')
          await sleep(1000)
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Chat backfill — one-shot XRANGE for offline cron recovery
  // -----------------------------------------------------------------------

  async function backfillChatStream (
    userId: string, sessionId: string, startId: string, socket: WebSocket
  ): Promise<void> {
    try {
      const stream = `chat:${userId}:${sessionId}`
      const entries = await queue.readRange(stream, startId, '+', 1000)
      for (const entry of entries) {
        if (entry.data.sender === 'app') continue // echo 방지
        const payload = tryParseJSON(entry.data.payload)
        const encrypted = entry.data.encrypted === '1'
        const out: OutgoingMessage = { type: 'chat', id: entry.id, sessionId, payload }
        if (encrypted) out.encrypted = true
        send(socket, out)
      }
      fastify.log.info({ userId, sessionId, startId, count: entries.length }, 'Chat backfill completed')
    } catch (err: unknown) {
      fastify.log.error({ err: err instanceof Error ? err.message : String(err), userId, sessionId }, 'Chat backfill error')
    }
  }

  // -----------------------------------------------------------------------
  // Chat polling — App (continuous, per session)
  // -----------------------------------------------------------------------

  async function pollChatForApp (
    userId: string, sessionId: string, initialCursor: string, socket: WebSocket, signal: AbortSignal
  ): Promise<void> {
    const stream = `chat:${userId}:${sessionId}`
    let cursor = initialCursor
    while (!signal.aborted) {
      try {
        const entries = await queue.consume(stream, cursor, 20)
        for (const entry of entries) {
          cursor = entry.id
          if (entry.data.sender === 'app') continue // echo 방지
          const payload = tryParseJSON(entry.data.payload)
          const encrypted = entry.data.encrypted === '1'
          const out: OutgoingMessage = { type: 'chat', id: entry.id, sessionId, payload }
          if (encrypted) out.encrypted = true
          send(socket, out)
        }
      } catch (err: unknown) {
        if (!signal.aborted) {
          fastify.log.error({ err: err instanceof Error ? err.message : String(err), userId, sessionId }, 'App chat poll error')
          await sleep(1000)
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Daemon events polling (user_bound / user_unbound)
  // -----------------------------------------------------------------------

  async function pollDaemonEvents (ds: DaemonSocket, signal: AbortSignal): Promise<void> {
    const stream = `daemon-events:${ds.daemonId}`
    let cursor = '$'

    while (!signal.aborted) {
      try {
        const entries = await queue.consume(stream, cursor, 20)
        for (const entry of entries) {
          cursor = entry.id
          const eventType = entry.data.type
          const userId = entry.data.userId

          if (eventType === 'user_bound' && userId) {
            ds.userIds.add(userId)
            userToDaemon.set(userId, ds.daemonId)
            send(ds.socket, { type: 'user_bound', userId })
            // Start per-user poller with its own abort
            const userAc = new AbortController()
            ds.userPollerAborts.set(userId, userAc)
            pollControlForDaemon(ds, userId, '$', userAc.signal)
            fastify.log.info({ daemonId: ds.daemonId, userId }, 'User bound (runtime)')
          }

          if (eventType === 'user_unbound' && userId) {
            ds.userIds.delete(userId)
            if (userToDaemon.get(userId) === ds.daemonId) {
              userToDaemon.delete(userId)
            }
            // Stop per-user poller
            const userAc = ds.userPollerAborts.get(userId)
            if (userAc) {
              userAc.abort()
              ds.userPollerAborts.delete(userId)
            }
            send(ds.socket, { type: 'user_unbound', userId })
            fastify.log.info({ daemonId: ds.daemonId, userId }, 'User unbound (runtime)')
          }
        }
      } catch (err: unknown) {
        if (!signal.aborted) {
          fastify.log.error({ err: err instanceof Error ? err.message : String(err), daemonId: ds.daemonId }, 'Daemon events poll error')
          await sleep(1000)
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Push notifications for offline app devices
  // -----------------------------------------------------------------------

  async function pushToOfflineApps (userId: string, title: string, body: string): Promise<void> {
    try {
      const devices = await registry.getDevicesByUser(userId)
      const apps = appBuckets.get(userId)
      if (apps && apps.size > 0) return

      for (const device of devices) {
        if (device.type === 'app' && device.pushToken) {
          await sendPushNotification(device.pushToken, title, body, { userId })
        }
      }
    } catch (err: unknown) {
      fastify.log.error({ err: err instanceof Error ? err.message : String(err), userId }, 'Push notification error')
    }
  }
}
