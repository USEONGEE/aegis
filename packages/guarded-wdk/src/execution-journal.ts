import type { JournalStatus, JournalInput, StoredJournal, JournalQueryOpts } from './wdk-store.js'

// ---------------------------------------------------------------------------
// Logger interface (pino-free)
// ---------------------------------------------------------------------------

interface JournalLogger {
  info (obj: Record<string, unknown>, msg: string): void
  error (obj: Record<string, unknown>, msg: string): void
}

// ---------------------------------------------------------------------------
// Store interface (subset of WdkStore used by journal)
// ---------------------------------------------------------------------------

interface JournalStore {
  listJournal (opts: JournalQueryOpts): Promise<StoredJournal[]>
  saveJournalEntry (entry: JournalInput): Promise<void>
  updateJournalStatus (intentHash: string, status: JournalStatus, txHash: string | null): Promise<void>
}

// ---------------------------------------------------------------------------
// Track meta
// ---------------------------------------------------------------------------

interface TrackMeta {
  accountIndex: number
  chainId: number
  dedupKey: string
}

/**
 * Execution Journal -- tracks intent lifecycle and prevents duplicate execution.
 *
 * Possible statuses: received, settled, signed, failed, rejected
 * Typical flows:
 *   received -> settled    (allowed tx)
 *   received -> rejected   (policy rejected)
 *   received -> signed     (allowed sign)
 *   any -> failed          (error at any stage)
 *
 * Maintains an in-memory index for fast duplicate detection (keyed by dedupKey).
 */
export class ExecutionJournal {
  private _store: JournalStore
  private _logger: JournalLogger | null

  // In-memory index: dedupKey -> intentHash (for fast dedup)
  private _dedupIndex: Map<string, string>

  // In-memory index: intentHash -> status
  private _statusIndex: Map<string, JournalStatus>

  constructor (store: JournalStore, logger: JournalLogger | null = null) {
    this._store = store
    this._logger = logger

    this._dedupIndex = new Map()
    this._statusIndex = new Map()
  }

  /**
   * Recover state from the store on startup.
   * Loads all journal entries and rebuilds the in-memory index.
   */
  async recover (): Promise<void> {
    try {
      const entries = await this._store.listJournal({})
      let recovered = 0

      for (const entry of entries) {
        const intentHash = entry.intentHash
        const dedupKey = entry.dedupKey
        const status = entry.status

        this._statusIndex.set(intentHash, status)

        // Only index non-terminal entries for dedup
        if (status !== 'settled' && status !== 'failed' && status !== 'signed' && status !== 'rejected') {
          this._dedupIndex.set(dedupKey, intentHash)
          recovered++
        }
      }

      this._logger?.info({ total: entries.length, active: recovered }, 'Journal recovered from store')
    } catch (err) {
      this._logger?.error({ err }, 'Failed to recover journal from store')
    }
  }

  /**
   * Track a new intent. Records it with status 'received'.
   */
  async track (intentHash: string, meta: TrackMeta): Promise<void> {
    const { accountIndex, chainId, dedupKey } = meta

    this._dedupIndex.set(dedupKey, intentHash)
    this._statusIndex.set(intentHash, 'received')

    try {
      await this._store.saveJournalEntry({
        intentHash,
        accountIndex,
        chainId,
        dedupKey,
        status: 'received'
      })
    } catch (err) {
      this._logger?.error({ err, intentHash }, 'Failed to persist journal entry')
    }
  }

  /**
   * Update the status of a tracked intent.
   */
  async updateStatus (intentHash: string, status: JournalStatus, txHash: string | null = null): Promise<void> {
    this._statusIndex.set(intentHash, status)

    // Remove from dedup index if terminal
    if (status === 'settled' || status === 'failed' || status === 'signed' || status === 'rejected') {
      for (const [key, id] of this._dedupIndex) {
        if (id === intentHash) {
          this._dedupIndex.delete(key)
          break
        }
      }
    }

    try {
      await this._store.updateJournalStatus(intentHash, status, txHash)
    } catch (err) {
      this._logger?.error({ err, intentHash, status }, 'Failed to update journal status')
    }
  }

  /**
   * Check if a dedupKey has already been submitted and is still in-flight.
   */
  isDuplicate (dedupKey: string): boolean {
    return this._dedupIndex.has(dedupKey)
  }

  /**
   * Get the status of an intent.
   */
  getStatus (intentHash: string): JournalStatus | null {
    return this._statusIndex.get(intentHash) || null
  }

  /**
   * Get total count of in-flight (non-terminal) intents.
   */
  get activeCount (): number {
    return this._dedupIndex.size
  }
}
