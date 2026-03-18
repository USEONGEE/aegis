import { processChat } from './tool-call-loop.js'
import type { WDKContext } from './tool-surface.js'
import type { OpenClawClient } from './openclaw-client.js'
import type { RelayClient } from './relay-client.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  userId: string
  sessionId: string
  text: string
}

export interface ChatHandlerOptions {
  maxIterations?: number
}

/**
 * Handle an incoming chat message from the Relay.
 *
 * Flow:
 *   1. Extract userId, sessionId, text from the message.
 *   2. Run processChat (OpenClaw tool-call loop).
 *   3. Send the final response back through the Relay.
 */
export async function handleChatMessage (
  msg: ChatMessage,
  openclawClient: OpenClawClient,
  relayClient: RelayClient,
  wdkContext: WDKContext,
  opts: ChatHandlerOptions = {}
): Promise<void> {
  const { logger } = wdkContext
  const { userId, sessionId, text } = msg

  if (!userId || !text) {
    logger.warn({ msg }, 'Malformed chat message: missing userId or text')
    return
  }

  logger.info({ userId, sessionId, textLen: text.length }, 'Processing chat message')

  // Send typing indicator
  relayClient.send('chat', {
    type: 'typing',
    userId,
    sessionId
  })

  try {
    const result = await processChat(
      userId,
      sessionId,
      text,
      wdkContext,
      openclawClient,
      {
        maxIterations: opts.maxIterations || 10,
        onDelta: (delta: string) => {
          // Stream deltas to the app in real-time
          relayClient.send('chat', {
            type: 'stream',
            userId,
            sessionId,
            delta
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
      iterations: result.iterations
    })

    logger.info(
      { userId, sessionId, iterations: result.iterations, tools: result.toolResults.length },
      'Chat message processed'
    )
  } catch (err: any) {
    logger.error({ err, userId, sessionId }, 'Failed to process chat message')

    // Send error response back to app
    relayClient.send('chat', {
      type: 'error',
      userId,
      sessionId,
      error: 'An internal error occurred while processing your request.'
    })
  }
}
