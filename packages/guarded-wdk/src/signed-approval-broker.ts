import { randomUUID } from 'node:crypto'
import { verifyApproval } from './approval-verifier.js'
import type { VerificationContext } from './approval-verifier.js'
import { ApprovalTimeoutError } from './errors.js'
import type { SignedApproval, ApprovalStore, ApprovalType, ApprovalRequest, PendingApprovalRequest } from './approval-store.js'
import type { EventEmitter } from 'node:events'

interface CreateRequestOptions {
  chainId: number
  targetHash: string
  requestId?: string
  metadata?: Record<string, unknown>
}

interface Waiter {
  resolve: (value: SignedApproval) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Unified approval broker for tx, policy, and device operations.
 * Replaces InMemoryApprovalBroker with signature-based verification.
 */
export class SignedApprovalBroker {
  private _trustedApprovers: string[]
  private _store: ApprovalStore
  private _emitter: EventEmitter | undefined
  private _waiters: Map<string, Waiter>

  constructor (trustedApprovers: string[], store: ApprovalStore, emitter?: EventEmitter) {
    this._trustedApprovers = trustedApprovers
    this._store = store
    this._emitter = emitter
    this._waiters = new Map()
  }

  /**
   * Create an approval request. Returns a request object.
   * Stores as pending if type is 'policy' or tx.
   */
  async createRequest (type: ApprovalType, { chainId, targetHash, requestId, metadata }: CreateRequestOptions): Promise<ApprovalRequest> {
    const id = requestId || randomUUID()
    const request: ApprovalRequest = {
      requestId: id,
      type,
      chainId,
      targetHash,
      metadata,
      createdAt: Date.now()
    }

    // Store pending for policy requests
    if (type === 'policy' || type === 'tx') {
      const seedId = metadata?.seedId as string | undefined
      if (seedId) {
        await this._store.savePendingApproval(seedId, request)
      }
    }

    if (this._emitter) {
      if (type === 'policy') {
        this._emitter.emit('PendingPolicyRequested', {
          type: 'PendingPolicyRequested',
          requestId: id,
          chainId,
          timestamp: Date.now()
        })
      }
    }

    return request
  }

  /**
   * Submit a signed approval. Verifies the signature and resolves the waiting promise.
   */
  async submitApproval (signedApproval: SignedApproval, context: VerificationContext = {}): Promise<void> {
    // Verify using 6-step logic (throws on failure)
    await verifyApproval(signedApproval, this._trustedApprovers, this._store, context)

    const { type, requestId } = signedApproval

    // Emit verification success
    if (this._emitter) {
      this._emitter.emit('ApprovalVerified', {
        type: 'ApprovalVerified',
        requestId,
        approvalType: type,
        approver: signedApproval.approver,
        timestamp: Date.now()
      })
    }

    // Type-specific post-processing
    switch (type) {
      case 'tx': {
        // Resolve waiting tx promise
        const waiter = this._waiters.get(requestId)
        if (waiter) {
          clearTimeout(waiter.timer)
          waiter.resolve(signedApproval)
          this._waiters.delete(requestId)
        }
        break
      }

      case 'policy': {
        // Remove from pending, apply policy
        await this._store.removePendingApproval(requestId)
        if (this._emitter) {
          this._emitter.emit('PolicyApplied', {
            type: 'PolicyApplied',
            requestId,
            chainId: signedApproval.chainId,
            timestamp: Date.now()
          })
        }
        // Resolve waiting policy promise if any
        const waiter = this._waiters.get(requestId)
        if (waiter) {
          clearTimeout(waiter.timer)
          waiter.resolve(signedApproval)
          this._waiters.delete(requestId)
        }
        break
      }

      case 'policy_reject': {
        await this._store.removePendingApproval(requestId)
        if (this._emitter) {
          this._emitter.emit('ApprovalRejected', {
            type: 'ApprovalRejected',
            requestId,
            timestamp: Date.now()
          })
        }
        const waiter = this._waiters.get(requestId)
        if (waiter) {
          clearTimeout(waiter.timer)
          waiter.reject(new Error('Policy rejected by owner'))
          this._waiters.delete(requestId)
        }
        break
      }

      case 'device_revoke': {
        // Extract deviceId from metadata -- no fallback to requestId
        const deviceId = (signedApproval.metadata as Record<string, unknown> | undefined)?.deviceId as string | undefined
        if (!deviceId) {
          throw new Error('device_revoke requires metadata.deviceId')
        }
        await this._store.revokeDevice(deviceId)
        if (this._emitter) {
          this._emitter.emit('DeviceRevoked', {
            type: 'DeviceRevoked',
            deviceId,
            timestamp: Date.now()
          })
        }
        break
      }
    }

    // Record in history
    await this._store.appendHistory({
      seedId: ((signedApproval.metadata as Record<string, unknown> | undefined)?.seedId as string) || '',
      type,
      requestId,
      chainId: signedApproval.chainId,
      targetHash: signedApproval.targetHash,
      approver: signedApproval.approver,
      deviceId: signedApproval.deviceId,
      action: type === 'policy_reject' ? 'rejected' : 'approved',
      timestamp: Date.now()
    })
  }

  /**
   * Wait for a signed approval to arrive for a given request.
   * Returns a Promise that resolves when submitApproval is called with matching requestId.
   */
  waitForApproval (requestId: string, timeoutMs: number = 60000): Promise<SignedApproval> {
    return new Promise<SignedApproval>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._waiters.delete(requestId)
        reject(new ApprovalTimeoutError(requestId))
      }, timeoutMs)

      this._waiters.set(requestId, { resolve, reject, timer })
    })
  }

  /**
   * Get pending approval requests.
   */
  async getPendingApprovals (seedId: string, type: string | null, chainId: number | null): Promise<PendingApprovalRequest[]> {
    return this._store.loadPendingApprovals(seedId, type, chainId)
  }

  /**
   * Update trusted approvers list.
   */
  setTrustedApprovers (approvers: string[]): void {
    this._trustedApprovers = [...approvers]
  }

  /**
   * Cleanup on dispose.
   */
  dispose (): void {
    for (const [, waiter] of this._waiters) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('Broker disposed'))
    }
    this._waiters.clear()
  }
}
