// =========================================================================
// IMPORTANT: Relay 채널 아키텍처 (v0.4.8 확정)
// =========================================================================
//
// 모든 영속 메시지(chat, control)는 Redis Stream만 거친다.
// 직접 WS socket.send() forward는 금지 — 이중 전달(메시지 중복) 방지.
//
// 영속 채널: relay → Redis XADD → poller XREAD BLOCK → 소켓 전달
// 비영속 채널(query/query_result): WS 직접 전달 (의도적 예외)
//
// XREAD BLOCK 주의: blocking Redis 연결 1개를 여러 poller가 공유하면
// head-of-line blocking 발생. chat poller 추가 시 별도 연결 필요.
// =========================================================================

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

          // IMPORTANT: Daemon→App 방향은 직접 forward 하지 않는다 (v0.4.8 원칙).
          // Redis XADD → pollChatForApp() / pollControlForApp()이 유일한 전달 경로.
          // 이중 전달(직접+poller) 시 메시지 중복 발생하므로 절대 socket.send() 추가 금지.

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
          // backfill first, then poll from last backfilled ID (no gap)
          backfillChatStream(userId, sessionId, cursor || '0', socket)
            .then((lastId) => {
              pollChatForApp(userId, sessionId, lastId, socket, ac.signal)
            })
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

      // DEBUG: log all app WS messages after auth
      fastify.log.info({ type: msg.type, userId, sessionId: msg.sessionId }, 'App WS message received')

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

        // IMPORTANT: App→Daemon chat은 직접 forward한다.
        // v0.4.8 원칙(Redis poller만 전달)의 의도적 예외.
        // 이유: chat stream 키가 chat:{userId}:{sessionId}라서
        // daemon이 sessionId를 미리 알 수 없어 polling 대상을 특정할 수 없다.
        // Redis에도 저장(위 XADD)하므로 이력은 보존된다.
        // control은 pollControlForDaemon()이 전달한다.
        if (msg.type === 'chat') {
          const daemonId = userToDaemon.get(userId)
          fastify.log.info({ userId, daemonId: daemonId ?? 'NONE', hasDaemonSocket: daemonId ? !!daemonSockets.get(daemonId) : false }, 'Chat forward attempt')
          if (daemonId) {
            const ds = daemonSockets.get(daemonId)
            if (ds) {
              send(ds.socket, { type: 'chat', userId, sessionId: msg.sessionId, payload: msg.payload })
              fastify.log.info({ daemonId, sessionId: msg.sessionId }, 'Chat forwarded to daemon')
            } else {
              fastify.log.warn({ daemonId }, 'Daemon socket not found')
            }
          } else {
            fastify.log.warn({ userId }, 'No daemon mapped for user')
          }
        }
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
  ): Promise<string> {
    let lastId = startId
    try {
      const stream = `chat:${userId}:${sessionId}`
      const entries = await queue.readRange(stream, startId, '+', 1000)
      for (const entry of entries) {
        lastId = entry.id
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
    return lastId
  }

  // -----------------------------------------------------------------------
  // Chat polling — App (continuous, per session)
  // IMPORTANT: non-blocking readRange + sleep(200ms)을 사용한다.
  // queue.consume() (XREAD BLOCK)을 쓰면 blocking Redis 연결을
  // control poller와 공유하여 head-of-line blocking이 발생한다.
  // 근본 해결은 chat용 별도 blocking Redis 연결 분리이지만,
  // 현재는 non-blocking polling으로 200ms 이내 지연을 보장한다.
  // -----------------------------------------------------------------------

  async function pollChatForApp (
    userId: string, sessionId: string, initialCursor: string, socket: WebSocket, signal: AbortSignal
  ): Promise<void> {
    const stream = `chat:${userId}:${sessionId}`
    let cursor = initialCursor
    // Use non-blocking readRange + short sleep to avoid head-of-line blocking
    // with other XREAD BLOCK consumers sharing the same Redis connection
    const exclusiveStart = (id: string) => {
      // XRANGE is inclusive; to exclude `id`, increment the sequence
      const parts = id.split('-')
      if (parts.length === 2) return `${parts[0]}-${Number(parts[1]) + 1}`
      return id
    }
    fastify.log.info({ userId, sessionId, cursor }, 'pollChatForApp started')
    while (!signal.aborted) {
      try {
        const startId = cursor === '0' || cursor === '$' ? '0' : exclusiveStart(cursor)
        const entries = await queue.readRange(stream, startId, '+', 100)
        let hasNew = false
        for (const entry of entries) {
          if (entry.id <= cursor && cursor !== '0' && cursor !== '$') continue
          cursor = entry.id
          hasNew = true
          if (entry.data.sender === 'app') continue // echo 방지
          const payload = tryParseJSON(entry.data.payload)
          const encrypted = entry.data.encrypted === '1'
          const out: OutgoingMessage = { type: 'chat', id: entry.id, sessionId, payload }
          if (encrypted) out.encrypted = true
          fastify.log.info({ sessionId, entryId: entry.id, socketOpen: socket.readyState === 1 }, 'pollChatForApp delivering message')
          send(socket, out)
        }
        if (!hasNew) await sleep(200)
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
