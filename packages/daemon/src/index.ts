#!/usr/bin/env node

import pino from 'pino'
import { loadConfig } from './config.js'
import { initWDK } from './wdk-host.js'
import { createOpenClawClient } from './openclaw-client.js'
import { RelayClient } from './relay-client.js'
import { handleControlMessage } from './control-handler.js'
import { handleChatMessage } from './chat-handler.js'
import { ExecutionJournal } from './execution-journal.js'
import { CronScheduler } from './cron-scheduler.js'
import { AdminServer } from './admin-server.js'
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

  // 2. Init WDK (load seed -> store -> broker)
  const { wdk, account, broker, store, seedId } = await initWDK(config, logger)

  // 3. Init execution journal
  let journal: ExecutionJournal | null = null
  if (seedId) {
    journal = new ExecutionJournal(store, seedId, logger)
    await journal.recover()
  }

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
  // (e.g., approval_result after a pending_approval tx completes)
  const wdkContext: WDKContext = {
    wdk: wdk!,
    account,
    broker,
    store,
    seedId: seedId!,
    logger,
    journal,
    relayClient
  }

  relayClient.onMessage((type, payload, raw) => {
    switch (type) {
      case 'control':
        handleControlMessage(payload, broker!, logger, wdk, relayClient)
          .catch((err: Error) => logger.error({ err }, 'Unhandled error in control handler'))
        break

      case 'chat':
        handleChatMessage(payload, openclawClient, relayClient, wdkContext, {
          maxIterations: config.toolCallMaxIterations
        })
          .catch((err: Error) => logger.error({ err }, 'Unhandled error in chat handler'))
        break

      default:
        logger.debug({ type }, 'Ignoring message on unknown type')
    }
  })

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
  let cronScheduler: CronScheduler | null = null
  if (seedId) {
    cronScheduler = new CronScheduler(
      store, seedId, wdkContext, openclawClient, logger,
      { tickIntervalMs: config.cronTickIntervalMs }
    )
    await cronScheduler.start()
  }

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
    if (cronScheduler) cronScheduler.stop()

    // Disconnect relay
    relayClient.disconnect()

    // Stop admin server
    await adminServer.stop()

    // Dispose WDK
    if (wdk && wdk.dispose) {
      wdk.dispose()
    }

    // Dispose store
    if (store && (store as any).dispose) {
      await (store as any).dispose()
    }

    logger.info('Daemon stopped.')
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  logger.info({
    seedId,
    relayConnected: relayClient.connected,
    cronCount: cronScheduler?.size || 0,
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
