import Redis from 'ioredis'
import { QueueAdapter } from './queue-adapter.js'
import type { StreamEntry } from './queue-adapter.js'
import config from '../config.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RedisQueueOptions {
  url?: string
}

/**
 * Redis Streams implementation of QueueAdapter.
 *
 * Queue key conventions:
 *   control:{userId}                 - user-scoped control channel
 *   chat:{userId}:{sessionId}        - session-scoped chat queue
 *   online:{userId}                  - daemon heartbeat key with TTL
 */
export class RedisQueue extends QueueAdapter {
  redis: Redis
  blockingRedis: Redis

  constructor (opts: RedisQueueOptions = {}) {
    super()
    const url = opts.url || config.redis.url
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy (times: number): number {
        return Math.min(times * 200, 5000)
      },
    })

    // Separate connection for blocking reads (XREAD BLOCK shares nothing with
    // the writer connection to avoid head-of-line blocking).
    this.blockingRedis = new Redis(url, {
      maxRetriesPerRequest: null as unknown as number, // allow indefinite retry for blocking reads
      retryStrategy (times: number): number {
        return Math.min(times * 200, 5000)
      },
    })
  }

  /* ------------------------------------------------------------------
   * publish
   * ----------------------------------------------------------------*/

  /**
   * XADD a message to a stream.  Automatically trims to `streamMaxLen`.
   */
  async publish (stream: string, message: Record<string, string>): Promise<string> {
    const fields: string[] = []
    for (const [k, v] of Object.entries(message)) {
      fields.push(k, String(v))
    }

    const id = await this.redis.xadd(
      stream,
      'MAXLEN',
      '~',
      config.streamMaxLen,
      '*',
      ...fields,
    )
    return id
  }

  /* ------------------------------------------------------------------
   * consume
   * ----------------------------------------------------------------*/

  /**
   * XREAD from a stream (optionally blocking).
   */
  async consume (stream: string, lastId: string, count: number = 10): Promise<StreamEntry[]> {
    const result = await this.blockingRedis.xread(
      'COUNT',
      count,
      'BLOCK',
      config.streamBlockMs,
      'STREAMS',
      stream,
      lastId,
    )

    if (!result) return []

    // result: [ [ streamKey, [ [id, [f1,v1,f2,v2,...]], ... ] ] ]
    const entries = result[0][1] as Array<[string, string[]]>
    return entries.map(([id, fields]) => ({
      id,
      data: RedisQueue._fieldsToObject(fields),
    }))
  }

  /* ------------------------------------------------------------------
   * readRange  (non-blocking XRANGE)
   * ----------------------------------------------------------------*/

  /**
   * XRANGE — non-blocking read of entries between start and end (inclusive).
   * Limited to `count` entries (default 1000). Does NOT paginate — intentional product limit for backfill.
   */
  async readRange (stream: string, start: string, end: string, count: number = 1000): Promise<StreamEntry[]> {
    const result = await this.redis.xrange(stream, start, end, 'COUNT', count)
    // result: [ [id, [f1,v1,f2,v2,...]], ... ]
    return result.map(([id, fields]: [string, string[]]) => ({
      id,
      data: RedisQueue._fieldsToObject(fields),
    }))
  }

  /* ------------------------------------------------------------------
   * ack  (consumer-group)
   * ----------------------------------------------------------------*/

  /**
   * XACK an entry within a consumer group.
   */
  async ack (stream: string, group: string, id: string): Promise<void> {
    await this.redis.xack(stream, group, id)
  }

  /* ------------------------------------------------------------------
   * heartbeat helpers
   * ----------------------------------------------------------------*/

  /** SET key EX ttl value */
  async setWithTtl (key: string, ttl: number, value: string = '1'): Promise<void> {
    await this.redis.set(key, value, 'EX', ttl)
  }

  /** EXISTS key */
  async exists (key: string): Promise<boolean> {
    const res = await this.redis.exists(key)
    return res === 1
  }

  /* ------------------------------------------------------------------
   * trim
   * ----------------------------------------------------------------*/

  /** XTRIM stream MAXLEN ~ maxLen */
  async trim (stream: string, maxLen: number): Promise<void> {
    await this.redis.xtrim(stream, 'MAXLEN', '~', maxLen)
  }

  /* ------------------------------------------------------------------
   * Utility: create consumer group (idempotent)
   * ----------------------------------------------------------------*/

  /**
   * Ensure a consumer group exists on a stream.
   * Creates the stream implicitly via MKSTREAM.
   */
  async ensureGroup (stream: string, group: string, startId: string = '0'): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', stream, group, startId, 'MKSTREAM')
    } catch (err: unknown) {
      // BUSYGROUP = group already exists -- safe to ignore.
      if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err
    }
  }

  /**
   * XREADGROUP -- consume as part of a consumer group.
   */
  async consumeGroup (stream: string, group: string, consumer: string, count: number = 10): Promise<StreamEntry[]> {
    const result = await this.blockingRedis.xreadgroup(
      'GROUP',
      group,
      consumer,
      'COUNT',
      count,
      'BLOCK',
      config.streamBlockMs,
      'STREAMS',
      stream,
      '>',
    )

    if (!result) return []

    const entries = result[0][1] as Array<[string, string[]]>
    return entries.map(([id, fields]) => ({
      id,
      data: RedisQueue._fieldsToObject(fields),
    }))
  }

  /* ------------------------------------------------------------------
   * close
   * ----------------------------------------------------------------*/

  async close (): Promise<void> {
    this.blockingRedis.disconnect()
    this.redis.disconnect()
  }

  /* ------------------------------------------------------------------
   * Internal helpers
   * ----------------------------------------------------------------*/

  /**
   * Convert a flat field array [f1, v1, f2, v2, ...] to an object.
   */
  static _fieldsToObject (fields: string[]): Record<string, string> {
    const obj: Record<string, string> = {}
    for (let i = 0; i < fields.length; i += 2) {
      obj[fields[i]] = fields[i + 1]
    }
    return obj
  }
}
