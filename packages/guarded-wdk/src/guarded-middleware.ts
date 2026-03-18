import { randomUUID } from 'node:crypto'
import { intentHash } from '@wdk-app/canonical'
import { ForbiddenError, PolicyRejectionError } from './errors.js'
import type { SignedApprovalBroker } from './signed-approval-broker.js'
import type { EventEmitter } from 'node:events'

// --- Policy types ---

type Decision = 'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'

export interface ArgCondition {
  condition: 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'ONE_OF' | 'NOT_ONE_OF'
  value: string | string[]
}

export interface Permission {
  target?: string
  selector?: string
  args?: Record<string, ArgCondition>
  valueLimit?: string | number
  decision: Decision
}

export interface CallPolicy {
  type: 'call'
  permissions: Permission[]
}

export interface TimestampPolicy {
  type: 'timestamp'
  validAfter?: number
  validUntil?: number
}

export type Policy = CallPolicy | TimestampPolicy

export interface ChainPolicyConfig {
  policies: Policy[]
  [key: string]: unknown
}

export type ChainPolicies = Record<string, ChainPolicyConfig>

interface Transaction {
  to?: string
  value?: string | number | bigint | null
  data?: string
}

interface TransferOptions {
  token?: string
  recipient?: string
  amount?: string | number | bigint
}

interface TransactionResult {
  hash: string
  fee: bigint
}

interface TransactionReceipt {
  status: number
}

interface GuardedAccount {
  sendTransaction: (tx: Transaction) => Promise<TransactionResult>
  transfer: (options: TransferOptions) => Promise<TransactionResult>
  sign: (...args: unknown[]) => never
  signTypedData: (...args: unknown[]) => never
  dispose: (...args: unknown[]) => never
  keyPair: unknown
  getAddress: () => Promise<string>
  getTransactionReceipt: (hash: string) => Promise<TransactionReceipt | null>
  [key: string]: unknown
}

export interface EvaluationResult {
  decision: Decision
  matchedPermission: Permission | null
  reason: string
}

interface MiddlewareConfig {
  policiesRef: () => ChainPolicies
  approvalBroker: SignedApprovalBroker
  emitter: EventEmitter
  chain: string
}

