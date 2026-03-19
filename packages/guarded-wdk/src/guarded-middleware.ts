import { randomUUID, createHash } from 'node:crypto'
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

export interface Rule {
  order: number
  args?: Record<string, ArgCondition>
  valueLimit?: string | number
  decision: Decision
}

export interface PermissionDict {
  [target: string]: {
    [selector: string]: Rule[]
  }
}

export interface CallPolicy {
  type: 'call'
  permissions: PermissionDict
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

export type ChainPolicies = Record<number, ChainPolicyConfig>

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

export interface SignTransactionResult {
  signedTx: string
  intentHash: string
  requestId: string
  intentId: string
}

interface TransactionReceipt {
  status: number
}

interface GuardedAccount {
  sendTransaction: (tx: Transaction) => Promise<TransactionResult>
  signTransaction?: (tx: Transaction) => Promise<SignTransactionResult>
  transfer: (options: TransferOptions) => Promise<TransactionResult>
  sign: (...args: unknown[]) => never
  signTypedData?: (...args: unknown[]) => never
  dispose: (...args: unknown[]) => never
  keyPair: unknown
  getAddress: () => Promise<string>
  getTransactionReceipt: (hash: string) => Promise<TransactionReceipt | null>
  [key: string]: unknown
}

export interface EvaluationResult {
  decision: Decision
  matchedPermission: Rule | null
  reason: string
}

interface MiddlewareConfig {
  policiesRef: () => ChainPolicies
  approvalBroker: SignedApprovalBroker
  emitter: EventEmitter
  chainId: number
}

function validatePolicy (policy: Policy): void {
  if (!policy || typeof policy !== 'object') {
    throw new Error('Policy must be an object.')
  }
  if (!policy.type) {
    throw new Error("Policy must have a 'type' field.")
  }
  if (policy.type === 'call') {
    if (!policy.permissions || typeof policy.permissions !== 'object') {
      throw new Error("Call policy must have a 'permissions' object.")
    }
    for (const [, selectorMap] of Object.entries(policy.permissions)) {
      for (const [, rules] of Object.entries(selectorMap as Record<string, Rule[]>)) {
        for (const rule of rules) {
          if (!rule.decision) {
            throw new Error("Each rule must have a 'decision' field.")
          }
          if (!['AUTO', 'REQUIRE_APPROVAL', 'REJECT'].includes(rule.decision)) {
            throw new Error(`Invalid decision: ${rule.decision}`)
          }
          if (rule.args) {
            for (const [, cond] of Object.entries(rule.args)) {
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
      }
    }
  } else if (policy.type === 'timestamp') {
    // validAfter and validUntil are optional
  } else {
    throw new Error(`Unsupported policy type: ${(policy as { type: string }).type}`)
  }
}

export function validatePolicies (policies: Policy[]): void {
  if (!Array.isArray(policies)) {
    throw new Error('Policies must be an array.')
  }
  for (const policy of policies) {
    validatePolicy(policy)
  }
}

export function permissionsToDict (permissions: Array<{ target?: string; selector?: string; args?: Record<string, ArgCondition>; valueLimit?: string | number; decision: Decision }>): PermissionDict {
  const dict: PermissionDict = {}
  permissions.forEach((perm, i) => {
    const target = perm.target?.toLowerCase() ?? '*'
    const selector = perm.selector ?? '*'
    if (!dict[target]) dict[target] = {}
    if (!dict[target][selector]) dict[target][selector] = []
    dict[target][selector].push({
      order: i,
      args: perm.args,
      valueLimit: perm.valueLimit,
      decision: perm.decision
    })
  })
  return dict
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

export function evaluatePolicy (chainPolicies: ChainPolicies, chainId: number, tx: Transaction): EvaluationResult {
  const config = chainPolicies[chainId]
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

  // Collect candidates from matching buckets
  const candidates: Rule[] = []
  const perms = callPolicy.permissions

  // Check exact target + exact selector / wildcard selector
  const exactTarget = perms[txTo]
  if (exactTarget) {
    if (txSelector && exactTarget[txSelector]) candidates.push(...exactTarget[txSelector])
    if (exactTarget['*']) candidates.push(...exactTarget['*'])
  }

  // Check wildcard target + exact selector / wildcard selector
  const wildTarget = perms['*']
  if (wildTarget) {
    if (txSelector && wildTarget[txSelector]) candidates.push(...wildTarget[txSelector])
    if (wildTarget['*']) candidates.push(...wildTarget['*'])
  }

  // Sort by original order to preserve Permission[] semantics
  candidates.sort((a, b) => a.order - b.order)

  // Match in order
  for (const rule of candidates) {
    if (rule.args && !matchArgs(tx.data, rule.args)) continue
    if (rule.valueLimit !== undefined && BigInt(tx.value || 0) > BigInt(rule.valueLimit)) continue
    return { decision: rule.decision, matchedPermission: rule, reason: 'matched' }
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

export function createGuardedMiddleware ({ policiesRef, approvalBroker, emitter, chainId }: MiddlewareConfig): (account: GuardedAccount) => Promise<void> {
  return async (account: GuardedAccount) => {
    const rawSendTransaction = account.sendTransaction.bind(account)
    const rawTransfer = account.transfer.bind(account)
    // Save raw sign before override (used by signTransaction fallback)
    const rawSign: ((...args: unknown[]) => unknown) | null =
      typeof account.sign === 'function' ? account.sign.bind(account) : null
    // Save raw signTransaction before override (preferred for signTransaction if WDK provides it)
    const rawSignTransaction: ((tx: Transaction) => Promise<unknown>) | null =
      typeof account.signTransaction === 'function' ? account.signTransaction.bind(account) : null

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
        chainId,
        timestamp: Date.now()
      })

      const { decision, matchedPermission, reason } = evaluatePolicy(policies, chainId, tx)

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
          chainId,
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
          chainId,
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
        chainId,
        timestamp: Date.now()
      })

      const { decision, matchedPermission, reason } = evaluatePolicy(policies, chainId, mockTx)

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
          chainId,
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
          chainId,
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

    account.signTransaction = async (tx: Transaction): Promise<SignTransactionResult> => {
      const policies = policiesRef()
      const requestId = randomUUID()
      const intentId = randomUUID()

      emitter.emit('IntentProposed', {
        type: 'IntentProposed',
        requestId,
        tx: { to: tx.to, data: tx.data?.slice?.(0, 10), value: tx.value },
        chainId,
        timestamp: Date.now()
      })

      const { decision, matchedPermission, reason } = evaluatePolicy(policies, chainId, tx)

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

      const targetHash = intentHash({
        chainId,
        to: tx.to!,
        data: tx.data!,
        value: String(tx.value || '0')
      })

      if (decision === 'REQUIRE_APPROVAL') {
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
          chainId,
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

      // Sign the transaction:
      // 1. Prefer rawSignTransaction (original account.signTransaction saved before override)
      // 2. Fallback to rawSign (original account.sign)
      // 3. Last resort: deterministic SHA-256 hash (mock/test only)
      // The signed tx format depends on the WDK implementation; mock uses '0x' + sha256.
      const txPayload = JSON.stringify({
        to: tx.to,
        data: tx.data,
        value: String(tx.value || '0'),
        chainId,
        intentHash: targetHash
      })

      let signedTx: string
      if (rawSignTransaction) {
        // Use the original account.signTransaction (saved before our override)
        const rawResult = await rawSignTransaction(tx)
        const resultObj = rawResult as { signedTx?: string } | string
        signedTx = typeof resultObj === 'string' ? resultObj
          : (resultObj?.signedTx ?? String(resultObj))
        // Ensure hex prefix
        if (!signedTx.startsWith('0x')) signedTx = '0x' + signedTx
      } else if (rawSign) {
        // Fallback: use the raw account.sign method
        const signResult = await Promise.resolve(rawSign(txPayload))
        signedTx = typeof signResult === 'string' ? signResult
          : '0x' + Buffer.from(String(signResult)).toString('hex')
        if (!signedTx.startsWith('0x')) signedTx = '0x' + signedTx
      } else {
        // Last resort: deterministic hash (mock/test only)
        signedTx = '0x' + createHash('sha256').update(txPayload).digest('hex')
      }

      emitter.emit('TransactionSigned', {
        type: 'TransactionSigned',
        requestId,
        intentId,
        intentHash: targetHash,
        timestamp: Date.now()
      })

      return {
        signedTx,
        intentHash: targetHash,
        requestId,
        intentId
      }
    }
  }
}
