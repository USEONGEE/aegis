// ---------------------------------------------------------------------------
// Relay transport types
// ---------------------------------------------------------------------------

export type RelayChannel = 'control' | 'chat'

/**
 * Wire envelope for all relay ↔ daemon/app messages.
 *
 * v0.3.0: userId is required for daemon→relay multiplex routing.
 * Daemon sends userId on every control/chat message.
 * Relay injects userId when forwarding app messages to daemon.
 */
export interface RelayEnvelope {
  type: string
  payload?: unknown
  encrypted?: boolean
  sessionId?: string
  /** v0.3.0: target/source user for multiplex routing */
  userId?: string
  /** v0.3.0: daemon identity (set in authenticated response) */
  daemonId?: string
  /** v0.3.0: bound user list (set in authenticated response) */
  userIds?: string[]
  /** v0.3.0: per-user control cursors for reconnect resume */
  lastControlIds?: Record<string, string>
}
