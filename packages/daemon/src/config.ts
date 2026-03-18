import { join } from 'node:path'
import { homedir } from 'node:os'

// ---------------------------------------------------------------------------
// Daemon configuration types
// ---------------------------------------------------------------------------

export interface DaemonConfig {
  // --- WDK paths ---
  wdkHome: string
  storePath: string
  socketPath: string

  // --- OpenClaw ---
  openclawBaseUrl: string
  openclawToken: string

  // --- Relay ---
  relayUrl: string
  relayToken: string

  // --- Daemon tuning ---
  toolCallMaxIterations: number
  approvalTimeoutMs: number
  cronTickIntervalMs: number
  heartbeatIntervalMs: number
  reconnectBaseMs: number
  reconnectMaxMs: number
}

/**
 * Load daemon configuration from environment variables.
 * All config is derived from env -- no config files.
 */
export function loadConfig (): DaemonConfig {
  const wdkHome = process.env.WDK_HOME || join(homedir(), '.wdk')

  return {
    // --- WDK paths ---
    wdkHome,
    storePath: join(wdkHome, 'store'),
    socketPath: join(wdkHome, 'daemon.sock'),

    // --- OpenClaw ---
    openclawBaseUrl: process.env.OPENCLAW_BASE_URL || 'http://localhost:18789',
    openclawToken: process.env.OPENCLAW_TOKEN || '',

    // --- Relay ---
    relayUrl: process.env.RELAY_URL || 'ws://localhost:3000/ws',
    relayToken: process.env.RELAY_TOKEN || '',

    // --- Daemon tuning ---
    toolCallMaxIterations: parseInt(process.env.TOOL_CALL_MAX_ITERATIONS || '10', 10),
    approvalTimeoutMs: parseInt(process.env.APPROVAL_TIMEOUT_MS || '60000', 10),
    cronTickIntervalMs: parseInt(process.env.CRON_TICK_INTERVAL_MS || '60000', 10),
    heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10),
    reconnectBaseMs: parseInt(process.env.RECONNECT_BASE_MS || '1000', 10),
    reconnectMaxMs: parseInt(process.env.RECONNECT_MAX_MS || '30000', 10)
  }
}
