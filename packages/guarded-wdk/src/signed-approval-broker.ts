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
  accountIndex: number
  content: string
  walletName?: string
}

interface Waiter {
  resolve: (value: SignedApproval) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Unified approval broker for tx, policy, wallet, and device operations.
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
   * Stores as pending for tx, policy, wallet_create, wallet_delete.
   */
  async createRequest (type: ApprovalType, { chainId, targetHash, requestId, accountIndex, content, walletName }: CreateRequestOptions): Promise<ApprovalRequest> {
    const id = requestId || randomUUID()
    const request: ApprovalRequest = {
      requestId: id,
      type,
      chainId,
      targetHash,
      accountIndex,
      content,
      createdAt: Date.now()
    }

    // Store pending for actionable requests
    if (type === 'policy' || type === 'tx' || type === 'wallet_create' || type === 'wallet_delete') {
      const pending: PendingApprovalRequest = walletName
        ? { ...request, walletName }
        : request
      await this._store.savePendingApproval(accountIndex, pending)
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
        const signerId = signedApproval.signerId
        if (!signerId) {
          throw new Error('device_revoke requires signerId')
        }
        await this._store.revokeSigner(signerId)
        if (this._emitter) {
          this._emitter.emit('SignerRevoked', {
            type: 'SignerRevoked',
            signerId,
            timestamp: Date.now()
          })
        }
        break
      }

      case 'wallet_create': {
        const accountIndex = signedApproval.accountIndex
        // Read wallet name from pending request (single source of truth)
        const pending = await this._store.loadPendingByRequestId(requestId)
        const name = (pending as PendingApprovalRequest | null)?.walletName || `Wallet ${accountIndex}`
        // Address should be derived externally and passed via control flow
        // For now, use a placeholder that the daemon will replace
        await this._store.createWallet(accountIndex, name, '')
        await this._store.removePendingApproval(requestId)
        if (this._emitter) {
          this._emitter.emit('WalletCreated', {
            type: 'WalletCreated',
            accountIndex,
            name,
            timestamp: Date.now()
          })
        }
        break
      }

      case 'wallet_delete': {
        const accountIndex = signedApproval.accountIndex
        await this._store.removePendingApproval(requestId)
        await this._store.deleteWallet(accountIndex)
        if (this._emitter) {
          this._emitter.emit('WalletDeleted', {
            type: 'WalletDeleted',
            accountIndex,
            timestamp: Date.now()
          })
        }
        break
      }
    }

    // Record in history
    await this._store.appendHistory({
      accountIndex: signedApproval.accountIndex,
      type,
      requestId,
      chainId: signedApproval.chainId,
      targetHash: signedApproval.targetHash,
      approver: signedApproval.approver,
      signerId: signedApproval.signerId,
      action: type === 'policy_reject' ? 'rejected' : 'approved',
      content: signedApproval.content,
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
  async getPendingApprovals (accountIndex: number | null, type: string | null, chainId: number | null): Promise<PendingApprovalRequest[]> {
    return this._store.loadPendingApprovals(accountIndex, type, chainId)
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