function validatePolicy (policy: Policy): void {
  if (!policy || typeof policy !== 'object') {
    throw new Error('Policy must be an object.')
  }
  if (!policy.type) {
    throw new Error("Policy must have a 'type' field.")
  }
  if (policy.type === 'call') {
    if (!Array.isArray(policy.permissions)) {
      throw new Error("Call policy must have a 'permissions' array.")
    }
    for (const perm of policy.permissions) {
      if (!perm.decision) {
        throw new Error("Each permission must have a 'decision' field.")
      }
      if (!['AUTO', 'REQUIRE_APPROVAL', 'REJECT'].includes(perm.decision)) {
        throw new Error(`Invalid decision: ${perm.decision}`)
      }
      if (perm.args) {
        for (const [, cond] of Object.entries(perm.args)) {
          if (!cond.condition) {
            throw new Error("Each arg condition must have a 'condition' field.")
          }
          const valid = ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'ONE_OF', 'NOT_ONE_OF']
          if (!valid.includes(cond.condition)) {
            throw new Error(`Invalid condition operator: ${cond.condition}`)
          }
        }
      }
    }
  } else if (policy.type === 'timestamp') {
    // validAfter and validUntil are optional
  } else {
    throw new Error(`Unsupported policy type: ${(policy as { type: string }).type}`)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validatePolicies (policies: Policy[] | any[]): void {
  if (!Array.isArray(policies)) {
    throw new Error('Policies must be an array.')
  }
  for (const policy of policies) {
    validatePolicy(policy)
  }
}

function matchCondition (condition: string, actual: string, expected: string | string[]): boolean {
  const a = BigInt(actual)
  switch (condition) {
    case 'EQ': return actual.toLowerCase?.() === (expected as string).toLowerCase?.() || a === BigInt(expected as string)
    case 'NEQ': return actual.toLowerCase?.() !== (expected as string).toLowerCase?.() && a !== BigInt(expected as string)
    case 'GT': return a > BigInt(expected as string)
    case 'GTE': return a >= BigInt(expected as string)
    case 'LT': return a < BigInt(expected as string)
    case 'LTE': return a <= BigInt(expected as string)
    case 'ONE_OF': return (expected as string[]).some(v => actual.toLowerCase?.() === v.toLowerCase?.() || a === BigInt(v))
    case 'NOT_ONE_OF': return !(expected as string[]).some(v => actual.toLowerCase?.() === v.toLowerCase?.() || a === BigInt(v))
    default: return false
  }
}

function extractArg (data: string, index: number): string | null {
  if (!data || data.length < 10) return null
  const offset = 10 + index * 64
  const hex = data.slice(offset, offset + 64)
  if (!hex || hex.length === 0) return null
  return '0x' + hex
}

function matchArgs (data: string, argConditions: Record<string, ArgCondition>): boolean {
  for (const [indexStr, cond] of Object.entries(argConditions)) {
    const index = parseInt(indexStr, 10)
    const actual = extractArg(data, index)
    if (actual === null) return false
    if (!matchCondition(cond.condition, actual, cond.value)) return false
  }
  return true
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function evaluatePolicy (chainPolicies: ChainPolicies | Record<string, any>, chain: string, tx: Transaction): EvaluationResult {
  const config = chainPolicies[chain]
  if (!config || !config.policies) {
    return { decision: 'REJECT', matchedPermission: null, reason: 'no policies for chain' }
  }

  const { policies } = config

  for (const policy of policies) {
    if (policy.type === 'timestamp') {
      const now = Date.now() / 1000
      if (policy.validAfter && now < policy.validAfter) {
        return { decision: 'REJECT', matchedPermission: null, reason: 'too early' }
      }
      if (policy.validUntil && now > policy.validUntil) {
        return { decision: 'REJECT', matchedPermission: null, reason: 'expired' }
      }
    }
  }

  const callPolicy = (policies as Policy[]).find((p): p is CallPolicy => p.type === 'call')
  if (!callPolicy) {
    return { decision: 'REJECT', matchedPermission: null, reason: 'no call policy' }
  }

  const txTo = tx.to?.toLowerCase?.()
  const txSelector = tx.data?.slice?.(0, 10)

  if (!txTo) {
    return { decision: 'REJECT', matchedPermission: null, reason: 'missing tx.to' }
  }

  if (!tx.data || tx.data.length < 10) {
    return { decision: 'REJECT', matchedPermission: null, reason: 'missing or invalid tx.data' }
  }

  for (const perm of callPolicy.permissions) {
    if (perm.target && perm.target.toLowerCase() !== txTo) continue
    if (perm.selector && perm.selector !== txSelector) continue
    if (perm.args && !matchArgs(tx.data, perm.args)) continue
    if (perm.valueLimit !== undefined && BigInt(tx.value || 0) > BigInt(perm.valueLimit)) continue
    return { decision: perm.decision, matchedPermission: perm, reason: 'matched' }
  }

  return { decision: 'REJECT', matchedPermission: null, reason: 'no matching permission' }
}

async function pollReceipt (account: GuardedAccount, hash: string, emitter: EventEmitter, requestId: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const receipt = await account.getTransactionReceipt(hash)
      if (receipt) {
        emitter.emit('ExecutionSettled', {
          type: 'ExecutionSettled',
          requestId,
          hash,
          status: receipt.status,
          confirmedAt: Date.now(),
          timestamp: Date.now()
        })
        return
      }
    } catch {
      // ignore polling errors
    }
    await new Promise<void>(resolve => setTimeout(resolve, 1000))
  }
}

