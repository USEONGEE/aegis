import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import type {
  SignedApproval,
  SignedApprovalPayload,
  ApprovalType,
} from './types';
import type { IdentityKeyPair } from '../identity/IdentityKeyManager';

/**
 * Compute SHA-256 hash of a string, returning a 0x-prefixed hex string.
 * Pure JS implementation compatible with React Native (no node:crypto).
 * Must produce identical output to: createHash('sha256').update(input).digest('hex')
 */
function sha256Hex(input: string): string {
  const data = new TextEncoder().encode(input);
  return '0x' + jsSha256(data);
}

/**
 * Minimal pure-JS SHA-256 (synchronous).
 * Produces hex string from Uint8Array input.
 */
function jsSha256(data: Uint8Array): string {
  // SHA-256 constants
  const K: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  // Pre-processing: padding
  const bitLen = data.length * 8;
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen, false);

  const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

  // Process each 512-bit block
  for (let offset = 0; offset < padded.length; offset += 64) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i-15], 7) ^ rotr(w[i-15], 18) ^ (w[i-15] >>> 3);
      const s1 = rotr(w[i-2], 17) ^ rotr(w[i-2], 19) ^ (w[i-2] >>> 2);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const toHex = (n: number) => n.toString(16).padStart(8, '0');
  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7);
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
    const currentNonce = ++this.nonce;

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
    const hashHex = jsSha256(new TextEncoder().encode(canonicalJSON));
    const hashBytes = new Uint8Array(hashHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));

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
