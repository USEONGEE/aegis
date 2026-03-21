#!/usr/bin/env node

import pino from 'pino'
import { loadConfig } from './config.js'
import { initWDK } from './wdk-host.js'
import { createOpenClawClient } from './openclaw-client.js'
import { RelayClient } from './relay-client.js'
import { handleControlMessage } from './control-handler.js'
import type { PairingSession } from './control-handler.js'
import type { ControlMessage } from '@wdk-app/protocol'
import { handleChatMessage } from './chat-handler.js'
import { ExecutionJournal } from './execution-journal.js'
import { CronScheduler } from './cron-scheduler.js'
import type { CronDispatch } from './cron-scheduler.js'
import { AdminServer } from './admin-server.js'
import { MessageQueueManager } from './message-queue.js'
import type { QueuedMessage } from './message-queue.js'
import { _processChatDirect } from './chat-handler.js'
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

  // 2. Init WDK (load master seed -> store -> broker)
  const { wdk, broker, store } = await initWDK(config, logger)

  // 3. Init execution journal
  const journal = new ExecutionJournal(store, logger)
  await journal.recover()

  // 4. Create OpenClaw client
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
    wdk: wdk!,
    broker: broker!,
    store,
    logger,
    journal
  }

  // Pairing session state (populated when daemon starts pairing flow)
  const pairingSession: PairingSession | null = null

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

      await _processChatDirect(
        msg.userId,
        msg.sessionId,
        msg.text,
        openclawClient,
        relayClient,
        ctx,
        { maxIterations: config.toolCallMaxIterations },
        signal,
        msg.source
      )
    }
  )

  relayClient.onMessage((type, payload, raw) => {
    switch (type) {
      case 'control':
        // TODO: v0.2.9+ — wire JSON parse/validate 후 ControlMessage로 변환. 현재는 as cast.
        handleControlMessage(payload as ControlMessage, broker!, logger, relayClient, store, pairingSession, queueManager)
          .then((result) => {
            // v0.3.0: Forward control result with userId from incoming message
            const incomingUserId = (payload as any)?.userId
            relayClient.send('control', result, incomingUserId)
          })
          .catch((err: Error) => logger.error({ err }, 'Unhandled error in control handler'))
        break

      case 'chat':
        handleChatMessage(payload, openclawClient, relayClient, ctx, {
          maxIterations: config.toolCallMaxIterations
        }, queueManager)
          .catch((err: Error) => logger.error({ err }, 'Unhandled error in chat handler'))
        break

      default:
        logger.debug({ type }, 'Ignoring message on unknown type')
    }
  })

  // Step 07: Forward WDK events to relay for app consumption
  const RELAY_EVENTS = [
    'IntentProposed', 'PolicyEvaluated',
    'ExecutionBroadcasted', 'ExecutionSettled', 'ExecutionFailed',
    'TransactionSigned',
    'PendingPolicyRequested', 'ApprovalVerified', 'ApprovalRejected', 'PolicyApplied', 'SignerRevoked',
    'WalletCreated', 'WalletDeleted'
  ] as const

  if (wdk) {
    for (const eventName of RELAY_EVENTS) {
      wdk.on(eventName, (event: unknown) => {
        relayClient.send('control', { type: 'event_stream', eventName, event })
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
  if (config.relayUrl && config.daemonId && config.daemonSecret) {
    // RELAY_URL is the base URL (http://host:port). Derive HTTP and WS URLs.
    const relayHttpBase = config.relayUrl.replace(/\/$/, '')
    const relayWsUrl = relayHttpBase.replace(/^http/, 'ws') + '/ws/daemon'
    try {
      const loginRes = await fetch(`${relayHttpBase}/api/auth/daemon/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daemonId: config.daemonId, secret: config.daemonSecret }),
      })
      if (!loginRes.ok) {
        throw new Error(`Daemon login failed: ${loginRes.status} ${await loginRes.text()}`)
      }
      const { token } = await loginRes.json() as { token: string }
      logger.info({ daemonId: config.daemonId }, 'Daemon authenticated with relay')

      // F29: Request enrollment code and display in terminal
      try {
        const enrollRes = await fetch(`${relayHttpBase}/api/auth/daemon/enroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        })
        if (enrollRes.ok) {
          const { enrollmentCode, expiresIn } = await enrollRes.json() as { enrollmentCode: string, expiresIn: number }
          console.log('')
          console.log('╔══════════════════════════════════════════╗')
          console.log('║     DAEMON ENROLLMENT CODE               ║')
          console.log('║                                          ║')
          console.log(`║     ${enrollmentCode}                        ║`)
          console.log('║                                          ║')
          console.log(`║     Expires in ${expiresIn}s                      ║`)
          console.log('║     Enter this code in the WDK App       ║')
          console.log('╚══════════════════════════════════════════╝')
          console.log('')
        }
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Could not request enrollment code')
      }

      relayClient.connect(relayWsUrl, token)
    } catch (err: any) {
      logger.error({ err: err.message }, 'Daemon bootstrap failed — relay connection skipped')
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
  const cronDispatch: CronDispatch = async (cronId, sessionId, userId, prompt, chainId) => {
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
      chainId: chainId ?? undefined,
      cronId
    })
  }

  const cronScheduler = new CronScheduler(
    store, logger, cronDispatch,
    { tickIntervalMs: config.cronTickIntervalMs }
  )
  await cronScheduler.start()

  // 8. Start admin server
  const adminServer = new AdminServer(
    { socketPath: config.socketPath },
    { store, journal, cronScheduler, relayClient, logger }
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

    // Stop admin server
    await adminServer.stop()

    // Dispose WDK
    if (wdk && wdk.dispose) {
      wdk.dispose()
    }

    // Dispose store
    if (store && store.dispose) {
      await store.dispose()
    }

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
  // eslint-disable-next-line no-console
  console.error('Fatal error starting daemon:', err)
  process.exit(1)
})
