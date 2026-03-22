import Anthropic from '@anthropic-ai/sdk'
import type { DaemonConfig } from './config.js'
import type { ToolDefinition } from './ai-tool-schema.js'

// ---------------------------------------------------------------------------
// Types (unchanged — tool-call-loop.ts depends on these)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
  index?: number
}

interface ChatChoice {
  index: number
  message: {
    role: string
    content: string | null
    tool_calls?: ToolCall[]
  }
  finish_reason: string
}

interface ChatResponse {
  choices: ChatChoice[]
}

export interface OpenClawClient {
  chat (userId: string, sessionId: string, messages: ChatMessage[], tools: ToolDefinition[], opts?: { signal?: AbortSignal }): Promise<ChatResponse>
  chatStream (userId: string, sessionId: string, messages: ChatMessage[], tools: ToolDefinition[], onDelta: ((delta: string) => void) | null, opts?: { signal?: AbortSignal }): Promise<ChatResponse>
}

// ---------------------------------------------------------------------------
// Adapter: OpenAI-style messages → Anthropic format
// ---------------------------------------------------------------------------

function convertMessages (messages: ChatMessage[]): { system: string | undefined, anthropicMessages: Anthropic.MessageParam[] } {
  let system: string | undefined
  const anthropicMessages: Anthropic.MessageParam[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content || undefined
      continue
    }

    if (msg.role === 'user') {
      anthropicMessages.push({ role: 'user', content: msg.content || '' })
      continue
    }

    if (msg.role === 'assistant') {
      const content: Anthropic.ContentBlockParam[] = []
      if (msg.content) {
        content.push({ type: 'text', text: msg.content })
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let input: Record<string, unknown>
          try { input = JSON.parse(tc.function.arguments) } catch { input = {} }
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input
          })
        }
      }
      if (content.length > 0) {
        anthropicMessages.push({ role: 'assistant', content })
      }
      continue
    }

    if (msg.role === 'tool') {
      anthropicMessages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id || '',
          content: msg.content || ''
        }]
      })
      continue
    }
  }

  return { system, anthropicMessages }
}

function convertTools (tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description || '',
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema
  }))
}

function convertResponse (response: Anthropic.Message): ChatResponse {
  let textContent = ''
  const toolCalls: ToolCall[] = []

  for (const block of response.content) {
    if (block.type === 'text') {
      textContent += block.text
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input)
        }
      })
    }
  }

  return {
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: textContent || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      },
      finish_reason: response.stop_reason === 'tool_use' ? 'tool_calls' : 'stop'
    }]
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createOpenClawClient (config: DaemonConfig): OpenClawClient {
  const client = new Anthropic({
    apiKey: config.anthropicApiKey || undefined
  })

  const model = config.anthropicModel

  return {
    async chat (_userId: string, _sessionId: string, messages: ChatMessage[], tools: ToolDefinition[], opts?: { signal?: AbortSignal }): Promise<ChatResponse> {
      const { system, anthropicMessages } = convertMessages(messages)
      const anthropicTools = tools.length > 0 ? convertTools(tools) : undefined

      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model,
        max_tokens: 4096,
        messages: anthropicMessages,
        ...(system ? { system } : {}),
        ...(anthropicTools ? { tools: anthropicTools } : {})
      }

      const response = await client.messages.create(params, { signal: opts?.signal })
      return convertResponse(response)
    },

    async chatStream (_userId: string, _sessionId: string, messages: ChatMessage[], tools: ToolDefinition[], onDelta: ((delta: string) => void) | null, opts?: { signal?: AbortSignal }): Promise<ChatResponse> {
      const { system, anthropicMessages } = convertMessages(messages)
      const anthropicTools = tools.length > 0 ? convertTools(tools) : undefined

      const params: Anthropic.MessageCreateParamsStreaming = {
        model,
        max_tokens: 4096,
        stream: true,
        messages: anthropicMessages,
        ...(system ? { system } : {}),
        ...(anthropicTools ? { tools: anthropicTools } : {})
      }

      const stream = client.messages.stream(params, { signal: opts?.signal })

      let textContent = ''
      const toolCalls: ToolCall[] = []
      let stopReason: string | null = null

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            textContent += event.delta.text
            if (onDelta) onDelta(event.delta.text)
          } else if (event.delta.type === 'input_json_delta') {
            // Tool input streaming — accumulate in the last tool call
            const lastTc = toolCalls[toolCalls.length - 1]
            if (lastTc) {
              lastTc.function.arguments += event.delta.partial_json
            }
          }
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            toolCalls.push({
              id: event.content_block.id,
              type: 'function',
              function: {
                name: event.content_block.name,
                arguments: ''
              }
            })
          }
        } else if (event.type === 'message_delta') {
          stopReason = event.delta.stop_reason || null
        }
      }

      return {
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: textContent || null,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined
          },
          finish_reason: stopReason === 'tool_use' ? 'tool_calls' : 'stop'
        }]
      }
    }
  }
}
