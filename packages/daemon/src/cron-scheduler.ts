import type { Logger } from 'pino'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CronBase {
  id: string
  sessionId: string
  interval: string
  prompt: string
  chainId: number | null
  accountIndex: number
}

export interface CronEntry extends CronBase {
  intervalMs: number
  lastRunAt: number
}

export type CronRegistration = CronBase

export interface CronListItem extends CronBase {
  lastRunAt: number
}

export type CronDispatch = (
  cronId: string,
  sessionId: string,
  userId: string,
  prompt: string,
  chainId: number | null
) => Promise<void>

interface CronStore {
  listCrons (accountIndex?: number): Promise<Array<{ id: string; accountIndex: number; sessionId: string; interval: string; prompt: string; chainId: number | null; createdAt: number; lastRunAt: number | null; isActive: boolean }>>
  removeCron (cronId: string): Promise<void>
  updateCronLastRun (cronId: string, timestamp: number): Promise<void>
}

export interface CronSchedulerConfig {
  tickIntervalMs: number
}

/**
 * Cron scheduler -- registers, persists, and executes periodic prompts.
 *
 * Intervals are simplified: supports duration strings (e.g. "5m", "1h", "30s")
 * or cron expressions. For v0.1, only duration strings are interpreted.
 *
 * On each tick(), the scheduler checks which crons are due and runs their
 * prompts through the OpenClaw tool-call loop.
 */
export class CronScheduler {
  private _store: CronStore
  private _logger: Logger
  private _dispatch: CronDispatch
  private _tickIntervalMs: number

  // In-memory cache of active crons
  private _crons: Map<string, CronEntry>
  private _timer: ReturnType<typeof setInterval> | null
  private _running: boolean

  constructor (
    store: CronStore,
    logger: Logger,
    dispatch: CronDispatch,
    config: CronSchedulerConfig
  ) {
    this._store = store
    this._logger = logger
    this._dispatch = dispatch
    this._tickIntervalMs = config.tickIntervalMs

    this._crons = new Map()
    this._timer = null
    this._running = false
  }

  /**
   * Load crons from store and start the tick timer.
   */
  async start (): Promise<void> {
    if (this._running) return

    // Load existing crons from store
    const crons = await this._store.listCrons()
    for (const cron of crons) {
      if (cron.isActive) {
        this._crons.set(cron.id, {
          id: cron.id,
          sessionId: cron.sessionId,
          interval: cron.interval,
          intervalMs: parseInterval(cron.interval),
          prompt: cron.prompt,
          chainId: cron.chainId,
          accountIndex: cron.accountIndex,
          lastRunAt: cron.lastRunAt || 0
        })
      }
    }

    this._running = true
    this._timer = setInterval(() => this.tick(), this._tickIntervalMs)
    this._logger.info({ cronCount: this._crons.size, tickMs: this._tickIntervalMs }, 'Cron scheduler started')
  }

  /**
   * Stop the tick timer.
   */
  stop (): void {
    this._running = false
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
    this._logger.info('Cron scheduler stopped')
  }

  /**
   * Register a new cron job.
   */
  async register (cron: CronRegistration): Promise<void> {
    const entry: CronEntry = {
      id: cron.id,
      sessionId: cron.sessionId,
      interval: cron.interval,
      intervalMs: parseInterval(cron.interval),
      prompt: cron.prompt,
      chainId: cron.chainId,
      accountIndex: cron.accountIndex,
      lastRunAt: 0
    }

    this._crons.set(cron.id, entry)
    this._logger.info({ cronId: cron.id, interval: cron.interval }, 'Cron registered')
  }

  /**
   * Remove a cron job.
   */
  async remove (cronId: string): Promise<void> {
    this._crons.delete(cronId)
    await this._store.removeCron(cronId)
    this._logger.info({ cronId }, 'Cron removed')
  }

  /**
   * Check each registered cron and execute any that are due.
   * Called on every tick interval.
   */
  async tick (): Promise<void> {
    const now = Date.now()

    for (const [cronId, cron] of this._crons) {
      const elapsed = now - cron.lastRunAt
      if (elapsed < cron.intervalMs) continue

      this._logger.info({ cronId, prompt: cron.prompt.slice(0, 80) }, 'Cron triggered')

      // Mark as running before async work
      cron.lastRunAt = now

      try {
        // Update last_run_at in store
        await this._store.updateCronLastRun(cronId, now)

        const userId = `cron:${cronId}`

        await this._dispatch(cronId, cron.sessionId, userId, cron.prompt, cron.chainId)
        this._logger.info({ cronId }, 'Cron dispatched')
      } catch (err) {
        this._logger.error({ err, cronId }, 'Cron execution failed')
      }
    }
  }

  /**
   * List all registered crons.
   */
  list (): CronListItem[] {
    const result: CronListItem[] = []
    for (const cron of this._crons.values()) {
      result.push({
        id: cron.id,
        sessionId: cron.sessionId,
        interval: cron.interval,
        prompt: cron.prompt,
        chainId: cron.chainId,
        accountIndex: cron.accountIndex,
        lastRunAt: cron.lastRunAt
      })
    }
    return result
  }

  /**
   * Number of registered crons.
   */
  get size (): number {
    return this._crons.size
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a duration string into milliseconds.
 *
 * Supported formats:
 *   "30s" -> 30000
 *   "5m"  -> 300000
 *   "1h"  -> 3600000
 *   "1d"  -> 86400000
 *   "300000" -> 300000 (raw ms)
 *
 * Falls back to 60000 (1 minute) for unrecognised formats.
 */
function parseInterval (interval: string | number): number {
  if (typeof interval === 'number') return interval

  const str = String(interval).trim().toLowerCase()

  // Raw milliseconds
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10)
  }

  const match = str.match(/^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d|day)s?$/)
  if (match) {
    const num = parseFloat(match[1])
    const unit = match[2]

    switch (unit) {
      case 's':
      case 'sec':
        return Math.round(num * 1000)
      case 'm':
      case 'min':
        return Math.round(num * 60 * 1000)
      case 'h':
      case 'hr':
        return Math.round(num * 60 * 60 * 1000)
      case 'd':
      case 'day':
        return Math.round(num * 24 * 60 * 60 * 1000)
    }
  }

  // Default: 1 minute
  return 60000
}
