import { randomUUID, createHash } from 'node:crypto'
import { intentHash, dedupKey } from '@wdk-app/canonical'
import type { IWalletAccount } from '@tetherto/wdk'
import { ForbiddenError, PolicyRejectionError, DuplicateIntentError } from './errors.js'
import type { RejectionEntry } from './wdk-store.js'
import type { ExecutionJournal } from './execution-journal.js'
import type { EventEmitter } from 'node:events'

// --- Policy types ---

export type Decision = 'ALLOW' | 'REJECT'

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

interface CallPolicy {
  type: 'call'
  permissions: PermissionDict
}

interface TimestampPolicy {
  type: 'timestamp'
  validAfter?: number
  validUntil?: number
}

export type Policy = CallPolicy | TimestampPolicy

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

interface SignTransactionResult {
  signedTx: string
  intentHash: string
  requestId: string
}

interface TransactionReceipt {
  status: number
}

interface GuardedAccount {
  sendTransaction: (tx: Transaction) => Promise<TransactionResult>
  signTransaction?: (tx: Transaction) => Promise<SignTransactionResult>
  transfer: (options: TransferOptions) => Promise<TransactionResult>
  sign: (message: string) => Promise<string>
  signTypedData?: (...args: unknown[]) => unknown
  dispose: () => void
  keyPair: { publicKey: Uint8Array; privateKey: Uint8Array | null }
  getAddress: () => Promise<string>
  getTransactionReceipt: (hash: string) => Promise<TransactionReceipt | null>
}

interface FailedArg {
  argIndex: string
  condition: string
  expected: string | string[]
  actual: string
}

interface RuleFailure {
  rule: Rule
  failedArgs: FailedArg[]
}

export interface EvaluationContext {
  target: string
  selector: string
  effectiveRules: Rule[]
  ruleFailures: RuleFailure[]
}

export interface AllowResult {
  kind: 'allow'
  matchedPermission: Rule
}

export interface SimpleRejectResult {
  kind: 'reject'
  reason: string
}

export interface DetailedRejectResult {
  kind: 'reject_with_context'
  reason: string
  context: EvaluationContext
}

export type EvaluationResult = AllowResult | SimpleRejectResult | DetailedRejectResult

interface MiddlewareConfig {
  policyResolver: (chainId: number) => Promise<Policy[]>
  emitter: EventEmitter
  chainId: number
  getAccountIndex: () => number
  onRejection: (entry: RejectionEntry) => Promise<void>
  getPolicyVersion: (accountIndex: number, chainId: number) => Promise<number>
  journal: ExecutionJournal | null
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
          if (!['ALLOW', 'REJECT'].includes(rule.decision)) {
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

function matchArgs (data: string, argConditions: Record<string, ArgCondition>): FailedArg[] {
  const failures: FailedArg[] = []
  for (const [indexStr, cond] of Object.entries(argConditions)) {
    const index = parseInt(indexStr, 10)
    const actual = extractArg(data, index)
    if (actual === null) {
      failures.push({ argIndex: indexStr, condition: cond.condition, expected: cond.value, actual: 'null' })
      continue
    }
    if (!matchCondition(cond.condition, actual, cond.value)) {
      failures.push({ argIndex: indexStr, condition: cond.condition, expected: cond.value, actual })
    }
  }
  return failures
}

function buildPolicyEvaluatedPayload (requestId: string, result: EvaluationResult): Record<string, unknown> {
  const base = { type: 'PolicyEvaluated', requestId, timestamp: Date.now() }
  switch (result.kind) {
    case 'allow':
      return { ...base, decision: 'ALLOW' as const, matchedPermission: result.matchedPermission }
    case 'reject':
      return { ...base, decision: 'REJECT' as const, reason: result.reason }
    case 'reject_with_context':
      return { ...base, decision: 'REJECT' as const, reason: result.reason, context: result.context }
  }
}

export function evaluatePolicy (policies: Policy[], chainId: number, tx: Transaction): EvaluationResult {
  if (!policies || policies.length === 0) {
    return { kind: 'reject', reason: 'no policies for chain' }
  }

  for (const policy of policies) {
    if (policy.type === 'timestamp') {
      const now = Date.now() / 1000
      if (policy.validAfter && now < policy.validAfter) {
        return { kind: 'reject', reason: 'too early' }
      }
      if (policy.validUntil && now > policy.validUntil) {
        return { kind: 'reject', reason: 'expired' }
      }
    }
  }

  const callPolicy = policies.find((p): p is CallPolicy => p.type === 'call')
  if (!callPolicy) {
    return { kind: 'reject', reason: 'no call policy' }
  }

  const txTo = tx.to?.toLowerCase?.()
  const txSelector = tx.data?.slice?.(0, 10)

  if (!txTo) {
    return { kind: 'reject', reason: 'missing tx.to' }
  }

  if (!tx.data || tx.data.length < 10) {
    return { kind: 'reject', reason: 'missing or invalid tx.data' }
  }

  // Collect candidates from matching buckets
  const candidates: Rule[] = []
  // Normalize permission keys to lowercase for case-insensitive address matching
  const perms: PermissionDict = {}
  for (const [key, val] of Object.entries(callPolicy.permissions)) {
    perms[key.toLowerCase()] = val
  }

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

  // Match in order, collecting failures for context
  const ruleFailures: RuleFailure[] = []
  for (const rule of candidates) {
    const failures = rule.args ? matchArgs(tx.data, rule.args) : []
    if (failures.length > 0) {
      ruleFailures.push({ rule, failedArgs: failures })
      continue
    }
    if (rule.valueLimit !== undefined && BigInt(tx.value || 0) > BigInt(rule.valueLimit)) {
      ruleFailures.push({ rule, failedArgs: [] })
      continue
    }
    if (rule.decision === 'ALLOW') {
      return { kind: 'allow', matchedPermission: rule }
    }
    return { kind: 'reject', reason: 'matched REJECT rule' }
  }

  if (candidates.length > 0) {
    return {
      kind: 'reject_with_context',
      reason: 'no matching permission',
      context: { target: txTo, selector: txSelector!, effectiveRules: candidates, ruleFailures }
    }
  }
  return { kind: 'reject', reason: 'no matching permission' }
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
    } catch (err) {
      emitter.emit('PollingError', { type: 'PollingError', requestId, hash, error: err, timestamp: Date.now() })
    }
    await new Promise<void>(resolve => setTimeout(resolve, 1000))
  }
}

