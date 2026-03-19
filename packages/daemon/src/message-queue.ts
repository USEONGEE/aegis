import { randomUUID } from 'node:crypto'

export interface QueuedMessage {
  messageId: string
  sessionId: string
  source: 'user' | 'cron'
  userId: string
  text: string
  chainId?: number
  createdAt: number
  cronId?: string
  abortController: AbortController
}

export interface PendingMessageRequest {
  messageId: string
  sessionId: string
  source: 'user' | 'cron'
  text: string
  chainId?: number
  createdAt: number
  cronId?: string
}

export interface CancelResult {
  ok: boolean
  reason?: 'not_found' | 'already_completed'
  wasProcessing?: boolean
}

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

  cancel (messageId: string): CancelResult {
    // Check if currently processing
    if (this._processing?.messageId === messageId) {
      this._processing.abortController.abort()
      return { ok: true, wasProcessing: true }
    }
    // Check pending queue
    const idx = this._queue.findIndex(m => m.messageId === messageId)
    if (idx === -1) {
      return { ok: false, reason: 'not_found' }
    }
    this._queue.splice(idx, 1)
    return { ok: true, wasProcessing: false }
  }

  listPending (): PendingMessageRequest[] {
    return this._queue.map(m => ({
      messageId: m.messageId,
      sessionId: m.sessionId,
      source: m.source,
      text: m.text,
      chainId: m.chainId,
      createdAt: m.createdAt,
      cronId: m.cronId
    }))
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

  getQueue (sessionId: string): SessionMessageQueue {
    let queue = this._queues.get(sessionId)
    if (!queue) {
      queue = new SessionMessageQueue(sessionId, this._processor, this._opts)
      this._queues.set(sessionId, queue)
    }
    return queue
  }

  enqueue (sessionId: string, msg: Omit<QueuedMessage, 'messageId' | 'abortController' | 'createdAt'>): string {
    return this.getQueue(sessionId).enqueue(msg)
  }

  cancel (messageId: string): CancelResult {
    for (const queue of this._queues.values()) {
      const result = queue.cancel(messageId)
      if (result.ok || result.reason !== 'not_found') return result
    }
    return { ok: false, reason: 'not_found' }
  }

  dispose (): void {
    for (const queue of this._queues.values()) queue.dispose()
    this._queues.clear()
  }
}
