import { randomUUID } from 'node:crypto'

export interface QueuedMessage {
  messageId: string
  sessionId: string
  source: 'user' | 'cron'
  userId: string
  text: string
  chainId: number | null
  createdAt: number
  cronId: string | null
  abortController: AbortController
}

export interface CancelResultOk {
  ok: true
  wasProcessing: boolean
}

export interface CancelResultFailed {
  ok: false
  reason: 'not_found' | 'already_completed'
}

export type CancelResult = CancelResultOk | CancelResultFailed

export type MessageProcessor = (msg: QueuedMessage, signal: AbortSignal) => Promise<void>

export interface MessageQueueOptions {
  maxQueueSize?: number       // default 100
  processTimeout?: number     // default 120000 (2 min)
}

export class SessionMessageQueue {
  private _queue: QueuedMessage[] = []
  private _processing: QueuedMessage | null = null
  private _sessionId: string
  private _processor: MessageProcessor
  private _maxQueueSize: number
  private _running = false

  constructor (sessionId: string, processor: MessageProcessor, opts?: MessageQueueOptions) {
    this._sessionId = sessionId
    this._processor = processor
    this._maxQueueSize = opts?.maxQueueSize ?? 100
  }

  enqueue (msg: Omit<QueuedMessage, 'messageId' | 'abortController' | 'createdAt'>): string {
    if (this._queue.length >= this._maxQueueSize) {
      throw new Error(`Queue full: max ${this._maxQueueSize}`)
    }
    const messageId = randomUUID()
    const queued: QueuedMessage = {
      ...msg,
      messageId,
      createdAt: Date.now(),
      abortController: new AbortController()
    }
    this._queue.push(queued)
    this._drain()
    return messageId
  }

  cancelQueued (messageId: string): CancelResult {
    const idx = this._queue.findIndex(m => m.messageId === messageId)
    if (idx === -1) {
      return { ok: false, reason: 'not_found' }
    }
    this._queue.splice(idx, 1)
    return { ok: true, wasProcessing: false }
  }

  cancelActive (messageId: string): CancelResult {
    if (this._processing?.messageId !== messageId) {
      return { ok: false, reason: 'not_found' }
    }
    this._processing.abortController.abort()
    return { ok: true, wasProcessing: true }
  }

  get pendingCount (): number {
    return this._queue.length
  }

  dispose (): void {
    if (this._processing) {
      this._processing.abortController.abort()
    }
    this._queue = []
    this._running = false
  }

  private async _drain (): Promise<void> {
    if (this._running) return
    this._running = true

    while (this._queue.length > 0) {
      const msg = this._queue.shift()!
      this._processing = msg
      try {
        await this._processor(msg, msg.abortController.signal)
      } catch {
        // errors handled by processor
      }
      this._processing = null
    }

    this._running = false
  }
}

export class MessageQueueManager {
  private _queues = new Map<string, SessionMessageQueue>()
  private _processor: MessageProcessor
  private _opts: MessageQueueOptions

  constructor (processor: MessageProcessor, opts?: MessageQueueOptions) {
    this._processor = processor
    this._opts = opts ?? {}
  }

  /**
   * v0.3.0: composite key (userId, sessionId) to avoid cross-user collision.
   */
  private _queueKey (userId: string, sessionId: string): string {
    return `${userId}:${sessionId}`
  }

  private getQueue (sessionId: string, userId: string = ''): SessionMessageQueue {
    const key = this._queueKey(userId, sessionId)
    let queue = this._queues.get(key)
    if (!queue) {
      queue = new SessionMessageQueue(sessionId, this._processor, this._opts)
      this._queues.set(key, queue)
    }
    return queue
  }

  enqueue (sessionId: string, msg: Omit<QueuedMessage, 'messageId' | 'abortController' | 'createdAt'>): string {
    return this.getQueue(sessionId, msg.userId).enqueue(msg)
  }

  cancelQueued (messageId: string): CancelResult {
    for (const queue of this._queues.values()) {
      const result = queue.cancelQueued(messageId)
      if (result.ok || result.reason !== 'not_found') return result
    }
    return { ok: false, reason: 'not_found' }
  }

  cancelActive (messageId: string): CancelResult {
    for (const queue of this._queues.values()) {
      const result = queue.cancelActive(messageId)
      if (result.ok || result.reason !== 'not_found') return result
    }
    return { ok: false, reason: 'not_found' }
  }

  dispose (): void {
    for (const queue of this._queues.values()) queue.dispose()
    this._queues.clear()
  }
}
