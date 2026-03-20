import { jest } from '@jest/globals'
import { ExecutionJournal } from '../src/execution-journal.js'
import type { JournalStatus } from '@wdk-app/guarded-wdk'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockLogger (): any {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}

function createMockStore (): any {
  return {
    listJournal: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    saveJournalEntry: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    updateJournalStatus: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExecutionJournal', () => {
  describe('rejected is non-terminal', () => {
    it('keeps targetHash in hash index after rejected status', async () => {
      const store = createMockStore()
      const logger = createMockLogger()
      const journal = new ExecutionJournal(store, logger)

      const intentHash = 'intent-1'
      const targetHash = '0xabc'

      // Track a new intent
      await journal.track(intentHash, { accountIndex: 0, chainId: 1, targetHash })
      expect(journal.isDuplicate(targetHash)).toBe(true)

      // Update to rejected
      await journal.updateStatus(intentHash, 'rejected')

      // rejected is non-terminal: hash should still be in the index
      expect(journal.isDuplicate(targetHash)).toBe(true)
      expect(journal.getStatus(intentHash)).toBe('rejected')
    })

    it('removes targetHash from hash index for terminal statuses', async () => {
      const store = createMockStore()
      const logger = createMockLogger()

      const terminals: JournalStatus[] = ['settled', 'failed', 'signed']
      for (const status of terminals) {
        const journal = new ExecutionJournal(store, logger)
        const intentHash = `intent-${status}`
        const targetHash = `0x${status}`

        await journal.track(intentHash, { accountIndex: 0, chainId: 1, targetHash })
        expect(journal.isDuplicate(targetHash)).toBe(true)

        await journal.updateStatus(intentHash, status)

        // terminal: hash should be removed
        expect(journal.isDuplicate(targetHash)).toBe(false)
        expect(journal.getStatus(intentHash)).toBe(status)
      }
    })
  })

  describe('status type safety', () => {
    it('tracks intent with received status', async () => {
      const store = createMockStore()
      const logger = createMockLogger()
      const journal = new ExecutionJournal(store, logger)

      await journal.track('intent-1', { accountIndex: 0, chainId: 1, targetHash: '0x1' })

      expect(journal.getStatus('intent-1')).toBe('received')
      expect(store.saveJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'received' })
      )
    })

    it('updates status to pending_approval', async () => {
      const store = createMockStore()
      const logger = createMockLogger()
      const journal = new ExecutionJournal(store, logger)

      await journal.track('intent-1', { accountIndex: 0, chainId: 1, targetHash: '0x1' })
      await journal.updateStatus('intent-1', 'pending_approval')

      expect(journal.getStatus('intent-1')).toBe('pending_approval')
      expect(journal.isDuplicate('0x1')).toBe(true) // non-terminal
    })
  })
})
