import { MessageQueueManager } from '../src/message-queue.js'
import type { QueuedMessage } from '../src/message-queue.js'

type MessageProcessor = (msg: QueuedMessage, signal: AbortSignal) => Promise<{ ok: boolean; error?: string }>

describe('SessionMessageQueue (via MessageQueueManager)', () => {
  test('sequential processing: 2 messages enqueued, processed in order', async () => {
    const processed: string[] = []
    const processor: MessageProcessor = async (msg) => {
      processed.push(msg.text)
      return { ok: true }
    }

    const manager = new MessageQueueManager(processor)
    manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'first' })
    manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'second' })

    // Wait for drain to complete
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(processed).toEqual(['first', 'second'])
    manager.dispose()
  })

  test('cancelQueued: cancel a queued message removes it from queue', async () => {
    let processingResolve: (() => void) | null = null
    const processor: MessageProcessor = async () => {
      await new Promise<void>(resolve => { processingResolve = resolve })
      return { ok: true }
    }

    const manager = new MessageQueueManager(processor)
    manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'first' })

    // Wait for first message to start processing
    await new Promise(resolve => setTimeout(resolve, 10))

    // Enqueue a second message (it will be queued, not processing)
    const msgId = manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'second' })

    // Cancel the pending message
    const result = manager.cancelQueued(msgId)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result as any).wasProcessing).toBe(false)
    }

    // Clean up
    ;(processingResolve as (() => void) | null)?.()
    await new Promise(resolve => setTimeout(resolve, 10))
    manager.dispose()
  })

  test('cancelQueued: non-existent messageId returns not_found', () => {
    const processor: MessageProcessor = async () => ({ ok: true })
    const manager = new MessageQueueManager(processor)

    const result = manager.cancelQueued('nonexistent-id')
    expect(result.ok).toBe(false)
    expect((result as any).reason).toBe('not_found')
    manager.dispose()
  })

  test('cancelQueued: after processing completes, returns not_found', async () => {
    const processor: MessageProcessor = async () => ({ ok: true })

    const manager = new MessageQueueManager(processor)
    const msgId = manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'msg' })

    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 50))

    const result = manager.cancelQueued(msgId)
    expect(result.ok).toBe(false)
    expect((result as any).reason).toBe('not_found')
    manager.dispose()
  })

  test('cancelActive: cancel currently processing message aborts', async () => {
    let aborted = false
    const processor: MessageProcessor = async (_msg, signal) => {
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => {
          aborted = true
          resolve()
        })
      })
      return { ok: true }
    }

    const manager = new MessageQueueManager(processor)
    const msgId = manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'long-running' })

    // Wait for processing to start
    await new Promise(resolve => setTimeout(resolve, 10))

    const result = manager.cancelActive(msgId)
    expect(result.ok).toBe(true)
    expect((result as any).wasProcessing).toBe(true)

    // Wait for abort handler
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(aborted).toBe(true)

    manager.dispose()
  })

  test('cancelActive: non-processing messageId returns not_found', () => {
    const processor: MessageProcessor = async () => ({ ok: true })
    const manager = new MessageQueueManager(processor)

    const result = manager.cancelActive('nonexistent-id')
    expect(result.ok).toBe(false)
    expect((result as any).reason).toBe('not_found')
    manager.dispose()
  })

  test('enqueue returns a messageId', () => {
    const processor: MessageProcessor = async () => ({ ok: true })
    const manager = new MessageQueueManager(processor)

    const msgId = manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'test' })
    expect(typeof msgId).toBe('string')
    expect(msgId.length).toBeGreaterThan(0)
    manager.dispose()
  })

  test('processor errors do not stop drain', async () => {
    const processed: string[] = []
    const processor: MessageProcessor = async (msg) => {
      if (msg.text === 'fail') throw new Error('processor error')
      processed.push(msg.text)
      return { ok: true }
    }

    const manager = new MessageQueueManager(processor)
    manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'fail' })
    manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'succeed' })

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(processed).toEqual(['succeed'])
    manager.dispose()
  })
})

describe('MessageQueueManager', () => {
  test('enqueue creates queue per session and returns messageId', async () => {
    const processed: string[] = []
    const processor: MessageProcessor = async (msg) => {
      processed.push(`${msg.sessionId}:${msg.text}`)
      return { ok: true }
    }

    const manager = new MessageQueueManager(processor)

    manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'a' })
    manager.enqueue('sess-2', { sessionId: 'sess-2', source: 'user', userId: 'u2', chain: { kind: 'all' }, cronId: null, text: 'b' })

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(processed).toContain('sess-1:a')
    expect(processed).toContain('sess-2:b')

    manager.dispose()
  })

  test('cancelQueued searches all queues', async () => {
    let processingResolve: (() => void) | null = null
    const processor: MessageProcessor = async () => {
      await new Promise<void>(resolve => { processingResolve = resolve })
      return { ok: true }
    }

    const manager = new MessageQueueManager(processor)

    manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'first' })
    await new Promise(resolve => setTimeout(resolve, 10))

    const msgId = manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'second' })

    const result = manager.cancelQueued(msgId)
    expect(result.ok).toBe(true)
    expect((result as any).wasProcessing).toBe(false)

    // CancelQueued non-existent
    const result2 = manager.cancelQueued('nonexistent')
    expect(result2.ok).toBe(false)
    expect((result2 as any).reason).toBe('not_found')

    ;(processingResolve as (() => void) | null)?.()
    await new Promise(resolve => setTimeout(resolve, 10))
    manager.dispose()
  })

  test('cancelActive searches all queues', async () => {
    let aborted = false
    const processor: MessageProcessor = async (_msg, signal) => {
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => {
          aborted = true
          resolve()
        })
      })
      return { ok: true }
    }

    const manager = new MessageQueueManager(processor)

    const msgId = manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'long-running' })
    await new Promise(resolve => setTimeout(resolve, 10))

    const result = manager.cancelActive(msgId)
    expect(result.ok).toBe(true)
    expect((result as any).wasProcessing).toBe(true)

    // Wait for abort handler
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(aborted).toBe(true)

    // CancelActive non-existent
    const result2 = manager.cancelActive('nonexistent')
    expect(result2.ok).toBe(false)
    expect((result2 as any).reason).toBe('not_found')

    manager.dispose()
  })

  test('dispose cleans up all queues', async () => {
    const processor: MessageProcessor = async () => {
      await new Promise(() => {}) // Never resolves
      return { ok: true }
    }

    const manager = new MessageQueueManager(processor)
    manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chain: { kind: 'all' }, cronId: null, text: 'msg' })
    manager.enqueue('sess-2', { sessionId: 'sess-2', source: 'user', userId: 'u2', chain: { kind: 'all' }, cronId: null, text: 'msg' })

    manager.dispose()
    // After dispose, no errors should occur
  })
})
