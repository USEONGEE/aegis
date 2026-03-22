import type { PermissionDict } from '@wdk-app/guarded-wdk'

/**
 * Result of a manifest tool call.
 *
 * Every DeFi tool returns the same shape:
 *   - tx: raw transaction ready for sendTransaction
 *   - policy: CallPolicy that would allow this exact tx
 *   - description: human-readable summary
 */
export interface ToolCall {
  tx: { to: string; data: string; value: string }
  policy: { type: 'call'; permissions: PermissionDict }
  description: string
}
