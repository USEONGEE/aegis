import { processChat } from './tool-call-loop.js'
import type { ToolExecutionContext } from './tool-surface.js'
import type { OpenClawClient } from './openclaw-client.js'
import type { RelayClient } from './relay-client.js'
import type { MessageQueueManager } from './message-queue.js'
import type { RelayChatInput } from '@wdk-app/protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatHandlerOptions {
  maxIterations?: number
}

/**
 * Handle an incoming chat message from the Relay.
 *
 * Flow:
 *   1. Extract userId, sessionId, text from the message.
 *   2. Enqueue into the FIFO MessageQueue (if provided) or run processChat directly.
 *   3. The queue processor sends the final response back through the Relay.
 */
export async function handleChatMessage (
  msg: RelayChatInput,
  openclawClient: OpenClawClient,
  relayClient: RelayClient,
  ctx: ToolExecutionContext,
  opts: ChatHandlerOptions = {},
  queueManager?: MessageQueueManager | null
): Promise<void> {
  const { logger } = ctx
  const { userId, sessionId, text } = msg

  if (!userId || !text) {
    logger.warn({ msg }, 'Malformed chat message: missing userId or text')
    return
  }

  logger.info({ userId, sessionId, textLen: text.length }, 'Processing chat message')

  // If queue manager is provided, enqueue instead of direct processing
  if (queueManager) {
    const messageId = queueManager.enqueue(sessionId, {
      sessionId,
      source: 'user',
      userId,
      text
    })

    // Notify the app that the message was queued (via control channel)
    relayClient.send('control', {
      type: 'message_queued',
      userId,
      sessionId,
      messageId
    })
    return
  }

  // Direct processing (no queue manager)
  await _processChatDirect(userId, sessionId, text, openclawClient, relayClient, ctx, opts)
}

/**
 * Direct chat processing (used when no queue manager, or as the queue processor).
 */
export async function _processChatDirect (
  userId: string,
  sessionId: string,
  text: string,
  openclawClient: OpenClawClient,
  relayClient: RelayClient,
  ctx: ToolExecutionContext,
  opts: ChatHandlerOptions = {},
  signal?: AbortSignal,
  source: 'user' | 'cron' = 'user'
): Promise<void> {
  const { logger } = ctx

  // Send typing indicator (skip for cron messages)
  if (source !== 'cron') {
    relayClient.send('chat', {
      type: 'typing',
      userId,
      sessionId
    })
  }

  try {
    const result = await processChat(
      userId,
      sessionId,
      text,
      ctx,
      openclawClient,
      {
        maxIterations: opts.maxIterations || 10,
        signal,
        onDelta: (delta: string) => {
          // Stream deltas to the app in real-time
          relayClient.send('chat', {
            type: 'stream',
            userId,
            sessionId,
            delta,
            source
          })
        },
        onToolStart: (toolName: string, toolCallId: string) => {
          relayClient.send('chat', {
            type: 'tool_start',
            userId,
            sessionId,
            toolName,
            toolCallId,
            source
          })
        },
        onToolDone: (toolName: string, toolCallId: string, ok: boolean) => {
          relayClient.send('chat', {
            type: 'tool_done',
            userId,
            sessionId,
            toolName,
            toolCallId,
            status: ok ? 'success' : 'error',
            source
          })
        }
      }
    )

    // Send the final completed response
    relayClient.send('chat', {
      type: 'done',
      userId,
      sessionId,
      content: result.content,
      toolResults: result.toolResults,
      iterations: result.iterations,
      source
    })

    logger.info(
      { userId, sessionId, iterations: result.iterations, tools: result.toolResults.length },
      'Chat message processed'
    )
  } catch (err: any) {
    if (signal?.aborted) {
      logger.info({ userId, sessionId }, 'Chat processing aborted')
      relayClient.send('chat', {
        type: 'cancelled',
        userId,
        sessionId,
        source
      })
      return
    }

    logger.error({ err, userId, sessionId }, 'Failed to process chat message')

    // Send error response back to app
    relayClient.send('chat', {
      type: 'error',
      userId,
      sessionId,
      error: 'An internal error occurred while processing your request.',
      source
    })
  }
}
