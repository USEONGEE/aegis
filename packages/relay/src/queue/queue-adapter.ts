// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamEntry {
  id: string
  data: Record<string, string>
}

/**
 * Abstract QueueAdapter interface.
 *
 * Concrete implementations back the two Relay queue types:
 *   - control:{userId}                  (user-scoped control channel)
 *   - chat:{userId}:{sessionId}         (session-scoped chat queue)
 *
 * Each method throws if not overridden.
 */
export abstract class QueueAdapter {
  /**
   * Publish a message to a stream.
   */
  async publish (stream: string, message: Record<string, string>): Promise<string> {
    throw new Error('QueueAdapter.publish() not implemented')
  }

  /**
   * Consume messages from a stream starting after `lastId`.
   *
   * The implementation MAY block for a bounded period when no messages are
   * available (e.g. XREAD BLOCK).
   */
  async consume (stream: string, lastId: string, count: number = 10): Promise<StreamEntry[]> {
    throw new Error('QueueAdapter.consume() not implemented')
  }

  /**
   * Read a range of entries from a stream (non-blocking).
   * Uses XRANGE — returns entries between `start` and `end` (inclusive).
   * Limited by `count` parameter (default 1000). Does NOT paginate beyond count.
   */
  async readRange (stream: string, start: string, end: string, count: number = 1000): Promise<StreamEntry[]> {
    throw new Error('QueueAdapter.readRange() not implemented')
  }

  /**
   * Acknowledge that a message has been processed (consumer-group semantics).
   */
  async ack (stream: string, group: string, id: string): Promise<void> {
    throw new Error('QueueAdapter.ack() not implemented')
  }

  /**
   * Set a key with TTL (used for daemon online heartbeat).
   */
  async setWithTtl (key: string, ttl: number, value: string = '1'): Promise<void> {
    throw new Error('QueueAdapter.setWithTtl() not implemented')
  }

  /**
   * Check whether a key exists (heartbeat probe).
   */
  async exists (key: string): Promise<boolean> {
    throw new Error('QueueAdapter.exists() not implemented')
  }

  /**
   * Trim a stream to approximately `maxLen` entries.
   */
  async trim (stream: string, maxLen: number): Promise<void> {
    throw new Error('QueueAdapter.trim() not implemented')
  }

  /**
   * Graceful shutdown -- release connections.
   */
  async close (): Promise<void> {
    throw new Error('QueueAdapter.close() not implemented')
  }
}
