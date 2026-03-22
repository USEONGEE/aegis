import { randomUUID, createHash } from 'node:crypto'
import { verifyApproval } from './approval-verifier.js'
import type { VerificationTarget } from './approval-verifier.js'
import { ApprovalTimeoutError } from './errors.js'
import type { SignedApproval, WdkStore, ApprovalType, ApprovalRequest, PendingApprovalRequest, PendingApprovalFilter, PolicyInput } from './wdk-store.js'
import type { Policy } from './guarded-middleware.js'
import type { EventEmitter } from 'node:events'

interface CreateRequestOptions {
  chainId: number
  targetHash: string
  requestId: string
  accountIndex: number
  content: string
  walletName: string
  policies: Policy[]
}

interface Waiter {
  resolve: (value: SignedApproval) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type PendableApprovalType = 'policy' | 'wallet_create' | 'wallet_delete'

// ---------------------------------------------------------------------------
// v0.4.2: ApprovalSubmitContext — discriminated union, No Optional
// ---------------------------------------------------------------------------

export type ApprovalSubmitContext =
  | { kind: 'tx'; expectedTargetHash: string }
  | { kind: 'policy_approval'; expectedTargetHash: string; policies: Policy[]; description: string }
  | { kind: 'policy_reject' }
  | { kind: 'device_revoke'; expectedTargetHash: string }
  | { kind: 'wallet_create' }
  | { kind: 'wallet_delete' }

/**
 * Unified approval broker for tx, policy, wallet, and device operations.
 */
export class SignedApprovalBroker {
  private _trustedApprovers: string[]
  private _store: WdkStore
  private _emitter: EventEmitter
  private _waiters: Map<string, Waiter>

  constructor (trustedApprovers: string[], store: WdkStore, emitter: EventEmitter) {
    this._trustedApprovers = trustedApprovers
    this._store = store
    this._emitter = emitter
    this._waiters = new Map()
  }

  /**
   * Create an approval request. Returns a request object.
   * Stores as pending for tx, policy, wallet_create, wallet_delete.
   */
  async createRequest (type: ApprovalType, { chainId, targetHash, requestId, accountIndex, content, walletName, policies }: CreateRequestOptions): Promise<ApprovalRequest> {
    const request: ApprovalRequest = {
      requestId,
      type,
      chainId,
      targetHash,
      accountIndex,
      content,
      createdAt: Date.now()
    }

    // Store pending for actionable requests (tx path removed — Decision simplified to ALLOW/REJECT)
    if (type === 'policy' || type === 'wallet_create' || type === 'wallet_delete') {
      const pending: PendingApprovalRequest = { ...request, walletName, policies }
      await this._store.savePendingApproval(accountIndex, pending)
    }

    if (type === 'policy') {
      this._emitter.emit('PendingPolicyRequested', {
        type: 'PendingPolicyRequested',
        requestId,
        chainId,
        timestamp: Date.now()
      })
    }

    return request
  }

