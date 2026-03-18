import OpenAI from 'openai'
import type { DaemonConfig } from './config.js'
import type { ToolDefinition } from './tool-surface.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
  index?: number
}

export interface ChatChoice {
  index: number
  message: {
    role: string
    content: string | null
    tool_calls?: ToolCall[]
  }
  finish_reason: string
}

export interface ChatResponse {
  choices: ChatChoice[]
}

export interface OpenClawClient {
  chat (userId: string, sessionId: string, messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResponse>
  chatStream (userId: string, sessionId: string, messages: ChatMessage[], tools: ToolDefinition[], onDelta: ((delta: string) => void) | null): Promise<ChatResponse>
}

/**
 * Create an OpenClaw client using the OpenAI SDK.
 *
 * OpenClaw is OpenAI-compatible, so we use the official SDK pointed at the
 * local gateway (default: http://localhost:18789).
 */
export function createOpenClawClient (config: DaemonConfig): OpenClawClient {
  const client = new OpenAI({
    baseURL: config.openclawBaseUrl,
    apiKey: config.openclawToken || 'no-key'
  })

  return {
    /**
     * Send a chat completion request to OpenClaw.
     *
     * OpenClaw manages sessions internally keyed by `user` field.
     * We only need to send the latest user message -- OpenClaw loads prior
     * history from its JSONL store automatically.
     */
    async chat (userId: string, sessionId: string, messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResponse> {
      const userField = sessionId ? `${userId}:${sessionId}` : userId

      const params: Record<string, any> = {
        model: 'default',
        stream: false,
        user: userField,
        messages
      }

      if (tools && tools.length > 0) {
        params.tools = tools
      }

      const response = await client.chat.completions.create(params)
      return response as unknown as ChatResponse
    },

    /**
     * Send a chat completion request and stream the response.
     */
    async chatStream (userId: string, sessionId: string, messages: ChatMessage[], tools: ToolDefinition[], onDelta: ((delta: string) => void) | null): Promise<ChatResponse> {
      const userField = sessionId ? `${userId}:${sessionId}` : userId

      const params: Record<string, any> = {
        model: 'default',
        stream: true,
        user: userField,
        messages
      }

      if (tools && tools.length > 0) {
        params.tools = tools
      }

      const stream = await client.chat.completions.create(params) as any

      let role = 'assistant'
      let content = ''
      const toolCalls: ToolCall[] = []
      let finishReason: string | null = null

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0]
        if (!choice) continue

        if (choice.finish_reason) {
          finishReason = choice.finish_reason
        }

        const delta = choice.delta
        if (!delta) continue

        if (delta.role) {
          role = delta.role
        }

        if (delta.content) {
          content += delta.content
          if (onDelta) onDelta(delta.content)
        }

        // Accumulate tool_calls deltas
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = {
                id: tc.id || '',
                type: 'function',
                function: { name: '', arguments: '' }
              }
            }
            const target = toolCalls[tc.index]
            if (tc.id) target.id = tc.id
            if (tc.function?.name) target.function.name += tc.function.name
            if (tc.function?.arguments) target.function.arguments += tc.function.arguments
          }
        }
      }

      // Assemble a response object matching non-streaming shape
      return {
        choices: [{
          index: 0,
          message: {
            role,
            content: content || null,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined
          },
          finish_reason: finishReason || 'stop'
        }]
      }
    }
  }
}
