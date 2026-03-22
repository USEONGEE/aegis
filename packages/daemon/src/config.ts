import { join } from 'node:path'
import { homedir } from 'node:os'

// ---------------------------------------------------------------------------
// Daemon configuration types
// ---------------------------------------------------------------------------

export interface DaemonConfig {
  // --- WDK paths ---
  wdkHome: string
  storePath: string
  daemonStorePath: string
  socketPath: string

  // --- OpenClaw ---
  openclawBaseUrl: string
  openclawToken: string

  // --- Tool API (HTTP server for OpenClaw plugin) ---
  toolApiPort: number
  toolApiToken: string

  // --- Relay ---
  /** Relay base URL (e.g. http://localhost:3000). WS path is appended automatically. */
  relayUrl: string
  relayToken: string

  // --- Daemon Identity (v0.3.0) ---
  daemonId: string
  daemonSecret: string

  // --- DeFi CLIs ---
  kittenCliPath: string

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
    daemonStorePath: join(wdkHome, 'daemon-store'),
    socketPath: process.env.WDK_SOCKET_PATH || join(wdkHome, 'daemon.sock'),

    // --- OpenClaw ---
    openclawBaseUrl: process.env.OPENCLAW_BASE_URL || 'http://localhost:18789',
    openclawToken: process.env.OPENCLAW_TOKEN || '',

    // --- Tool API ---
    toolApiPort: parseInt(process.env.TOOL_API_PORT || '18790', 10),
    toolApiToken: process.env.TOOL_API_TOKEN || '',

    // --- Relay ---
    relayUrl: process.env.RELAY_URL || 'http://localhost:3000',
    relayToken: process.env.RELAY_TOKEN || '',

    // --- Daemon Identity (v0.3.0) ---
    daemonId: process.env.DAEMON_ID || '',
    daemonSecret: process.env.DAEMON_SECRET || '',

    // --- DeFi CLIs ---
    kittenCliPath: process.env.KITTEN_CLI_PATH || 'kitten-cli',

    // --- Daemon tuning ---
    toolCallMaxIterations: parseInt(process.env.TOOL_CALL_MAX_ITERATIONS || '10', 10),
    approvalTimeoutMs: parseInt(process.env.APPROVAL_TIMEOUT_MS || '60000', 10),
    cronTickIntervalMs: parseInt(process.env.CRON_TICK_INTERVAL_MS || '60000', 10),
    heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10),
    reconnectBaseMs: parseInt(process.env.RECONNECT_BASE_MS || '1000', 10),
    reconnectMaxMs: parseInt(process.env.RECONNECT_MAX_MS || '30000', 10)
  }
}
