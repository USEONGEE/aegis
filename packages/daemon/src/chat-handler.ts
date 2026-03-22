import type { OpenClawClient } from './openclaw-client.js'
import type { RelayClient } from './relay-client.js'
import type { MessageQueueManager } from './message-queue.js'
import type { RelayChatInput } from '@wdk-app/protocol'
import { pino } from 'pino'

const chatLogger = pino({ name: 'chat-handler' })

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
    chatLogger.info({ userId, sessionId, textLen: text.length }, 'Calling OpenClaw...')
    const content = await openclawClient.chat(userId, sessionId, text, { signal })
    chatLogger.info({ userId, sessionId, contentLen: content?.length ?? 0 }, 'OpenClaw response received')

    // IMPORTANT: v0.5.5 non-streaming 모드에서는 'done' 이벤트의 content가
    // 앱에 응답을 전달하는 유일한 경로다. 'stream' 이벤트를 보내지 않으므로
    // 앱의 ChatDetailScreen 'done' 핸들러가 content를 addMessage()한다.
    // content를 누락하면 앱에 빈 화면이 표시된다.
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
    chatLogger.error({ err: err instanceof Error ? err.message : String(err), userId, sessionId }, 'OpenClaw call failed')
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
