import nacl from 'tweetnacl';
import { sha256 } from '@noble/hashes/sha256';
import type {
  SignedApproval,
  SignedApprovalPayload,
  ApprovalType,
} from './types';
import type { IdentityKeyPair } from '../identity/IdentityKeyManager';

/**
 * Compute SHA-256 hash of a string, returning a 0x-prefixed hex string.
 * Uses @noble/hashes for React Native compatibility (no node:crypto).
 */
function sha256Hex(input: string): string {
  const hash = sha256(new TextEncoder().encode(input));
  return '0x' + Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * SignedApprovalBuilder — builds and signs SignedApproval envelopes.
 *
 * All approval types (tx, policy, policy_reject, device_revoke) use the same
 * envelope format, signed with the device's Ed25519 identity key.
 *
 * The canonical signing payload is: JSON.stringify(sortedKeys(all fields except sig))
 * The sig field is: Ed25519.sign(SHA-256(canonicalJSON), secretKey) → hex string
 * This matches the verifier in approval-verifier.ts (computeApprovalHash).
 *
 * Nonce management: monotonically increasing per-device counter.
 * Stored in-memory; on app restart, fetched from daemon's last known nonce + 1.
 */

const DEFAULT_EXPIRY_SECONDS = 300; // 5 minutes

export class SignedApprovalBuilder {
  private keyPair: IdentityKeyPair;
  private nonce: number;

  constructor(
    keyPair: IdentityKeyPair,
    initialNonce?: number,
  ) {
    this.keyPair = keyPair;
    this.nonce = initialNonce ?? 0;
  }

  /**
   * Build SignedApproval for a transaction approval.
   */
  forTx(params: {
    targetHash: string;
    chainId: number;
    requestId: string;
    accountIndex: number;
    content: string;
    policyVersion: number;
    expiresInSeconds?: number;
  }): SignedApproval {
    return this.build({
      type: 'tx',
      ...params,
    });
  }

  /**
   * Build SignedApproval for a policy approval.
   */
  forPolicy(params: {
    targetHash: string;
    chainId: number;
    requestId: string;
    accountIndex: number;
    content: string;
    expiresInSeconds?: number;
  }): SignedApproval {
    return this.build({
      type: 'policy',
      policyVersion: 0,
      ...params,
    });
  }

  /**
   * Build SignedApproval for a policy rejection.
   */
  forPolicyReject(params: {
    targetHash: string;
    chainId: number;
    requestId: string;
    accountIndex: number;
    content: string;
    expiresInSeconds?: number;
  }): SignedApproval {
    return this.build({
      type: 'policy_reject',
      policyVersion: 0,
      ...params,
    });
  }

  /**
   * Build SignedApproval for a device revocation.
   * targetHash = SHA-256(publicKey of the signer being revoked).
   */
  forDeviceRevoke(params: {
    targetPublicKey: string;
    chainId: number;
    accountIndex: number;
    content: string;
    expiresInSeconds?: number;
  }): SignedApproval {
    // targetHash for device revoke = SHA-256(publicKey)
    // Must match: createHash('sha256').update(publicKey).digest('hex') in approval-verifier
    const targetHash = sha256Hex(params.targetPublicKey);

    return this.build({
      type: 'device_revoke',
      targetHash,
      chainId: params.chainId,
      requestId: `revoke_${params.targetPublicKey.slice(0, 16)}`,
      accountIndex: params.accountIndex,
      content: params.content,
      policyVersion: 0,
      expiresInSeconds: params.expiresInSeconds,
    });
  }

  /**
   * Build SignedApproval for wallet lifecycle (create/delete).
   */
  forWallet(params: {
    type: 'wallet_create' | 'wallet_delete';
    targetHash: string;
    chainId: number;
    requestId: string;
    accountIndex: number;
    content: string;
  }): SignedApproval {
    return this.build({
      type: params.type,
      targetHash: params.targetHash,
      chainId: params.chainId,
      requestId: params.requestId,
      accountIndex: params.accountIndex,
      content: params.content,
      policyVersion: 0,
    });
  }

  /**
   * Internal: build and sign the envelope.
   */
  private build(params: {
    type: ApprovalType;
    targetHash: string;
    chainId: number;
    requestId: string;
    accountIndex: number;
    content: string;
    policyVersion: number;
    expiresInSeconds?: number;
  }): SignedApproval {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + (params.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS);
    // Timestamp-based nonce: always monotonically increasing across app restarts.
    // Daemon stores lastNonce per-approver; counter-based nonce resets on restart → replay error.
    const currentNonce = Date.now();

    const approver = '0x' + Array.from(this.keyPair.publicKey)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const payload: SignedApprovalPayload = {
      type: params.type,
      targetHash: params.targetHash,
      approver,
      chainId: params.chainId,
      requestId: params.requestId,
      policyVersion: params.policyVersion,
      accountIndex: params.accountIndex,
      content: params.content,
      expiresAt,
      nonce: currentNonce,
    };

    // Canonical JSON for signing: sorted keys, no whitespace
    const sortedPayload: Record<string, unknown> = {};
    for (const key of Object.keys(payload).sort()) {
      sortedPayload[key] = (payload as unknown as Record<string, unknown>)[key];
    }
    const canonicalJSON = JSON.stringify(sortedPayload);

    // SHA-256 hash of canonical JSON before signing (matches approval-verifier's computeApprovalHash)
    const hashBytes = sha256(new TextEncoder().encode(canonicalJSON));

    // Ed25519 detached signature over the SHA-256 hash (not raw JSON)
    const signature = nacl.sign.detached(hashBytes, this.keyPair.secretKey);
    const sigHex = '0x' + Array.from(signature)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return {
      ...payload,
      sig: sigHex,
    };
  }

  /**
   * Get current nonce (for sync with daemon).
   */
  getNonce(): number {
    return this.nonce;
  }

  /**
   * Set nonce (after fetching last known nonce from daemon).
   */
  setNonce(nonce: number): void {
    this.nonce = nonce;
  }
}
