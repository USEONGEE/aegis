import type { Logger } from 'pino'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JournalEntry {
  intent_id: string
  target_hash: string
  status: string
  seed_id?: string
  chain?: string
  tx_hash?: string
}

export interface TrackMeta {
  seedId: string
  chain: string
  targetHash: string
}

export interface JournalListOptions {
  status?: string
  chain?: string
  limit?: number
  seedId?: string
}

interface ApprovalStore {
  listJournal (opts: JournalListOptions): Promise<JournalEntry[]>
  saveJournalEntry (entry: {
    intentId: string
    seedId: string
    chain: string
    targetHash: string
    status: string
  }): Promise<void>
  updateJournalStatus (intentId: string, status: string, txHash?: string): Promise<void>
}

/**
 * Execution Journal -- tracks intent lifecycle and prevents duplicate execution.
 *
 * Status flow: received -> evaluated -> approved -> broadcasted -> settled | failed
 *
 * The journal delegates persistence to the ApprovalStore but maintains an
 * in-memory index for fast duplicate detection (keyed by targetHash).
 */
export class ExecutionJournal {
  private _store: ApprovalStore
  private _seedId: string
  private _logger: Logger

  // In-memory index: targetHash -> intentId (for fast dedup)
  private _hashIndex: Map<string, string>

  // In-memory index: intentId -> status
  private _statusIndex: Map<string, string>

  constructor (store: ApprovalStore, seedId: string, logger: Logger) {
    this._store = store
    this._seedId = seedId
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
      const entries = await this._store.listJournal({ seedId: this._seedId })
      let recovered = 0

      for (const entry of entries) {
        const intentId = entry.intent_id
        const targetHash = entry.target_hash
        const status = entry.status

        this._statusIndex.set(intentId, status)

        // Only index non-terminal entries for dedup
        if (status !== 'settled' && status !== 'failed') {
          this._hashIndex.set(targetHash, intentId)
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
  async track (intentId: string, meta: TrackMeta): Promise<void> {
    const { seedId, chain, targetHash } = meta

    this._hashIndex.set(targetHash, intentId)
    this._statusIndex.set(intentId, 'received')

    try {
      await this._store.saveJournalEntry({
        intentId,
        seedId: seedId || this._seedId,
        chain,
        targetHash,
        status: 'received'
      })
    } catch (err) {
      this._logger.error({ err, intentId }, 'Failed to persist journal entry')
    }
  }

  /**
   * Update the status of a tracked intent.
   */
  async updateStatus (intentId: string, status: string, txHash?: string): Promise<void> {
    this._statusIndex.set(intentId, status)

    // Remove from hash index if terminal
    if (status === 'settled' || status === 'failed') {
      for (const [hash, id] of this._hashIndex) {
        if (id === intentId) {
          this._hashIndex.delete(hash)
          break
        }
      }
    }

    try {
      await this._store.updateJournalStatus(intentId, status, txHash)
    } catch (err) {
      this._logger.error({ err, intentId, status }, 'Failed to update journal status')
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
  getStatus (intentId: string): string | null {
    return this._statusIndex.get(intentId) || null
  }

  /**
   * Get the intent ID for a given target hash (if in-flight).
   */
  getIntentByHash (targetHash: string): string | null {
    return this._hashIndex.get(targetHash) || null
  }

  /**
   * List all journal entries (delegates to store).
   */
  async list (opts: JournalListOptions = {}): Promise<JournalEntry[]> {
    return this._store.listJournal({ seedId: this._seedId, ...opts })
  }

  /**
   * Get total count of in-flight (non-terminal) intents.
   */
  get activeCount (): number {
    return this._hashIndex.size
  }
}