export function createGuardedMiddleware ({ policiesRef, approvalBroker, emitter, chain }: MiddlewareConfig): (account: GuardedAccount) => Promise<void> {
  return async (account: GuardedAccount) => {
    const rawSendTransaction = account.sendTransaction.bind(account)
    const rawTransfer = account.transfer.bind(account)

    account.sign = () => { throw new ForbiddenError('sign') }
    account.signTypedData = () => { throw new ForbiddenError('signTypedData') }
    account.dispose = () => { throw new ForbiddenError('dispose') }
    Object.defineProperty(account, 'keyPair', {
      get () { throw new ForbiddenError('keyPair') },
      configurable: true
    })

    account.sendTransaction = async (tx: Transaction): Promise<TransactionResult> => {
      const policies = policiesRef()
      const requestId = randomUUID()

      emitter.emit('IntentProposed', {
        type: 'IntentProposed',
        requestId,
        tx: { to: tx.to, data: tx.data?.slice?.(0, 10), value: tx.value },
        chain,
        timestamp: Date.now()
      })

      const { decision, matchedPermission, reason } = evaluatePolicy(policies, chain, tx)

      emitter.emit('PolicyEvaluated', {
        type: 'PolicyEvaluated',
        requestId,
        decision,
        matchedPermission,
        reason,
        timestamp: Date.now()
      })

      if (decision === 'REJECT') {
        throw new PolicyRejectionError(reason)
      }

      if (decision === 'REQUIRE_APPROVAL') {
        const targetHash = intentHash({
          chain,
          to: tx.to!,
          data: tx.data!,
          value: String(tx.value || '0')
        })

        emitter.emit('ApprovalRequested', {
          type: 'ApprovalRequested',
          requestId,
          target: tx.to,
          selector: tx.data?.slice?.(0, 10),
          targetHash,
          timestamp: Date.now()
        })

        const request = await approvalBroker.createRequest('tx', {
          requestId,
          chain,
          targetHash,
          metadata: {
            walletAddress: await account.getAddress(),
            target: tx.to,
            selector: tx.data?.slice?.(0, 10)
          }
        })

        const signedApproval = await approvalBroker.waitForApproval(request.requestId, 60000)

        emitter.emit('ApprovalGranted', {
          type: 'ApprovalGranted',
          requestId,
          approver: signedApproval.approver,
          timestamp: Date.now()
        })
      }

      let result: TransactionResult
      try {
        result = await rawSendTransaction(tx)
      } catch (err: unknown) {
        emitter.emit('ExecutionFailed', {
          type: 'ExecutionFailed',
          requestId,
          error: (err as Error).message,
          timestamp: Date.now()
        })
        throw err
      }

      emitter.emit('ExecutionBroadcasted', {
        type: 'ExecutionBroadcasted',
        requestId,
        hash: result.hash,
        fee: result.fee,
        timestamp: Date.now()
      })

      pollReceipt(account, result.hash, emitter, requestId)

      return result
    }

    account.transfer = async (options: TransferOptions): Promise<TransactionResult> => {
      const to = options.token || options.recipient
      const value = options.token ? 0 : options.amount
      const mockTx: Transaction = { to, value, data: '0x' }

      if (options.token) {
        const iface = '0xa9059cbb'
        const recipient = (options.recipient || '').replace('0x', '').padStart(64, '0')
        const amount = BigInt(options.amount || 0).toString(16).padStart(64, '0')
        mockTx.to = options.token
        mockTx.data = iface + recipient + amount
        mockTx.value = 0
      }

      const policies = policiesRef()
      const requestId = randomUUID()

      emitter.emit('IntentProposed', {
        type: 'IntentProposed',
        requestId,
        tx: { to: mockTx.to, data: mockTx.data?.slice?.(0, 10), value: mockTx.value },
        chain,
        timestamp: Date.now()
      })

      const { decision, matchedPermission, reason } = evaluatePolicy(policies, chain, mockTx)

      emitter.emit('PolicyEvaluated', {
        type: 'PolicyEvaluated',
        requestId,
        decision,
        matchedPermission,
        reason,
        timestamp: Date.now()
      })

      if (decision === 'REJECT') {
        throw new PolicyRejectionError(reason)
      }

      if (decision === 'REQUIRE_APPROVAL') {
        const targetHash = intentHash({
          chain,
          to: mockTx.to!,
          data: mockTx.data!,
          value: String(mockTx.value || '0')
        })

        emitter.emit('ApprovalRequested', {
          type: 'ApprovalRequested',
          requestId,
          target: mockTx.to,
          selector: mockTx.data?.slice?.(0, 10),
          targetHash,
          timestamp: Date.now()
        })

        const request = await approvalBroker.createRequest('tx', {
          requestId,
          chain,
          targetHash,
          metadata: {
            target: mockTx.to,
            selector: mockTx.data?.slice?.(0, 10)
          }
        })

        const signedApproval = await approvalBroker.waitForApproval(request.requestId, 60000)

        emitter.emit('ApprovalGranted', {
          type: 'ApprovalGranted',
          requestId,
          approver: signedApproval.approver,
          timestamp: Date.now()
        })
      }

      let result: TransactionResult
      try {
        result = await rawTransfer(options)
      } catch (err: unknown) {
        emitter.emit('ExecutionFailed', {
          type: 'ExecutionFailed',
          requestId,
          error: (err as Error).message,
          timestamp: Date.now()
        })
        throw err
      }

      emitter.emit('ExecutionBroadcasted', {
        type: 'ExecutionBroadcasted',
        requestId,
        hash: result.hash,
        fee: result.fee,
        timestamp: Date.now()
      })

      pollReceipt(account, result.hash, emitter, requestId)

      return result
    }
  }
}
