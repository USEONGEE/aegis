import { verify } from './crypto-utils.js'
import { canonicalJSON } from '@wdk-app/canonical'
import { createHash } from 'node:crypto'
import {
  UntrustedApproverError,
  DeviceRevokedError,
  SignatureError,
  ApprovalExpiredError,
  ReplayError
} from './errors.js'
import type { SignedApproval, ApprovalStore } from './approval-store.js'

export interface VerificationContext {
  currentPolicyVersion?: number
  expectedTargetHash?: string
}

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
  store: ApprovalStore,
  context: VerificationContext = {}
): Promise<void> {
  const { type, targetHash, approver, deviceId, policyVersion, expiresAt, nonce, sig } = signedApproval

  // Step 1: approver in trustedApprovers?
  if (!trustedApprovers.includes(approver)) {
    throw new UntrustedApproverError(approver)
  }

  // Step 2: deviceId not revoked?
  const revoked = await store.isDeviceRevoked(deviceId)
  if (revoked) {
    throw new DeviceRevokedError(deviceId)
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

  // Step 5: nonce replay check (per-approver-per-device)
  const lastNonce = await store.getLastNonce(approver, deviceId)
  if (nonce <= lastNonce) {
    throw new ReplayError(nonce, lastNonce)
  }

  // Step 6: type-specific validation
  switch (type) {
    case 'tx':
      if (context.expectedTargetHash && targetHash !== context.expectedTargetHash) {
        throw new SignatureError(`targetHash mismatch: expected ${context.expectedTargetHash}, got ${targetHash}`)
      }
      if (context.currentPolicyVersion !== undefined && policyVersion !== context.currentPolicyVersion) {
        throw new SignatureError(`policyVersion mismatch: expected ${context.currentPolicyVersion}, got ${policyVersion}`)
      }
      break

    case 'policy':
      if (context.expectedTargetHash && targetHash !== context.expectedTargetHash) {
        throw new SignatureError(`policyHash mismatch: expected ${context.expectedTargetHash}, got ${targetHash}`)
      }
      break

    case 'policy_reject':
      // No additional validation needed beyond signature
      break

    case 'device_revoke': {
      // targetHash should be SHA-256 of the deviceId being revoked.
      // context.expectedTargetHash is SHA-256(deviceId) computed by the caller.
      if (context.expectedTargetHash && targetHash !== context.expectedTargetHash) {
        throw new SignatureError(`device_revoke targetHash mismatch: expected ${context.expectedTargetHash}, got ${targetHash}`)
      }
      break
    }

    default:
      throw new SignatureError(`Unknown approval type: ${type as string}`)
  }

  // All 6 steps passed -- update nonce
  await store.updateNonce(approver, deviceId, nonce)
}
