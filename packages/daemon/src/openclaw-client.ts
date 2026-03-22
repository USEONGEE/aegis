import type { DaemonConfig } from './config.js'

// ---------------------------------------------------------------------------
// OpenClaw Client — calls OpenClaw Gateway /v1/responses (OpenResponses API)
//
// OpenClaw manages:
//   - Session history (via `user` parameter)
//   - Tool-call loop (via registered plugin tools)
//   - AI model selection
//
// Daemon only sends the user message and receives the final text response.
// ---------------------------------------------------------------------------

export interface OpenClawClient {
  chat (userId: string, sessionId: string, text: string, opts?: { signal?: AbortSignal }): Promise<string | null>
}

interface ResponsesOutputItem {
  type: string
  content?: Array<{ type: string; text?: string }>
}

interface ResponsesResult {
  id: string
  output: ResponsesOutputItem[]
  status: string
  error?: { message: string; type: string }
}

export function createOpenClawClient (config: DaemonConfig): OpenClawClient {
  const baseUrl = config.openclawBaseUrl.replace(/\/$/, '')
  const token = config.openclawToken
  const endpoint = `${baseUrl}/v1/responses`

  return {
    async chat (userId, sessionId, text, opts) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          model: 'openclaw:daemon',
          input: text,
          user: `${userId}:${sessionId}`
        }),
        signal: opts?.signal
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`OpenClaw API error (${res.status}): ${errorText}`)
      }

      const data = await res.json() as ResponsesResult

      if (data.error) {
        throw new Error(`OpenClaw error: ${data.error.message}`)
      }

      // Extract text from output
      let text_content = ''
      for (const item of data.output) {
        if (item.type === 'message' && item.content) {
          for (const block of item.content) {
            if (block.type === 'output_text' && block.text) {
              text_content += block.text
            }
          }
        }
      }

      return text_content || null
    }
  }
}
