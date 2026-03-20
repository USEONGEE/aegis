#!/usr/bin/env node

import pino from 'pino'
import { loadConfig } from './config.js'
import { initWDK } from './wdk-host.js'
import { createOpenClawClient } from './openclaw-client.js'
import { RelayClient } from './relay-client.js'
import { handleControlMessage } from './control-handler.js'
import type { PairingSession } from './control-handler.js'
import { handleChatMessage } from './chat-handler.js'
import { ExecutionJournal } from './execution-journal.js'
import { CronScheduler } from './cron-scheduler.js'
import { AdminServer } from './admin-server.js'
import { MessageQueueManager } from './message-queue.js'
import type { QueuedMessage } from './message-queue.js'
import { _processChatDirect } from './chat-handler.js'
import type { WDKContext } from './tool-surface.js'

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

  // 6. Build WDK context (passed to tool execution)
  // relayClient is included so tool-surface can send follow-up messages
  // (e.g., control results after tx execution)
  const wdkContext: WDKContext = {
    wdk: wdk!,
    broker,
    store,
    logger,
    journal,
    relayClient
  }

  // Pairing session state (populated when daemon starts pairing flow)
  const pairingSession: PairingSession | null = null

  // 6b. Create FIFO message queue manager
  const queueManager = new MessageQueueManager(
    async (msg: QueuedMessage, signal: AbortSignal) => {
      await _processChatDirect(
        msg.userId,
        msg.sessionId,
        msg.text,
        openclawClient,
        relayClient,
        wdkContext,
        { maxIterations: config.toolCallMaxIterations },
        signal
      )
    }
  )

  relayClient.onMessage((type, payload, raw) => {
    switch (type) {
      case 'control':
        handleControlMessage(payload, broker!, logger, relayClient, store, pairingSession, queueManager)
          .then((result) => {
            // Forward control result to app via relay (preserving the result's own type)
            relayClient.send('control', result)
          })
          .catch((err: Error) => logger.error({ err }, 'Unhandled error in control handler'))
        break

      case 'chat':
        handleChatMessage(payload, openclawClient, relayClient, wdkContext, {
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

  if (config.relayUrl && config.relayToken) {
    relayClient.connect(config.relayUrl, config.relayToken)
  } else {
    logger.warn('RELAY_URL or RELAY_TOKEN not set. Relay connection skipped.')
  }

  // 7. Start cron scheduler
  const cronScheduler = new CronScheduler(
    store, wdkContext, openclawClient, logger,
    { tickIntervalMs: config.cronTickIntervalMs, queueManager }
  )
  await cronScheduler.start()

  // 8. Start admin server
  const adminServer = new AdminServer({
    socketPath: config.socketPath,
    store,
    journal,
    cronScheduler,
    relayClient,
    wdkContext,
    logger
  })
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
