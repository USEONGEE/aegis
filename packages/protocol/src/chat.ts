// ---------------------------------------------------------------------------
// Chat channel wire types (app <-> daemon)
// ---------------------------------------------------------------------------

interface ToolResultWire {
  toolCallId: string
  name: string
  args: Record<string, unknown>
  result: Record<string, unknown>
}

export interface RelayChatInput {
  userId: string
  sessionId: string
  text: string
}

interface ChatTypingEvent {
  type: 'typing'
  userId: string
  sessionId: string
}

interface ChatStreamEvent {
  type: 'stream'
  userId: string
  sessionId: string
  delta: string
  source?: 'user' | 'cron'
}

interface ChatDoneEvent {
  type: 'done'
  userId: string
  sessionId: string
  content: string | null
  toolResults: ToolResultWire[]
  iterations: number
  source?: 'user' | 'cron'
}

interface ChatErrorEvent {
  type: 'error'
  userId: string
  sessionId: string
  error: string
  source?: 'user' | 'cron'
}

interface ChatCancelledEvent {
  type: 'cancelled'
  userId: string
  sessionId: string
  source?: 'user' | 'cron'
}

interface ChatToolStartEvent {
  type: 'tool_start'
  userId: string
  sessionId: string
  toolName: string
  toolCallId: string
  source?: 'user' | 'cron'
}

interface ChatToolDoneEvent {
  type: 'tool_done'
  userId: string
  sessionId: string
  toolName: string
  toolCallId: string
  status: 'success' | 'error'
  source?: 'user' | 'cron'
}

export type ChatEvent =
  | ChatTypingEvent
  | ChatStreamEvent
  | ChatDoneEvent
  | ChatErrorEvent
  | ChatCancelledEvent
  | ChatToolStartEvent
  | ChatToolDoneEvent
