export class ForbiddenError extends Error {
  constructor (method: string) {
    super(`Access to '${method}' is forbidden through GuardedAccount.`)
    this.name = 'ForbiddenError'
  }
}

export class PolicyRejectionError extends Error {
  constructor (reason?: string) {
    super(reason || 'Policy rejected the transaction.')
    this.name = 'PolicyRejectionError'
  }
}

export class ApprovalTimeoutError extends Error {
  constructor (requestId: string) {
    super(`Approval timed out for request: ${requestId}`)
    this.name = 'ApprovalTimeoutError'
  }
}

export class SignatureError extends Error {
  constructor (detail?: string) {
    super(`Signature verification failed: ${detail || 'invalid signature'}`)
    this.name = 'SignatureError'
  }
}

export class UntrustedApproverError extends Error {
  constructor (approver: string) {
    super(`Approver not in trustedApprovers: ${approver}`)
    this.name = 'UntrustedApproverError'
  }
}

export class DeviceRevokedError extends Error {
  constructor (deviceId: string) {
    super(`Device has been revoked: ${deviceId}`)
    this.name = 'DeviceRevokedError'
  }
}

export class ApprovalExpiredError extends Error {
  constructor (expiresAt: number) {
    super(`Approval has expired at ${expiresAt}`)
    this.name = 'ApprovalExpiredError'
  }
}

export class ReplayError extends Error {
  constructor (nonce: number, lastNonce: number) {
    super(`Nonce replay detected: ${nonce} <= ${lastNonce}`)
    this.name = 'ReplayError'
  }
}
