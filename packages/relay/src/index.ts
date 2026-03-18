import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import config from './config.js'
import { RedisQueue } from './queue/redis-queue.js'
import { PgRegistry } from './registry/pg-registry.js'
import RateLimiter from './middleware/rate-limit.js'
import authRoutes from './routes/auth.js'
import wsRoutes from './routes/ws.js'
import pushRoutes from './routes/push.js'
import type { FastifyInstance } from 'fastify'

/**
 * Build and start the Relay Fastify server.
 *
 * Lifecycle:
 *   1. Initialize infrastructure (Redis, PostgreSQL)
 *   2. Decorate Fastify with shared instances (queue, registry)
 *   3. Register plugins and routes
 *   4. Start listening
 */
async function build (): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  })

  /* ----------------------------------------------------------------
   * Infrastructure
   * ----------------------------------------------------------------*/
  const queue = new RedisQueue()
  const registry = new PgRegistry()
  const rateLimiter = new RateLimiter()

  // Run schema migration (idempotent -- IF NOT EXISTS)
  await registry.migrate()

  /* ----------------------------------------------------------------
   * Decorate Fastify so route plugins can access shared instances
   * ----------------------------------------------------------------*/
  fastify.decorate('queue', queue)
  fastify.decorate('registry', registry)

  /* ----------------------------------------------------------------
   * Plugins
   * ----------------------------------------------------------------*/
  await fastify.register(websocket)

  /* ----------------------------------------------------------------
   * Global hooks
   * ----------------------------------------------------------------*/
  fastify.addHook('preHandler', rateLimiter.hook())

  /* ----------------------------------------------------------------
   * Health check
   * ----------------------------------------------------------------*/
  fastify.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }))

  /* ----------------------------------------------------------------
   * Routes
   * ----------------------------------------------------------------*/
  await fastify.register(authRoutes, { prefix: '/api' })
  await fastify.register(pushRoutes, { prefix: '/api' })
  await fastify.register(wsRoutes)

  /* ----------------------------------------------------------------
   * Graceful shutdown
   * ----------------------------------------------------------------*/
  const shutdown = async (signal: string): Promise<void> => {
    fastify.log.info({ signal }, 'Shutting down')
    rateLimiter.destroy()
    await fastify.close()
    await queue.close()
    await registry.close()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  return fastify
}

/* ------------------------------------------------------------------
 * Start
 * ----------------------------------------------------------------*/
const server = await build()

try {
  await server.listen({ port: config.port, host: config.host })
  server.log.info(`Relay server listening on ${config.host}:${config.port}`)
} catch (err) {
  server.log.fatal(err as Error)
  process.exit(1)
}