export function createGuardedMiddleware ({ policyResolver, emitter, chainId, getAccountIndex, onRejection, getPolicyVersion, journal }: MiddlewareConfig): (account: IWalletAccount) => Promise<void> {
  return async (acct: IWalletAccount) => {
    const account = acct as GuardedAccount

    // WalletManagerEvm caches account objects. Skip if middleware was already applied.
    if ((account as unknown as { __guarded?: boolean }).__guarded) return
    ;(account as unknown as { __guarded?: boolean }).__guarded = true

    const rawSendTransaction = account.sendTransaction.bind(account)
    const rawTransfer = account.transfer.bind(account)
    const rawSign: ((message: string) => Promise<string>) | null =
      typeof account.sign === 'function' ? account.sign.bind(account) : null
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
      const policyArr = await policyResolver(chainId)
      const requestId = randomUUID()
      const acctIdx = getAccountIndex()
      const dkey = dedupKey({ chainId, to: tx.to!, data: tx.data!, value: String(tx.value || '0') })
      const iHash = intentHash({ chainId, to: tx.to!, data: tx.data!, value: String(tx.value || '0'), timestamp: Date.now() })

      // Journal: dedup check
      if (journal && journal.isDuplicate(dkey)) {
        throw new DuplicateIntentError(dkey, iHash)
      }

      // Journal: track
      if (journal) await journal.track(iHash, { accountIndex: acctIdx, chainId, dedupKey: dkey })

      emitter.emit('IntentProposed', {
        type: 'IntentProposed',
        requestId,
        tx: { to: tx.to, data: tx.data?.slice?.(0, 10), value: tx.value },
        chainId,
        timestamp: Date.now()
      })

      const evalResult = evaluatePolicy(policyArr, chainId, tx)

      emitter.emit('PolicyEvaluated', buildPolicyEvaluatedPayload(requestId, evalResult))

      if (evalResult.kind !== 'allow') {
        if (journal) await journal.updateStatus(iHash, 'rejected')
        const pv = await getPolicyVersion(acctIdx, chainId)
        const rejectionContext = evalResult.kind === 'reject_with_context' ? evalResult.context : null
        await onRejection({
          intentHash: iHash, accountIndex: acctIdx, chainId, dedupKey: dkey,
          reason: evalResult.reason, context: rejectionContext, policyVersion: pv, rejectedAt: Date.now()
        }).catch(() => {})
        throw new PolicyRejectionError(evalResult.reason, rejectionContext, iHash)
      }

      let result: TransactionResult
      try {
        result = await rawSendTransaction(tx)
      } catch (err: unknown) {
        if (journal) await journal.updateStatus(iHash, 'failed')
        emitter.emit('ExecutionFailed', {
          type: 'ExecutionFailed',
          requestId,
          error: (err as Error).message,
          timestamp: Date.now()
        })
        throw err
      }

      if (journal) await journal.updateStatus(iHash, 'settled', result.hash)

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

      const policyArr = await policyResolver(chainId)
      const requestId = randomUUID()
      const acctIdx = getAccountIndex()
      const dkey = dedupKey({ chainId, to: mockTx.to!, data: mockTx.data!, value: String(mockTx.value || '0') })
      const iHash = intentHash({ chainId, to: mockTx.to!, data: mockTx.data!, value: String(mockTx.value || '0'), timestamp: Date.now() })

      if (journal && journal.isDuplicate(dkey)) {
        throw new DuplicateIntentError(dkey, iHash)
      }
      if (journal) await journal.track(iHash, { accountIndex: acctIdx, chainId, dedupKey: dkey })

      emitter.emit('IntentProposed', {
        type: 'IntentProposed',
        requestId,
        tx: { to: mockTx.to, data: mockTx.data?.slice?.(0, 10), value: mockTx.value },
        chainId,
        timestamp: Date.now()
      })

      const evalResult = evaluatePolicy(policyArr, chainId, mockTx)

      emitter.emit('PolicyEvaluated', buildPolicyEvaluatedPayload(requestId, evalResult))

      if (evalResult.kind !== 'allow') {
        if (journal) await journal.updateStatus(iHash, 'rejected')
        const pv = await getPolicyVersion(acctIdx, chainId)
        const rejectionContext = evalResult.kind === 'reject_with_context' ? evalResult.context : null
        await onRejection({
          intentHash: iHash, accountIndex: acctIdx, chainId, dedupKey: dkey,
          reason: evalResult.reason, context: rejectionContext, policyVersion: pv, rejectedAt: Date.now()
        }).catch(() => {})
        throw new PolicyRejectionError(evalResult.reason, rejectionContext, iHash)
      }

      let result: TransactionResult
      try {
        result = await rawTransfer(options)
      } catch (err: unknown) {
        if (journal) await journal.updateStatus(iHash, 'failed')
        emitter.emit('ExecutionFailed', {
          type: 'ExecutionFailed',
          requestId,
          error: (err as Error).message,
          timestamp: Date.now()
        })
        throw err
      }

      if (journal) await journal.updateStatus(iHash, 'settled', result.hash)

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
      const policyArr = await policyResolver(chainId)
      const requestId = randomUUID()
      const acctIdx = getAccountIndex()
      const dkey = dedupKey({ chainId, to: tx.to!, data: tx.data!, value: String(tx.value || '0') })
      const iHash = intentHash({ chainId, to: tx.to!, data: tx.data!, value: String(tx.value || '0'), timestamp: Date.now() })

      if (journal && journal.isDuplicate(dkey)) {
        throw new DuplicateIntentError(dkey, iHash)
      }
      if (journal) await journal.track(iHash, { accountIndex: acctIdx, chainId, dedupKey: dkey })

      emitter.emit('IntentProposed', {
        type: 'IntentProposed',
        requestId,
        tx: { to: tx.to, data: tx.data?.slice?.(0, 10), value: tx.value },
        chainId,
        timestamp: Date.now()
      })

      const evalResult = evaluatePolicy(policyArr, chainId, tx)

      emitter.emit('PolicyEvaluated', buildPolicyEvaluatedPayload(requestId, evalResult))

      if (evalResult.kind !== 'allow') {
        if (journal) await journal.updateStatus(iHash, 'rejected')
        const pv = await getPolicyVersion(acctIdx, chainId)
        const rejectionContext = evalResult.kind === 'reject_with_context' ? evalResult.context : null
        await onRejection({
          intentHash: iHash, accountIndex: acctIdx, chainId, dedupKey: dkey,
          reason: evalResult.reason, context: rejectionContext, policyVersion: pv, rejectedAt: Date.now()
        }).catch(() => {})
        throw new PolicyRejectionError(evalResult.reason, rejectionContext, iHash)
      }

      if (journal) await journal.updateStatus(iHash, 'signed')

      const targetHash = intentHash({
        chainId,
        to: tx.to!,
        data: tx.data!,
        value: String(tx.value || '0'),
        timestamp: Date.now()
      })

      const txPayload = JSON.stringify({
        to: tx.to,
        data: tx.data,
        value: String(tx.value || '0'),
        chainId,
        intentHash: targetHash
      })

      let signedTx: string
      if (rawSignTransaction) {
        const rawResult = await rawSignTransaction(tx)
        const resultObj = rawResult as { signedTx?: string } | string
        signedTx = typeof resultObj === 'string' ? resultObj
          : (resultObj?.signedTx ?? String(resultObj))
        if (!signedTx.startsWith('0x')) signedTx = '0x' + signedTx
      } else if (rawSign) {
        const signResult = await Promise.resolve(rawSign(txPayload))
        signedTx = typeof signResult === 'string' ? signResult
          : '0x' + Buffer.from(String(signResult)).toString('hex')
        if (!signedTx.startsWith('0x')) signedTx = '0x' + signedTx
      } else {
        signedTx = '0x' + createHash('sha256').update(txPayload).digest('hex')
      }

      emitter.emit('TransactionSigned', {
        type: 'TransactionSigned',
        requestId,
        intentHash: targetHash,
        timestamp: Date.now()
      })

      return {
        signedTx,
        intentHash: targetHash,
        requestId
      }
    }
  }
}
