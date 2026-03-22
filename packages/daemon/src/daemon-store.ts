// ---------------------------------------------------------------------------
// Cron types — daemon-owned, not imported from guarded-wdk
// ---------------------------------------------------------------------------

export type ChainScope =
  | { kind: 'specific'; chainId: number }
  | { kind: 'all' }

export interface CronInput {
  sessionId: string
  interval: string
  prompt: string
  chain: ChainScope
}

export interface StoredCron extends CronInput {
  id: string
  accountIndex: number
  createdAt: number
  lastRunAt: number | null
  isActive: boolean
}

export interface CronFilter {
  accountIndex?: number
}

/**
 * Persistence interface for daemon-owned data.
 * Currently only cron scheduling. WDK data is accessed via facade.
 */
export interface DaemonStore {
  listCrons (filter: CronFilter): Promise<StoredCron[]>
  saveCron (accountIndex: number, cron: CronInput): Promise<string>
  removeCron (cronId: string): Promise<void>
  updateCronLastRun (cronId: string, timestamp: number): Promise<void>
  init (): Promise<void>
  dispose (): Promise<void>
}
