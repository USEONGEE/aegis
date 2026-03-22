import { TOOL_DEFINITIONS } from './ai-tool-schema.js'
import { executeToolCall } from './tool-surface.js'
import type {
  ToolExecutionContext, AnyToolResult,
  SendTransactionResult, TransferResult, GetBalanceResult,
  PolicyListResult, PolicyPendingResult, PolicyRequestResult,
  RegisterCronResult, ListCronsResult, RemoveCronResult,
  SignTransactionResult, ListRejectionsResult, ListPolicyVersionsResult,
  ToolErrorResult
} from './tool-surface.js'
import type { OpenClawClient, ChatMessage } from './openclaw-client.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolResultEntry =
  | { toolCallId: string; name: 'sendTransaction'; args: Record<string, unknown>; result: SendTransactionResult }
  | { toolCallId: string; name: 'transfer'; args: Record<string, unknown>; result: TransferResult }
  | { toolCallId: string; name: 'getBalance'; args: Record<string, unknown>; result: GetBalanceResult }
  | { toolCallId: string; name: 'policyList'; args: Record<string, unknown>; result: PolicyListResult }
  | { toolCallId: string; name: 'policyPending'; args: Record<string, unknown>; result: PolicyPendingResult }
  | { toolCallId: string; name: 'policyRequest'; args: Record<string, unknown>; result: PolicyRequestResult }
  | { toolCallId: string; name: 'registerCron'; args: Record<string, unknown>; result: RegisterCronResult }
  | { toolCallId: string; name: 'listCrons'; args: Record<string, unknown>; result: ListCronsResult }
  | { toolCallId: string; name: 'removeCron'; args: Record<string, unknown>; result: RemoveCronResult }
  | { toolCallId: string; name: 'signTransaction'; args: Record<string, unknown>; result: SignTransactionResult }
  | { toolCallId: string; name: 'listRejections'; args: Record<string, unknown>; result: ListRejectionsResult }
  | { toolCallId: string; name: 'listPolicyVersions'; args: Record<string, unknown>; result: ListPolicyVersionsResult }
  | { toolCallId: string; name: string; args: Record<string, unknown>; result: ToolErrorResult }

export interface ProcessChatResult {
  content: string | null
  toolResults: ToolResultEntry[]
  iterations: number
}

export interface ProcessChatOptions {
  maxIterations?: number
  onDelta?: ((delta: string) => void) | null
  onToolStart?: ((toolName: string, toolCallId: string) => void) | null
  onToolDone?: ((toolName: string, toolCallId: string, ok: boolean) => void) | null
  signal?: AbortSignal
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
  ctx: ToolExecutionContext,
  openclawClient: OpenClawClient,
  opts: ProcessChatOptions = {}
): Promise<ProcessChatResult> {
  const { logger } = ctx
  const maxIterations = opts.maxIterations || 10
  const onDelta = opts.onDelta || null
  const signal = opts.signal

  // Start with the user message
  const messages: ChatMessage[] = [
    { role: 'user', content: userMessage }
  ]

  const allToolResults: ToolResultEntry[] = []
  let iterations = 0
  let finalContent: string | null = null

  while (iterations < maxIterations) {
    // Check abort signal before each iteration
    if (signal?.aborted) {
      logger.info({ iterations }, 'Tool-call loop aborted by signal')
      break
    }

    iterations++

    logger.debug({ iteration: iterations, messageCount: messages.length }, 'OpenClaw request')

    // Call OpenClaw
    let response
    if (onDelta && iterations === 1) {
      // Only stream the first response (subsequent tool-result responses are non-streaming)
      response = await openclawClient.chatStream(
        userId, sessionId, messages, TOOL_DEFINITIONS, onDelta, { signal }
      )
    } else {
      response = await openclawClient.chat(
        userId, sessionId, messages, TOOL_DEFINITIONS, { signal }
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

      // Notify tool start
      opts.onToolStart?.(fnName, toolCall.id)

      let result: AnyToolResult
      try {
        result = await executeToolCall(fnName, fnArgs, ctx)
        opts.onToolDone?.(fnName, toolCall.id, true)
      } catch (err: unknown) {
        logger.error({ err, tool: fnName }, 'Unhandled tool execution error')
        opts.onToolDone?.(fnName, toolCall.id, false)
        result = { status: 'error', error: err instanceof Error ? err.message : String(err) }
      }

      const resultStr = JSON.stringify(result)

      allToolResults.push({
        toolCallId: toolCall.id,
        name: fnName,
        args: fnArgs,
        result
      } as ToolResultEntry)

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
