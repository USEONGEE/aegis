import type { Logger } from 'pino'
import type { JournalStatus } from '@wdk-app/guarded-wdk'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JournalEntry {
  intentHash: string
  targetHash: string
  status: JournalStatus
  accountIndex: number
  chainId: number
  txHash: string | null
}

export interface TrackMeta {
  accountIndex: number
  chainId: number
  targetHash: string
}

export interface JournalListOptions {
  status?: JournalStatus
  chainId?: number
  limit?: number
  accountIndex?: number
}

interface ApprovalStore {
  listJournal (opts: JournalListOptions): Promise<JournalEntry[]>
  saveJournalEntry (entry: {
    intentHash: string
    accountIndex: number
    chainId: number
    targetHash: string
    status: JournalStatus
  }): Promise<void>
  updateJournalStatus (intentHash: string, status: JournalStatus, txHash: string | null): Promise<void>
}

/**
 * Execution Journal -- tracks intent lifecycle and prevents duplicate execution.
 *
 * Possible statuses: received, settled, signed, failed, rejected
 * Typical flows:
 *   received -> settled                          (allowed tx)
 *   received -> rejected                         (policy rejected)
 *   received -> signed                           (allowed sign)
 *   any -> failed                                (error at any stage)
 *
 * The journal delegates persistence to the ApprovalStore but maintains an
 * in-memory index for fast duplicate detection (keyed by targetHash).
 */
export class ExecutionJournal {
  private _store: ApprovalStore
  private _logger: Logger

  // In-memory index: targetHash -> intentHash (for fast dedup)
  private _hashIndex: Map<string, string>

  // In-memory index: intentHash -> status
  private _statusIndex: Map<string, JournalStatus>

  constructor (store: ApprovalStore, logger: Logger) {
    this._store = store
    this._logger = logger

    this._hashIndex = new Map()
    this._statusIndex = new Map()
  }

  /**
   * Recover state from the store on startup.
   * Loads all non-terminal journal entries and rebuilds the in-memory index.
   */
  async recover (): Promise<void> {
    try {
      const entries = await this._store.listJournal({})
      let recovered = 0

      for (const entry of entries) {
        const intentHash = entry.intentHash
        const targetHash = entry.targetHash
        const status = entry.status

        this._statusIndex.set(intentHash, status)

        // Only index non-terminal entries for dedup
        if (status !== 'settled' && status !== 'failed' && status !== 'signed' && status !== 'rejected') {
          this._hashIndex.set(targetHash, intentHash)
          recovered++
        }
      }

      this._logger.info({ total: entries.length, active: recovered }, 'Journal recovered from store')
    } catch (err) {
      this._logger.error({ err }, 'Failed to recover journal from store')
    }
  }

  /**
   * Track a new intent. Records it with status 'received'.
   */
  async track (intentHash: string, meta: TrackMeta): Promise<void> {
    const { accountIndex, chainId, targetHash } = meta

    this._hashIndex.set(targetHash, intentHash)
    this._statusIndex.set(intentHash, 'received')

    try {
      await this._store.saveJournalEntry({
        intentHash,
        accountIndex,
        chainId,
        targetHash,
        status: 'received'
      })
    } catch (err) {
      this._logger.error({ err, intentHash }, 'Failed to persist journal entry')
    }
  }

  /**
   * Update the status of a tracked intent.
   */
  async updateStatus (intentHash: string, status: JournalStatus, txHash: string | null = null): Promise<void> {
    this._statusIndex.set(intentHash, status)

    // Remove from hash index if terminal
    if (status === 'settled' || status === 'failed' || status === 'signed' || status === 'rejected') {
      for (const [hash, id] of this._hashIndex) {
        if (id === intentHash) {
          this._hashIndex.delete(hash)
          break
        }
      }
    }

    try {
      await this._store.updateJournalStatus(intentHash, status, txHash)
    } catch (err) {
      this._logger.error({ err, intentHash, status }, 'Failed to update journal status')
    }
  }

  /**
   * Check if a targetHash has already been submitted and is still in-flight.
   */
  isDuplicate (targetHash: string): boolean {
    return this._hashIndex.has(targetHash)
  }

  /**
   * Get the status of an intent.
   */
  getStatus (intentHash: string): JournalStatus | null {
    return this._statusIndex.get(intentHash) || null
  }

  /**
   * Get the intent hash for a given target hash (if in-flight).
   */
  getIntentByHash (targetHash: string): string | null {
    return this._hashIndex.get(targetHash) || null
  }

  /**
   * List all journal entries (delegates to store).
   */
  async list (opts: JournalListOptions = {}): Promise<JournalEntry[]> {
    return this._store.listJournal(opts)
  }

  /**
   * Get total count of in-flight (non-terminal) intents.
   */
  get activeCount (): number {
    return this._hashIndex.size
  }
}
