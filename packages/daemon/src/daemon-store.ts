import type { CronInput, StoredCron } from '@wdk-app/guarded-wdk'

/**
 * Persistence interface for daemon-owned data.
 * Currently only cron scheduling. WDK data is accessed via facade.
 */
export interface DaemonStore {
  listCrons (accountIndex: number | null): Promise<StoredCron[]>
  saveCron (accountIndex: number, cron: CronInput): Promise<string>
  removeCron (cronId: string): Promise<void>
  updateCronLastRun (cronId: string, timestamp: number): Promise<void>
  init (): Promise<void>
  dispose (): Promise<void>
}
