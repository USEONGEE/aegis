/**
 * Unified Signed Approval types.
 * These mirror the PRD's Signed Envelope Spec — used by both RN App and WDK.
 */

/**
 * The approval types supported by the system.
 */
export type ApprovalType = 'tx' | 'policy' | 'policy_reject' | 'device_revoke';

/**
 * Unsigned intent — the tx format that WDK receives from any source (AI, DeFi CLI, etc).
 * intentHash = SHA-256(canonical { chain, to, data, value })
 */
export interface UnsignedIntent {
  chain: string;
  to: string;
  data: string;
  value: string;
}

/**
 * SignedApproval — the unified envelope for all approval types.
 * tx, policy, policy_reject, device_revoke all use the same structure.
 * Signed with Ed25519 identity key.
 */
export interface SignedApproval {
  // What
  type: ApprovalType;
  targetHash: string;           // tx: intentHash, policy: policyHash

  // Who
  approver: string;             // identity public key (hex)
  deviceId: string;             // signing device

  // Context
  chain: string;                // cross-chain replay prevention
  requestId: string;            // pending policy ID or intent ID
  policyVersion: number;        // tx approval: current policy version binding

  // When
  expiresAt: number;            // unix timestamp
  nonce: number;                // per-approver + per-device scope

  // Signature
  sig: string;                  // Ed25519 sign(all fields except sig), hex
}

/**
 * ApprovalRequest — what the daemon sends to the app when approval is needed.
 */
export interface ApprovalRequest {
  requestId: string;
  type: ApprovalType;
  chain: string;
  targetHash: string;

  // Display metadata
  metadata: {
    // For tx approvals
    to?: string;
    value?: string;
    data?: string;
    description?: string;
    estimatedFeeUSD?: string;

    // For policy approvals
    reason?: string;
    policies?: unknown[];

    // For device revoke
    deviceId?: string;
    deviceName?: string;
  };

  policyVersion: number;
  createdAt: number;
  expiresAt: number;
}

/**
 * Fields that go into the signed payload (everything except `sig`).
 */
export interface SignedApprovalPayload {
  type: ApprovalType;
  targetHash: string;
  approver: string;
  deviceId: string;
  chain: string;
  requestId: string;
  policyVersion: number;
  expiresAt: number;
  nonce: number;
}
