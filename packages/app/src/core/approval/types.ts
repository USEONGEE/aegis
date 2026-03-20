/**
 * Unified Signed Approval types.
 * These mirror the PRD's Signed Envelope Spec — used by both RN App and WDK.
 */

/**
 * The approval types supported by the system.
 */
export type ApprovalType = 'tx' | 'policy' | 'policy_reject' | 'device_revoke' | 'wallet_create' | 'wallet_delete';

/**
 * Unsigned intent — the tx format that WDK receives from any source (AI, DeFi CLI, etc).
 * intentHash = SHA-256(canonical { chain, to, data, value })
 */
export interface UnsignedIntent {
  chainId: number;
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

  // Context
  chainId: number;              // cross-chain replay prevention
  requestId: string;            // pending policy ID or intent ID
  policyVersion: number;        // tx approval: current policy version binding
  accountIndex: number;         // BIP-44 account index
  content: string;              // approval reason / description

  // When
  expiresAt: number;            // unix timestamp
  nonce: number;                // per-approver scope

  // Signature
  sig: string;                  // Ed25519 sign(all fields except sig), hex
}

/**
 * ApprovalRequest — what the daemon sends to the app when approval is needed.
 */
export interface ApprovalRequest {
  requestId: string;
  type: ApprovalType;
  chainId: number;
  targetHash: string;

  accountIndex: number;         // BIP-44 account index
  content: string;              // approval reason / description

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
  chainId: number;
  requestId: string;
  policyVersion: number;
  accountIndex: number;
  content: string;
  expiresAt: number;
  nonce: number;
}
