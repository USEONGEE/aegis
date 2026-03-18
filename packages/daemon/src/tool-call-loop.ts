import { TOOL_DEFINITIONS, executeToolCall } from './tool-surface.js'
import type { WDKContext, ToolResult, ToolDefinition } from './tool-surface.js'
import type { OpenClawClient, ChatMessage } from './openclaw-client.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolResultEntry {
  toolCallId: string
  name: string
  args: Record<string, unknown>
  result: ToolResult
}

export interface ProcessChatResult {
  content: string | null
  toolResults: ToolResultEntry[]
  iterations: number
}

export interface ProcessChatOptions {
  maxIterations?: number
  onDelta?: ((delta: string) => void) | null
}

/**
 * Process a chat request through the OpenClaw <-> tool-call loop.
 *
 * Flow:
 *   1. Send user message + tool definitions to OpenClaw.
 *   2. If response contains tool_calls, execute each tool, collect results.
 *   3. Send tool results back to OpenClaw as follow-up messages.
 *   4. Repeat until OpenClaw returns a final text response (no tool_calls)
 *      or max iterations is reached.
 */
export async function processChat (
  userId: string,
  sessionId: string,
  userMessage: string,
  wdkContext: WDKContext,
  openclawClient: OpenClawClient,
  opts: ProcessChatOptions = {}
): Promise<ProcessChatResult> {
  const { logger } = wdkContext
  const maxIterations = opts.maxIterations || 10
  const onDelta = opts.onDelta || null

  // Start with the user message
  const messages: ChatMessage[] = [
    { role: 'user', content: userMessage }
  ]

  const allToolResults: ToolResultEntry[] = []
  let iterations = 0
  let finalContent: string | null = null

  while (iterations < maxIterations) {
    iterations++

    logger.debug({ iteration: iterations, messageCount: messages.length }, 'OpenClaw request')

    // Call OpenClaw
    let response
    if (onDelta && iterations === 1) {
      // Only stream the first response (subsequent tool-result responses are non-streaming)
      response = await openclawClient.chatStream(
        userId, sessionId, messages, TOOL_DEFINITIONS, onDelta
      )
    } else {
      response = await openclawClient.chat(
        userId, sessionId, messages, TOOL_DEFINITIONS
      )
    }

    const choice = response.choices?.[0]
    if (!choice) {
      logger.error('Empty response from OpenClaw')
      break
    }

    const assistantMessage = choice.message
    const finishReason = choice.finish_reason

    // No tool calls -- we have the final answer
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      finalContent = assistantMessage.content
      break
    }

    // Process tool calls
    logger.info(
      { toolCount: assistantMessage.tool_calls.length, iteration: iterations },
      'Processing tool calls'
    )

    // Build messages for the next round:
    // 1. The assistant message (with tool_calls)
    // 2. One tool result message per tool_call
    const followUpMessages: ChatMessage[] = [
      {
        role: 'assistant',
        content: assistantMessage.content || null,
        tool_calls: assistantMessage.tool_calls
      }
    ]

    for (const toolCall of assistantMessage.tool_calls) {
      const fnName = toolCall.function.name
      let fnArgs: Record<string, unknown>

      try {
        fnArgs = JSON.parse(toolCall.function.arguments)
      } catch (err) {
        logger.warn({ toolCallId: toolCall.id, raw: toolCall.function.arguments }, 'Failed to parse tool arguments')
        fnArgs = {}
      }

      logger.info({ tool: fnName, args: fnArgs }, 'Executing tool call')

      let result: ToolResult
      try {
        result = await executeToolCall(fnName, fnArgs, wdkContext)
      } catch (err: any) {
        logger.error({ err, tool: fnName }, 'Unhandled tool execution error')
        result = { status: 'error', error: err.message }
      }

      const resultStr = JSON.stringify(result)

      allToolResults.push({
        toolCallId: toolCall.id,
        name: fnName,
        args: fnArgs,
        result
      })

      followUpMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: resultStr
      })
    }

    // Replace messages with the follow-up for the next iteration.
    // OpenClaw manages session history, so we only need to send the
    // assistant message with tool_calls + the tool results.
    messages.length = 0
    messages.push(...followUpMessages)
  }

  if (iterations >= maxIterations && finalContent === null) {
    logger.warn({ iterations }, 'Tool-call loop reached max iterations without final answer')
    finalContent = 'I was unable to complete the request within the allowed number of steps. Please try again or simplify the request.'
  }

  return {
    content: finalContent,
    toolResults: allToolResults,
    iterations
  }
}
