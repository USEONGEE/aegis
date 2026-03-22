#!/usr/bin/env node

import { mkdir } from 'node:fs/promises'
import { pino } from 'pino'
import { loadConfig } from './config.js'
import { initWDK } from './wdk-host.js'
import { createOpenClawClient } from './openclaw-client.js'
import { RelayClient } from './relay-client.js'
import { handleControlMessage } from './control-handler.js'
import { handleQueryMessage } from './query-handler.js'
import type { ControlMessage, RelayChatInput, QueryMessage } from '@wdk-app/protocol'
import { handleChatMessage, _processChatDirect } from './chat-handler.js'
import { CronScheduler } from './cron-scheduler.js'
import type { CronDispatch } from './cron-scheduler.js'
import { AdminServer } from './admin-server.js'
import { ToolApiServer } from './tool-api-server.js'
import { SqliteDaemonStore } from './sqlite-daemon-store.js'
import { MessageQueueManager } from './message-queue.js'
import { authenticateWithRelay } from './relay-auth.js'
import type { QueuedMessage } from './message-queue.js'
import type { ToolExecutionContext } from './tool-surface.js'

// ---------------------------------------------------------------------------
// Daemon entry point
// ---------------------------------------------------------------------------

async function main (): Promise<void> {
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    name: 'wdk-daemon'
  })

  logger.info('Starting WDK daemon...')

  // 1. Load config
  const config = loadConfig()
  logger.info({ wdkHome: config.wdkHome, relayUrl: config.relayUrl }, 'Config loaded')

  // 2. Init WDK (load master seed -> facade)
  const { facade } = await initWDK(config, logger)

  // 2b. Init daemon store (cron persistence)
  await mkdir(config.daemonStorePath, { recursive: true })
  const daemonStore = new SqliteDaemonStore(config.daemonStorePath + '/daemon.db')
  await daemonStore.init()

  // 3. Create OpenClaw client
  const openclawClient = createOpenClawClient(config)
  logger.info({ baseUrl: config.openclawBaseUrl }, 'OpenClaw client created')

  // 5. Connect to Relay
  const relayClient = new RelayClient(logger, {
    reconnectBaseMs: config.reconnectBaseMs,
    reconnectMaxMs: config.reconnectMaxMs,
    heartbeatIntervalMs: config.heartbeatIntervalMs
  })

  // 6. Build tool execution context (passed to tool execution)
  const ctx: ToolExecutionContext = {
    facade,
    daemonStore,
    logger
  }

  // 6b. Create FIFO message queue manager
  const queueManager = new MessageQueueManager(
    async (msg: QueuedMessage, signal: AbortSignal) => {
      // Notify app that processing has started (queue -> active transition)
      relayClient.send('control', {
        type: 'message_started',
        userId: msg.userId,
        sessionId: msg.sessionId,
        messageId: msg.messageId
      })

      try {
        await _processChatDirect(
          msg.userId,
          msg.sessionId,
          msg.text,
          openclawClient,
          relayClient,
          null,
          {},
          signal,
          msg.source
        )
        return { ok: true }
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
    { logger }
  )

  relayClient.onMessage((type, payload, raw) => {
    switch (type) {
      case 'control':
        // v0.4.8: 승인 6종 null 반환. cancel 2종은 CancelEventPayload → event_stream으로 전송.
        if (!facade) {
          logger.warn('Control message received but WDK not initialized (no master seed)')
          break
        }
        handleControlMessage(payload as ControlMessage, { facade, logger, queueManager })
          .then((result) => {
            if (result === null) return // 승인 타입: WDK 이벤트가 대신 전달
            const incomingUserId = (payload as Record<string, unknown>)?.userId as string | undefined
            relayClient.send('control', { type: 'event_stream', event: result } as unknown as Record<string, unknown>, incomingUserId)
          })
          .catch((err: Error) => logger.error({ err }, 'Unhandled error in control handler'))
        break

      case 'chat':
        logger.info({ payload: JSON.stringify(payload).slice(0, 200) }, 'Chat message received from relay')
        handleChatMessage(payload as unknown as RelayChatInput, openclawClient, relayClient, null, {}, queueManager)
          .catch((err: Error) => logger.error({ err }, 'Unhandled error in chat handler'))
        break

      case 'query': {
        // v0.4.8: query → query-handler → query_result (WS 직접 전달)
        if (!facade) {
          const queryMsg = payload as unknown as QueryMessage
          const errorResult = { requestId: queryMsg.requestId, status: 'error', error: 'WDK not initialized (no master seed)' }
          const incomingUserId = (raw as Record<string, unknown>)?.userId as string | undefined
          relayClient.send('query_result', errorResult as unknown as Record<string, unknown>, incomingUserId)
          break
        }
        handleQueryMessage(payload as unknown as QueryMessage, { facade, logger })
          .then((result) => {
            const incomingUserId = (raw as Record<string, unknown>)?.userId as string | undefined
            relayClient.send('query_result', result as unknown as Record<string, unknown>, incomingUserId)
          })
          .catch((err: Error) => logger.error({ err }, 'Unhandled error in query handler'))
        break
      }

      default:
        logger.debug({ type }, 'Ignoring message on unknown type')
    }
  })

  // Step 07: Forward WDK events to relay for app consumption
  // v0.4.2: ApprovalFailed 추가 (13→14종). eventName 제거 — event.type이 source of truth.
  const RELAY_EVENTS = [
    'IntentProposed', 'PolicyEvaluated',
    'ExecutionBroadcasted', 'ExecutionSettled', 'ExecutionFailed',
    'TransactionSigned',
    'PendingPolicyRequested', 'ApprovalVerified', 'ApprovalRejected', 'PolicyApplied', 'SignerRevoked',
    'WalletCreated', 'WalletDeleted',
    'ApprovalFailed'
  ] as const

  if (facade) {
    for (const eventName of RELAY_EVENTS) {
      facade.on(eventName, (event: unknown) => {
        // v0.4.2: eventName 제거. event.type이 유일한 판별자.
        relayClient.send('control', { type: 'event_stream', event: event as Record<string, unknown> })
      })
    }
    logger.info({ eventCount: RELAY_EVENTS.length }, 'WDK event relay registered')
  }

  relayClient.on('connected', () => {
    logger.info('Relay connection established')
  })

  relayClient.on('disconnected', (code: number) => {
    logger.warn({ code }, 'Relay disconnected')
  })

  // v0.3.0: Daemon bootstrap — login with DAEMON_ID/SECRET to get JWT, then connect
  let relayHttpBase: string | undefined
  let relayToken: string | undefined
  if (config.relayUrl && config.daemonId && config.daemonSecret) {
    // RELAY_URL is the base URL (http://host:port). Derive HTTP and WS URLs.
    relayHttpBase = config.relayUrl.replace(/\/$/, '')
    const relayWsUrl = relayHttpBase.replace(/^http/, 'ws') + '/ws/daemon'

    // Retry loop: relay may not be ready at daemon boot time (Docker startup order)
    const MAX_RETRIES = 10
    const RETRY_DELAY_MS = 3000
    let connected = false
    for (let attempt = 1; attempt <= MAX_RETRIES && !connected; attempt++) {
      try {
        const token = await authenticateWithRelay(relayHttpBase, config.daemonId, config.daemonSecret, logger)
        relayToken = token

        // F29: Request enrollment code and display in terminal
        try {
          const enrollRes = await fetch(`${relayHttpBase}/api/auth/daemon/enroll`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
          })
          if (enrollRes.ok) {
            const { enrollmentCode, expiresIn } = await enrollRes.json() as { enrollmentCode: string, expiresIn: number }
            logger.info({ enrollmentCode, expiresIn }, 'Daemon enrollment code generated — enter this code in the WDK App')
          }
        } catch (err: unknown) {
          logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Could not request enrollment code')
        }

        relayClient.connect(relayWsUrl, token)
        connected = true
      } catch (err: unknown) {
        if (attempt < MAX_RETRIES) {
          logger.warn({ attempt, maxRetries: MAX_RETRIES, delayMs: RETRY_DELAY_MS }, 'Relay not ready, retrying...')
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
        } else {
          logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Daemon bootstrap failed after max retries — relay connection skipped')
        }
      }
    }
  } else if (config.relayUrl && config.relayToken) {
    // Legacy fallback: direct token (relayUrl must include /ws/daemon path)
    const legacyWsUrl = config.relayUrl.replace(/^http/, 'ws')
    const wsUrl = legacyWsUrl.includes('/ws') ? legacyWsUrl : legacyWsUrl + '/ws/daemon'
    relayClient.connect(wsUrl, config.relayToken)
  } else {
    logger.warn('RELAY_URL or DAEMON_ID/SECRET not set. Relay connection skipped.')
  }

  // 7. Start cron scheduler
  const cronDispatch: CronDispatch = async (cronId, sessionId, userId, prompt, chain) => {
    // Notify app that a cron session was created (for offline recovery)
    relayClient.send('control', {
      type: 'cron_session_created',
      sessionId,
      cronId,
      userId
    })

    queueManager.enqueue(sessionId, {
      sessionId,
      source: 'cron',
      userId,
      text: prompt,
      chain,
      cronId
    })
  }

  const cronScheduler = new CronScheduler(
    daemonStore, logger, cronDispatch,
    { tickIntervalMs: config.cronTickIntervalMs }
  )
  await cronScheduler.start()

  // 8a. Start Tool API HTTP server (for OpenClaw plugin)
  const toolApiServer = new ToolApiServer(
    { port: config.toolApiPort, token: config.toolApiToken },
    ctx, logger
  )
  await toolApiServer.start()

  // 8b. Start admin server
  const adminServer = new AdminServer(
    { socketPath: config.socketPath },
    { facade, cronScheduler, relayClient, logger, relayHttpBase, relayToken }
  )
  await adminServer.start()

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down daemon...')

    // Stop cron
    cronScheduler.stop()

    // Dispose message queue
    queueManager.dispose()

    // Disconnect relay
    relayClient.disconnect()

    // Stop servers
    await toolApiServer.stop()
    await adminServer.stop()

    // Dispose facade (also disposes internal store)
    if (facade && facade.dispose) {
      facade.dispose()
    }

    // Dispose daemon store
    await daemonStore.dispose()

    logger.info('Daemon stopped.')
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  logger.info({
    relayConnected: relayClient.connected,
    cronCount: cronScheduler.size,
    socketPath: config.socketPath
  }, 'WDK daemon running.')
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err: Error) => {
  const fallbackLogger = pino({ name: 'wdk-daemon' })
  fallbackLogger.fatal({ err }, 'Fatal error starting daemon')
  process.exit(1)
})
