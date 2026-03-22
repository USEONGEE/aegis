import { SessionMessageQueue, MessageQueueManager } from '../src/message-queue.js'
import type { QueuedMessage, MessageProcessor } from '../src/message-queue.js'

describe('SessionMessageQueue', () => {
  test('sequential processing: 2 messages enqueued, processed in order', async () => {
    const processed: string[] = []
    const processor: MessageProcessor = async (msg) => {
      processed.push(msg.text)
    }

    const queue = new SessionMessageQueue('sess-1', processor)
    queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'first' })
    queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'second' })

    // Wait for drain to complete
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(processed).toEqual(['first', 'second'])
  })

  test('queue full: enqueue beyond maxQueueSize throws error', () => {
    const processor: MessageProcessor = async () => {
      // Block processing so queue fills up
      await new Promise(() => {})
    }

    const queue = new SessionMessageQueue('sess-1', processor, { maxQueueSize: 2 })
    queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'msg1' })

    // First message starts processing, so only 1 is in the queue
    // But the processor blocks, so the queue drains the first item immediately
    // We need to fill the queue while processing is ongoing
    queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'msg2' })
    queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'msg3' })

    expect(() => {
      queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'msg4' })
    }).toThrow('Queue full: max 2')

    queue.dispose()
  })

  test('cancelQueued: cancel a queued message removes it from queue', async () => {
    let processingResolve: (() => void) | null = null
    const processor: MessageProcessor = async () => {
      await new Promise<void>(resolve => { processingResolve = resolve })
    }

    const queue = new SessionMessageQueue('sess-1', processor)
    queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'first' })

    // Wait for first message to start processing
    await new Promise(resolve => setTimeout(resolve, 10))

    // Enqueue a second message (it will be queued, not processing)
    const msgId = queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'second' })
    expect(queue.pendingCount).toBe(1)

    // Cancel the pending message
    const result = queue.cancelQueued(msgId)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result as any).wasProcessing).toBe(false)
    }
    expect(queue.pendingCount).toBe(0)

    // Clean up
    ;(processingResolve as (() => void) | null)?.()
    await new Promise(resolve => setTimeout(resolve, 10))
    queue.dispose()
  })

  test('cancelQueued: non-existent messageId returns not_found', () => {
    const processor: MessageProcessor = async () => {}
    const queue = new SessionMessageQueue('sess-1', processor)

    const result = queue.cancelQueued('nonexistent-id')
    expect(result.ok).toBe(false)
    expect((result as any).reason).toBe('not_found')
  })

  test('cancelQueued: after processing completes, returns not_found', async () => {
    const processor: MessageProcessor = async () => {}

    const queue = new SessionMessageQueue('sess-1', processor)
    const msgId = queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'msg' })

    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 50))

    const result = queue.cancelQueued(msgId)
    expect(result.ok).toBe(false)
    expect((result as any).reason).toBe('not_found')
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
    }

    const queue = new SessionMessageQueue('sess-1', processor)
    const msgId = queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'long-running' })

    // Wait for processing to start
    await new Promise(resolve => setTimeout(resolve, 10))

    const result = queue.cancelActive(msgId)
    expect(result.ok).toBe(true)
    expect((result as any).wasProcessing).toBe(true)

    // Wait for abort handler
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(aborted).toBe(true)

    queue.dispose()
  })

  test('cancelActive: non-processing messageId returns not_found', () => {
    const processor: MessageProcessor = async () => {}
    const queue = new SessionMessageQueue('sess-1', processor)

    const result = queue.cancelActive('nonexistent-id')
    expect(result.ok).toBe(false)
    expect((result as any).reason).toBe('not_found')
  })

  test('enqueue returns a messageId', () => {
    const processor: MessageProcessor = async () => {}
    const queue = new SessionMessageQueue('sess-1', processor)

    const msgId = queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'test' })
    expect(typeof msgId).toBe('string')
    expect(msgId.length).toBeGreaterThan(0)
  })

  test('processor errors do not stop drain', async () => {
    const processed: string[] = []
    const processor: MessageProcessor = async (msg) => {
      if (msg.text === 'fail') throw new Error('processor error')
      processed.push(msg.text)
    }

    const queue = new SessionMessageQueue('sess-1', processor)
    queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'fail' })
    queue.enqueue({ sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'succeed' })

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(processed).toEqual(['succeed'])
  })
})

describe('MessageQueueManager', () => {
  test('enqueue creates queue per session and returns messageId', async () => {
    const processed: string[] = []
    const processor: MessageProcessor = async (msg) => {
      processed.push(`${msg.sessionId}:${msg.text}`)
    }

    const manager = new MessageQueueManager(processor)

    manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'a' })
    manager.enqueue('sess-2', { sessionId: 'sess-2', source: 'user', userId: 'u2', chainId: null, cronId: null, text: 'b' })

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(processed).toContain('sess-1:a')
    expect(processed).toContain('sess-2:b')

    manager.dispose()
  })

  test('cancelQueued searches all queues', async () => {
    let processingResolve: (() => void) | null = null
    const processor: MessageProcessor = async () => {
      await new Promise<void>(resolve => { processingResolve = resolve })
    }

    const manager = new MessageQueueManager(processor)

    manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'first' })
    await new Promise(resolve => setTimeout(resolve, 10))

    const msgId = manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'second' })

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
    }

    const manager = new MessageQueueManager(processor)

    const msgId = manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'long-running' })
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
    }

    const manager = new MessageQueueManager(processor)
    manager.enqueue('sess-1', { sessionId: 'sess-1', source: 'user', userId: 'u1', chainId: null, cronId: null, text: 'msg' })
    manager.enqueue('sess-2', { sessionId: 'sess-2', source: 'user', userId: 'u2', chainId: null, cronId: null, text: 'msg' })

    manager.dispose()
    // After dispose, no errors should occur
  })
})
