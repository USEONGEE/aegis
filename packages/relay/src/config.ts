// ---------------------------------------------------------------------------
// Relay server configuration types
// ---------------------------------------------------------------------------

interface RelayConfig {
  port: number
  host: string

  redis: {
    url: string
  }

  database: {
    url: string
  }

  jwt: {
    secret: string
    expiresIn: string
  }

  /** Daemon heartbeat TTL in seconds */
  heartbeatTtl: number

  /** Redis Stream XREAD block timeout in milliseconds */
  streamBlockMs: number

  /** Redis Stream XTRIM max length (approximate) */
  streamMaxLen: number

  /** Rate limit: max requests per window */
  rateLimitMax: number

  /** Rate limit: window duration in milliseconds */
  rateLimitWindowMs: number
}

const config: RelayConfig = {
  port: parseInt(process.env.PORT as string, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  database: {
    url: process.env.DATABASE_URL || 'postgresql://wdk:wdk@localhost:5432/wdk_relay',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  heartbeatTtl: parseInt(process.env.HEARTBEAT_TTL as string, 10) || 30,
  streamBlockMs: parseInt(process.env.STREAM_BLOCK_MS as string, 10) || 5000,
  streamMaxLen: parseInt(process.env.STREAM_MAX_LEN as string, 10) || 10000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX as string, 10) || 100,
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS as string, 10) || 60000,
}

export default config
