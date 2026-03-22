import config from '../config.js'
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RateLimitOptions {
  max?: number
  windowMs?: number
}

interface RateLimitCheckResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

type KeyFunction = (req: FastifyRequest) => string

/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Tracks request timestamps per key (typically IP or userId).
 * Periodically prunes expired entries to bound memory.
 *
 * For production with multiple relay instances, replace with a Redis-backed
 * limiter (e.g. sliding-window counter with INCR + PEXPIRE).
 */
class RateLimiter {
  max: number
  windowMs: number

  private _store: Map<string, number[]>
  private _pruneInterval: ReturnType<typeof setInterval>

  constructor (opts: RateLimitOptions = {}) {
    this.max = opts.max ?? config.rateLimitMax
    this.windowMs = opts.windowMs ?? config.rateLimitWindowMs

    this._store = new Map()

    // Prune stale keys every 60s
    this._pruneInterval = setInterval(() => this._prune(), 60_000)
    this._pruneInterval.unref()
  }

  /**
   * Check whether a request from `key` is allowed.
   */
  check (key: string): RateLimitCheckResult {
    const now = Date.now()
    const windowStart = now - this.windowMs

    let timestamps = this._store.get(key)
    if (!timestamps) {
      timestamps = []
      this._store.set(key, timestamps)
    }

    // Drop timestamps outside the current window
    while (timestamps.length > 0 && timestamps[0] <= windowStart) {
      timestamps.shift()
    }

    if (timestamps.length >= this.max) {
      const retryAfterMs = timestamps[0] + this.windowMs - now
      return { allowed: false, remaining: 0, retryAfterMs }
    }

    timestamps.push(now)
    return {
      allowed: true,
      remaining: this.max - timestamps.length,
      retryAfterMs: 0,
    }
  }

  /**
   * Fastify preHandler hook factory.
   *
   * Extracts the rate-limit key from the request IP by default.
   * Attach as: `fastify.addHook('preHandler', rateLimiter.hook())`
   */
  hook (keyFn?: KeyFunction): (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => void {
    const getKey: KeyFunction = keyFn || ((req: FastifyRequest) => req.ip)

    return (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction): void => {
      const key = getKey(request)
      const { allowed, remaining, retryAfterMs } = this.check(key)

      reply.header('X-RateLimit-Limit', this.max)
      reply.header('X-RateLimit-Remaining', remaining)

      if (!allowed) {
        reply.header('Retry-After', Math.ceil(retryAfterMs / 1000))
        reply
          .code(429)
          .send({ error: 'Too Many Requests', retryAfterMs })
        return
      }

      done()
    }
  }

  /** Remove keys whose entire window has expired. */
  private _prune (): void {
    const cutoff = Date.now() - this.windowMs
    for (const [key, timestamps] of this._store) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) {
        this._store.delete(key)
      }
    }
  }

  destroy (): void {
    clearInterval(this._pruneInterval)
    this._store.clear()
  }
}

export default RateLimiter
