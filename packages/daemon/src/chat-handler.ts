import type { OpenClawClient } from './openclaw-client.js'
import type { RelayClient } from './relay-client.js'
import type { MessageQueueManager } from './message-queue.js'
import type { RelayChatInput } from '@wdk-app/protocol'
import type { Logger } from 'pino'

// ---------------------------------------------------------------------------
// Chat Handler — forwards messages to OpenClaw and relays the response.
//
// OpenClaw manages the tool-call loop internally via registered plugins.
// The daemon only sends the user text and receives the final response.
// ---------------------------------------------------------------------------

interface ChatHandlerOptions {
  maxIterations?: number
}

/**
 * Handle an incoming chat message from the Relay.
 * Enqueues into the FIFO MessageQueue for ordered processing.
 */
export async function handleChatMessage (
  msg: RelayChatInput,
  openclawClient: OpenClawClient,
  relayClient: RelayClient,
  _ctx: unknown,
  _opts: ChatHandlerOptions = {},
  queueManager: MessageQueueManager
): Promise<void> {
  const { userId, sessionId, text } = msg

  if (!userId || !text) return

  const messageId = queueManager.enqueue(sessionId, {
    sessionId,
    source: 'user',
    userId,
    text,
    chain: { kind: 'all' },
    cronId: null
  })

  relayClient.send('control', {
    type: 'message_queued',
    userId,
    sessionId,
    messageId
  })
}

/**
 * Direct chat processing — calls OpenClaw and sends the final response via Relay.
 */
export async function _processChatDirect (
  userId: string,
  sessionId: string,
  text: string,
  openclawClient: OpenClawClient,
  relayClient: RelayClient,
  _ctx: unknown,
  _opts: ChatHandlerOptions = {},
  signal?: AbortSignal,
  source: 'user' | 'cron' = 'user'
): Promise<void> {
  // Send typing indicator (skip for cron)
  if (source !== 'cron') {
    relayClient.send('chat', { type: 'typing', userId, sessionId })
  }

  try {
    const content = await openclawClient.chat(userId, sessionId, text, { signal })

    relayClient.send('chat', {
      type: 'done',
      userId,
      sessionId,
      content,
      toolResults: [],
      iterations: 1,
      source
    })
  } catch (err: unknown) {
    if (signal?.aborted) {
      relayClient.send('chat', { type: 'cancelled', userId, sessionId, source })
      return
    }

    relayClient.send('chat', {
      type: 'error',
      userId,
      sessionId,
      error: 'An internal error occurred while processing your request.',
      source
    })
  }
}