  /**
   * Submit a signed approval. Verifies the signature, performs domain operations,
   * and emits events atomically.
   *
   * v0.4.2: 원자적 이벤트 발행.
   * - 도메인 처리(검증→도메인작업→히스토리) 완료 후 best-effort emit
   * - 중간 실패 시 ApprovalFailed만 emit
   * - 리스너 예외는 삼킴 (caller에 전파하지 않음)
   */
  async submitApproval (signedApproval: SignedApproval, context: ApprovalSubmitContext): Promise<void> {
    const { type, requestId } = signedApproval
    const pendingEvents: Array<{ name: string; payload: Record<string, unknown> }> = []

    // Build VerificationTarget from ApprovalSubmitContext
    const verificationTarget: VerificationTarget = 'expectedTargetHash' in context
      ? { kind: 'verify_hash', expectedTargetHash: context.expectedTargetHash }
      : { kind: 'skip_hash' }

    // ── 원자성 경계 시작 (도메인 처리) ──
    try {
      // Step 1: Verify using 6-step logic (throws on failure)
      await verifyApproval(signedApproval, this._trustedApprovers, this._store, verificationTarget)

      // Step 2: Type-specific domain operations (buffer events, don't emit yet)
      switch (type) {
        case 'policy': {
          // v0.4.2: savePolicy를 broker 내부에서 수행.
          // pending을 삭제하기 전에 먼저 읽어서 description을 확보.
          if (context.kind === 'policy_approval' && context.policies) {
            const pending = await this._store.loadPendingByRequestId(requestId)
            const description = context.description || (pending as PendingApprovalRequest | null)?.content || ''
            await this._store.savePolicy(
              signedApproval.accountIndex,
              signedApproval.chainId,
              { policies: context.policies, signature: {} },
              description
            )
          }
          await this._store.removePendingApproval(requestId)
          pendingEvents.push({
            name: 'PolicyApplied',
            payload: { type: 'PolicyApplied', requestId, chainId: signedApproval.chainId, timestamp: Date.now() }
          })
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
          pendingEvents.push({
            name: 'ApprovalRejected',
            payload: { type: 'ApprovalRejected', requestId, timestamp: Date.now() }
          })
          const waiter = this._waiters.get(requestId)
          if (waiter) {
            clearTimeout(waiter.timer)
            waiter.reject(new Error('Policy rejected by owner'))
            this._waiters.delete(requestId)
          }
          break
        }

        case 'device_revoke': {
          const targetHash = signedApproval.targetHash
          if (!targetHash) {
            throw new Error('device_revoke requires targetHash')
          }
          const signers = await this._store.listSigners()
          const target = signers.find(s => {
            const hash = '0x' + createHash('sha256').update(s.publicKey).digest('hex')
            return hash === targetHash
          })
          if (!target) {
            throw new Error('device_revoke target signer not found')
          }
          await this._store.revokeSigner(target.publicKey)
          // v0.4.2: setTrustedApprovers를 broker 내부에서 수행
          const activeSigs = signers.filter(s => s.publicKey !== target.publicKey && s.status.kind === 'active')
          this._trustedApprovers = activeSigs.map(s => s.publicKey)
          pendingEvents.push({
            name: 'SignerRevoked',
            payload: { type: 'SignerRevoked', requestId, publicKey: target.publicKey, timestamp: Date.now() }
          })
          break
        }

        case 'wallet_create': {
          const accountIndex = signedApproval.accountIndex
          const pending = await this._store.loadPendingByRequestId(requestId)
          const name = (pending as PendingApprovalRequest | null)?.walletName ?? `Wallet ${accountIndex}`
          await this._store.createWallet(accountIndex, name)
          await this._store.removePendingApproval(requestId)
          pendingEvents.push({
            name: 'WalletCreated',
            payload: { type: 'WalletCreated', requestId, accountIndex, name, timestamp: Date.now() }
          })
          break
        }

        case 'wallet_delete': {
          const accountIndex = signedApproval.accountIndex
          await this._store.removePendingApproval(requestId)
          await this._store.deleteWallet(accountIndex)
          pendingEvents.push({
            name: 'WalletDeleted',
            payload: { type: 'WalletDeleted', requestId, accountIndex, timestamp: Date.now() }
          })
          break
        }
      }

      // Step 3: Record in history
      await this._store.appendHistory({
        accountIndex: signedApproval.accountIndex,
        type,
        requestId,
        chainId: signedApproval.chainId,
        targetHash: signedApproval.targetHash,
        approver: signedApproval.approver,
        action: type === 'policy_reject' ? 'rejected' : 'approved',
        content: signedApproval.content,
        signedApproval,
        timestamp: Date.now()
      })
    } catch (err: unknown) {
      // ── 원자성 경계 실패: ApprovalFailed만 emit ──
      try {
        this._emitter.emit('ApprovalFailed', {
          type: 'ApprovalFailed',
          requestId,
          approvalType: type,
          error: (err as Error).message,
          timestamp: Date.now()
        })
      } catch { void 0 /* listener exception on ApprovalFailed — swallow. broker has no logger; daemon logs the original error. */ }
      throw err
    }
    // ── 원자성 경계 끝 ──

    // ── best-effort emit (경계 밖, 리스너 예외는 삼킴) ──
    try {
      this._emitter.emit('ApprovalVerified', {
        type: 'ApprovalVerified',
        requestId,
        approvalType: type,
        approver: signedApproval.approver,
        timestamp: Date.now()
      })
      for (const { name, payload } of pendingEvents) {
        this._emitter.emit(name, payload)
      }
    } catch { void 0 /* listener exception — swallow. listener bugs are not broker's responsibility. */ }
  }

  /**
   * Get pending approval requests.
   */
  async getPendingApprovals (filter: PendingApprovalFilter): Promise<PendingApprovalRequest[]> {
    return this._store.loadPendingApprovals(filter)
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
