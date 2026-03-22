import { verify } from './crypto-utils.js'
import { canonicalJSON } from '@wdk-app/canonical'
import { createHash } from 'node:crypto'
import {
  UntrustedApproverError,
  SignerRevokedError,
  SignatureError,
  ApprovalExpiredError,
  ReplayError
} from './errors.js'
import type { SignedApproval, WdkStore } from './wdk-store.js'

export type VerificationTarget =
  | { kind: 'verify_hash'; expectedTargetHash: string }
  | { kind: 'skip_hash' }

/**
 * Compute canonical hash of all SignedApproval fields except `sig`.
 */
function computeApprovalHash (approval: SignedApproval): Buffer {
  const { sig: _sig, ...fields } = approval
  const json = canonicalJSON(fields as Parameters<typeof canonicalJSON>[0])
  return createHash('sha256').update(json).digest()
}

/**
 * 6-step verification of a SignedApproval.
 * Throws specific error on any failure.
 * Must be called inside WDK -- daemon/AI cannot bypass.
 */
export async function verifyApproval (
  signedApproval: SignedApproval,
  trustedApprovers: string[],
  store: WdkStore,
  target: VerificationTarget = { kind: 'skip_hash' }
): Promise<void> {
  const { type, targetHash, approver, policyVersion, expiresAt, nonce, sig } = signedApproval

  // Step 1: approver in trustedApprovers?
  if (!trustedApprovers.includes(approver)) {
    throw new UntrustedApproverError(approver)
  }

  // Step 2: approver not revoked?
  const revoked = await store.isSignerRevoked(approver)
  if (revoked) {
    throw new SignerRevokedError(approver)
  }

  // Step 3: Ed25519 signature verification
  const hash = computeApprovalHash(signedApproval)
  const valid = verify(hash, sig, approver)
  if (!valid) {
    throw new SignatureError('Ed25519 verification failed')
  }

  // Step 4: expiration check
  const now = Math.floor(Date.now() / 1000)
  if (expiresAt <= now) {
    throw new ApprovalExpiredError(expiresAt)
  }

  // Step 5: nonce replay check (per-approver)
  const lastNonce = await store.getLastNonce(approver)
  if (nonce <= lastNonce) {
    throw new ReplayError(nonce, lastNonce)
  }

  // Step 6: type-specific validation
  const expectedHash = target.kind === 'verify_hash' ? target.expectedTargetHash : null

  switch (type) {
    case 'tx':
      if (expectedHash !== null && targetHash !== expectedHash) {
        throw new SignatureError(`targetHash mismatch: expected ${expectedHash}, got ${targetHash}`)
      }
      break

    case 'policy':
      if (expectedHash !== null && targetHash !== expectedHash) {
        throw new SignatureError(`policyHash mismatch: expected ${expectedHash}, got ${targetHash}`)
      }
      break

    case 'policy_reject':
      // No additional validation needed beyond signature
      break

    case 'device_revoke': {
      // targetHash should be SHA-256 of the publicKey being revoked.
      if (expectedHash !== null && targetHash !== expectedHash) {
        throw new SignatureError(`device_revoke targetHash mismatch: expected ${expectedHash}, got ${targetHash}`)
      }
      break
    }

    default:
      throw new SignatureError(`Unknown approval type: ${type as string}`)
  }

  // All 6 steps passed -- update nonce
  await store.updateNonce(approver, nonce)
}
