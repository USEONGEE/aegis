import { processChat } from './tool-call-loop.js'
import type { WDKContext } from './tool-surface.js'
import type { OpenClawClient } from './openclaw-client.js'
import type { Logger } from 'pino'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CronEntry {
  id: string
  sessionId: string
  interval: string
  intervalMs: number
  prompt: string
  chain: string
  lastRunAt: number
}

export interface CronRegistration {
  id: string
  sessionId: string
  interval: string
  prompt: string
  chain: string
}

export interface CronListItem {
  id: string
  sessionId: string
  interval: string
  prompt: string
  chain: string
  lastRunAt: number
}

interface CronStore {
  listCrons (seedId: string): Promise<any[]>
  removeCron (cronId: string): Promise<void>
  updateCronLastRun (cronId: string, timestamp: number): Promise<void>
}

export interface CronSchedulerOptions {
  tickIntervalMs?: number
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
  private _seedId: string
  private _wdkContext: WDKContext
  private _openclawClient: OpenClawClient
  private _logger: Logger
  private _tickIntervalMs: number

  // In-memory cache of active crons
  private _crons: Map<string, CronEntry>
  private _timer: ReturnType<typeof setInterval> | null
  private _running: boolean

  constructor (
    store: CronStore,
    seedId: string,
    wdkContext: WDKContext,
    openclawClient: OpenClawClient,
    logger: Logger,
    opts: CronSchedulerOptions = {}
  ) {
    this._store = store
    this._seedId = seedId
    this._wdkContext = wdkContext
    this._openclawClient = openclawClient
    this._logger = logger
    this._tickIntervalMs = opts.tickIntervalMs || 60000

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
    const crons = await this._store.listCrons(this._seedId)
    for (const cron of crons) {
      if (cron.is_active) {
        this._crons.set(cron.id, {
          id: cron.id,
          sessionId: cron.session_id,
          interval: cron.interval,
          intervalMs: parseInterval(cron.interval),
          prompt: cron.prompt,
          chain: cron.chain,
          lastRunAt: cron.last_run_at || 0
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
      chain: cron.chain,
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

        // Run the prompt through OpenClaw
        const userId = `cron:${cronId}`
        const result = await processChat(
          userId,
          cron.sessionId,
          cron.prompt,
          this._wdkContext,
          this._openclawClient,
          { maxIterations: 10 }
        )

        this._logger.info(
          { cronId, iterations: result.iterations, tools: result.toolResults.length },
          'Cron execution completed'
        )
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
        chain: cron.chain,
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
