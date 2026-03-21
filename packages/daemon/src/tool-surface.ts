import { randomUUID } from 'node:crypto'
import { intentHash, policyHash, CHAIN_IDS } from '@wdk-app/canonical'
import type { Logger } from 'pino'
import type { WDKInstance } from './wdk-host.js'
import type { ExecutionJournal } from './execution-journal.js'
import type { ToolStorePort, ApprovalBrokerPort } from './ports.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolExecutionContext {
  wdk: WDKInstance
  broker: ApprovalBrokerPort
  store: ToolStorePort
  logger: Logger
  journal: ExecutionJournal | null
}

// ---------------------------------------------------------------------------
// Per-tool result types (v0.2.9 — discriminated union)
// ---------------------------------------------------------------------------

// Common error/rejection types
export interface ToolErrorResult {
  status: 'error'
  error: string
}

export interface IntentErrorResult {
  status: 'error'
  error: string
  intentHash: string
}

export interface IntentRejectedResult {
  status: 'rejected'
  reason: string
  intentHash: string
  context: unknown
}

export interface TransferRejectedResult {
  status: 'rejected'
  reason: string
  context: unknown
}

// 1. sendTransaction
interface SendTransactionExecuted {
  status: 'executed'
  hash: string | null
  fee: string | null
  intentHash: string
}

interface SendTransactionDuplicate {
  status: 'duplicate'
  intentHash: string
}

export type SendTransactionResult =
  | SendTransactionExecuted
  | SendTransactionDuplicate
  | IntentRejectedResult
  | IntentErrorResult

// 2. transfer
interface TransferExecuted {
  status: 'executed'
  hash: string | null
  fee: string | null
  token: string
  amount: string
}

export type TransferResult =
  | TransferExecuted
  | TransferRejectedResult
  | ToolErrorResult

// 3. getBalance
interface GetBalanceSuccess {
  balances: unknown[]
}

export type GetBalanceResult = GetBalanceSuccess | ToolErrorResult

// 4. policyList
interface PolicyListSuccess {
  policies: unknown[]
}

export type PolicyListResult = PolicyListSuccess | ToolErrorResult

// 5. policyPending
interface PolicyPendingSuccess {
  pending: unknown[]
}

export type PolicyPendingResult = PolicyPendingSuccess | ToolErrorResult

// 6. policyRequest
interface PolicyRequestPending {
  status: 'pending'
  policyHash: string
}

export type PolicyRequestResult = PolicyRequestPending | ToolErrorResult

// 7. registerCron
interface RegisterCronRegistered {
  cronId: string
  status: 'registered'
}

export type RegisterCronResult = RegisterCronRegistered | ToolErrorResult

// 8. listCrons
interface ListCronsSuccess {
  crons: unknown[]
}

export type ListCronsResult = ListCronsSuccess | ToolErrorResult

// 9. removeCron
interface RemoveCronRemoved {
  status: 'removed'
}

export type RemoveCronResult = RemoveCronRemoved | ToolErrorResult

// 10. signTransaction
interface SignTransactionSigned {
  status: 'signed'
  signedTx: string | null
  intentHash: string
  requestId: string
}

interface SignTransactionDuplicate {
  status: 'duplicate'
  intentHash: string
}

export type SignTransactionResult =
  | SignTransactionSigned
  | SignTransactionDuplicate
  | IntentRejectedResult
  | IntentErrorResult

// 11. listRejections
interface ListRejectionsSuccess {
  rejections: unknown[]
}

export type ListRejectionsResult = ListRejectionsSuccess | ToolErrorResult

// 12. listPolicyVersions
interface ListPolicyVersionsSuccess {
  policyVersions: unknown[]
}

export type ListPolicyVersionsResult = ListPolicyVersionsSuccess | ToolErrorResult

// All tool results union
export type AnyToolResult =
  | SendTransactionResult
  | TransferResult
  | GetBalanceResult
  | PolicyListResult
  | PolicyPendingResult
  | PolicyRequestResult
  | RegisterCronResult
  | ListCronsResult
  | RemoveCronResult
  | SignTransactionResult
  | ListRejectionsResult
  | ListPolicyVersionsResult

/** @deprecated Use AnyToolResult instead */
export type ToolResult = AnyToolResult

interface SendTransactionArgs {
  chain: string
  to: string
  data: string
  value: string
  accountIndex: number
}

interface TransferArgs {
  chain: string
  token: string
  to: string
  amount: string
  accountIndex: number
}

interface ChainArgs {
  chain: string
  accountIndex?: number
}

interface PolicyRequestArgs {
  chain: string
  description: string
  policies: Record<string, unknown>[]
  accountIndex: number
}

interface RegisterCronArgs {
  interval: string
  prompt: string
  chain: string
  sessionId: string
  accountIndex: number
}

interface CronIdArgs {
  cronId: string
  accountIndex?: number
}

interface RejectionListArgs {
  accountIndex: number
  chain: string
  limit?: number
}

interface PolicyVersionListArgs {
  accountIndex: number
  chain: string
}

type ToolArgs = SendTransactionArgs | TransferArgs | ChainArgs | PolicyRequestArgs | RegisterCronArgs | CronIdArgs | RejectionListArgs | PolicyVersionListArgs | Record<string, unknown>

// ---------------------------------------------------------------------------
// Tool call dispatcher
// ---------------------------------------------------------------------------

/**
 * Execute a single tool call.
 */
export async function executeToolCall (name: string, args: ToolArgs, ctx: ToolExecutionContext): Promise<AnyToolResult> {
  const { wdk, broker, store, logger, journal } = ctx
  const accountIndex = (args as Record<string, unknown>).accountIndex as number | undefined

  switch (name) {
    // -----------------------------------------------------------------------
    // 1. sendTransaction
    // -----------------------------------------------------------------------
    case 'sendTransaction': {
      const { chain, to, data, value, accountIndex: acctIdx } = args as SendTransactionArgs
      const chainId = resolveChainId(chain)
      const hash = intentHash({ chainId, to, data, value, timestamp: Date.now() })

      if (journal && journal.isDuplicate(hash)) {
        logger.info({ hash }, 'Duplicate intent detected, skipping.')
        return { status: 'duplicate', intentHash: hash }
      }

      if (journal) {
        journal.track(hash, { accountIndex: acctIdx, chainId, targetHash: hash })
      }

      try {
        const account: any = await wdk.getAccount(chain, acctIdx)
        const result = await account.sendTransaction({ to, data, value })

        if (journal) journal.updateStatus(hash, 'settled', result?.hash)
        return {
          status: 'executed',
          hash: result?.hash || null,
          fee: result?.fee || null,
          intentHash: hash
        }
      } catch (err: any) {
        if (err.name === 'PolicyRejectionError') {
          if (journal) journal.updateStatus(hash, 'rejected')
          try {
            const pv = await store.getPolicyVersion(acctIdx, chainId)
            await store.saveRejection({ intentHash: hash, accountIndex: acctIdx, chainId, targetHash: hash, reason: err.message, context: err.context ?? null, policyVersion: pv, rejectedAt: Date.now() })
          } catch (rejErr: any) {
            logger.error({ err: rejErr }, 'Failed to save rejection history')
          }
          return { status: 'rejected', reason: err.message, intentHash: hash, context: err.context ?? null }
        }

        if (journal) journal.updateStatus(hash, 'failed')
        logger.error({ err, name: 'sendTransaction' }, 'Tool execution error')
        return { status: 'error', error: err.message, intentHash: hash }
      }
    }

    // -----------------------------------------------------------------------
    // 2. transfer
    // -----------------------------------------------------------------------
    case 'transfer': {
      const { chain, token, to, amount, accountIndex: acctIdx } = args as TransferArgs

      try {
        const account: any = await wdk.getAccount(chain, acctIdx)
        const result = await account.sendTransaction({ to, data: encodeTransferData(token, to, amount), value: token.toLowerCase() === 'eth' ? amount : '0' })

        return {
          status: 'executed',
          hash: result?.hash || null,
          fee: result?.fee || null,
          token,
          amount
        }
      } catch (err: any) {
        if (err.name === 'PolicyRejectionError') {
          try {
            const chainId = resolveChainId(chain)
            const txData = encodeTransferData(token, to, amount)
            const txValue = token.toLowerCase() === 'eth' ? amount : '0'
            const rejHash = intentHash({ chainId, to, data: txData, value: txValue, timestamp: Date.now() })
            const pv = await store.getPolicyVersion(acctIdx, chainId)
            await store.saveRejection({ intentHash: rejHash, accountIndex: acctIdx, chainId, targetHash: rejHash, reason: err.message, context: err.context ?? null, policyVersion: pv, rejectedAt: Date.now() })
          } catch (rejErr: any) {
            logger.error({ err: rejErr }, 'Failed to save rejection history')
          }
          return { status: 'rejected', reason: err.message, context: err.context ?? null }
        }
        logger.error({ err, name: 'transfer' }, 'Tool execution error')
        return { status: 'error', error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // 3. getBalance
    // -----------------------------------------------------------------------
    case 'getBalance': {
      const { chain } = args as ChainArgs
      try {
        const account: any = await wdk.getAccount(chain, accountIndex ?? 0)
        const balances = await account.getBalance()
        return { balances: balances || [] }
      } catch (err: any) {
        logger.error({ err, name: 'getBalance' }, 'Tool execution error')
        return { status: 'error', error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // 4. policyList
    // -----------------------------------------------------------------------
    case 'policyList': {
      const { chain } = args as ChainArgs
      try {
        const chainId = resolveChainId(chain)
        const policy = await store.loadPolicy(accountIndex ?? 0, chainId)
        return { policies: policy ? policy.policies : [] }
      } catch (err: any) {
        logger.error({ err, name: 'policyList' }, 'Tool execution error')
        return { status: 'error', error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // 5. policyPending
    // -----------------------------------------------------------------------
    case 'policyPending': {
      const { chain } = args as ChainArgs
      try {
        const chainId = resolveChainId(chain)
        const pending = await store.loadPendingApprovals(accountIndex ?? null, 'policy', chainId)
        return { pending: pending || [] }
      } catch (err: any) {
        logger.error({ err, name: 'policyPending' }, 'Tool execution error')
        return { status: 'error', error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // 6. policyRequest
    // -----------------------------------------------------------------------
    case 'policyRequest': {
      const { chain, description, policies, accountIndex: acctIdx } = args as PolicyRequestArgs
      try {
        const chainId = resolveChainId(chain)
        const hash = policyHash(policies as any)

        await broker.createRequest('policy', {
          chainId,
          targetHash: hash,
          accountIndex: acctIdx,
          content: description
        })

        return { status: 'pending', policyHash: hash }
      } catch (err: any) {
        logger.error({ err, name: 'policyRequest' }, 'Tool execution error')
        return { status: 'error', error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // 7. registerCron
    // -----------------------------------------------------------------------
    case 'registerCron': {
      const { interval, prompt, chain, sessionId, accountIndex: acctIdx } = args as RegisterCronArgs
      try {
        const chainId = resolveChainId(chain)
        const cronId = await store.saveCron(acctIdx, {
          sessionId,
          interval,
          prompt,
          chainId
        })
        return { cronId, status: 'registered' }
      } catch (err: any) {
        logger.error({ err, name: 'registerCron' }, 'Tool execution error')
        return { status: 'error', error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // 8. listCrons
    // -----------------------------------------------------------------------
    case 'listCrons': {
      try {
        const crons = await store.listCrons(accountIndex)
        return { crons }
      } catch (err: any) {
        logger.error({ err, name: 'listCrons' }, 'Tool execution error')
        return { status: 'error', error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // 9. removeCron
    // -----------------------------------------------------------------------
    case 'removeCron': {
      const { cronId } = args as CronIdArgs
      try {
        await store.removeCron(cronId)
        return { status: 'removed' }
      } catch (err: any) {
        logger.error({ err, name: 'removeCron' }, 'Tool execution error')
        return { status: 'error', error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // 10. signTransaction
    // -----------------------------------------------------------------------
    case 'signTransaction': {
      const { chain, to, data, value, accountIndex: acctIdx } = args as SendTransactionArgs
      const chainId = resolveChainId(chain)
      const hash = intentHash({ chainId, to, data, value, timestamp: Date.now() })

      if (journal && journal.isDuplicate(hash)) {
        logger.info({ hash }, 'Duplicate intent detected, skipping.')
        return { status: 'duplicate', intentHash: hash }
      }

      if (journal) {
        journal.track(hash, { accountIndex: acctIdx, chainId, targetHash: hash })
      }

      try {
        const account: any = await wdk.getAccount(chain, acctIdx)
        const result = await account.signTransaction({ to, data, value })

        if (journal) journal.updateStatus(hash, 'signed')
        return {
          status: 'signed',
          signedTx: result?.signedTx || null,
          intentHash: result?.intentHash || hash,
          requestId: result?.requestId || hash
        }
      } catch (err: any) {
        if (err.name === 'PolicyRejectionError') {
          if (journal) journal.updateStatus(hash, 'rejected')
          try {
            const pv = await store.getPolicyVersion(acctIdx, chainId)
            await store.saveRejection({ intentHash: hash, accountIndex: acctIdx, chainId, targetHash: hash, reason: err.message, context: err.context ?? null, policyVersion: pv, rejectedAt: Date.now() })
          } catch (rejErr: any) {
            logger.error({ err: rejErr }, 'Failed to save rejection history')
          }
          return { status: 'rejected', reason: err.message, intentHash: hash, context: err.context ?? null }
        }

        if (journal) journal.updateStatus(hash, 'failed')
        logger.error({ err, name: 'signTransaction' }, 'Tool execution error')
        return { status: 'error', error: err.message, intentHash: hash }
      }
    }

    // -----------------------------------------------------------------------
    // 11. listRejections
    // -----------------------------------------------------------------------
    case 'listRejections': {
      const { chain, accountIndex: acctIdx, limit } = args as RejectionListArgs
      try {
        const chainId = resolveChainId(chain)
        const rejections = await store.listRejections({ accountIndex: acctIdx, chainId, limit })
        return { rejections }
      } catch (err: any) {
        logger.error({ err, name: 'listRejections' }, 'Tool execution error')
        return { status: 'error', error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // 12. listPolicyVersions
    // -----------------------------------------------------------------------
    case 'listPolicyVersions': {
      const { chain, accountIndex: acctIdx } = args as PolicyVersionListArgs
      try {
        const chainId = resolveChainId(chain)
        const policyVersions = await store.listPolicyVersions(acctIdx, chainId)
        return { policyVersions }
      } catch (err: any) {
        logger.error({ err, name: 'listPolicyVersions' }, 'Tool execution error')
        return { status: 'error', error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // Unknown tool
    // -----------------------------------------------------------------------
    default:
      logger.warn({ name }, 'Unknown tool call')
      return { status: 'error', error: `Unknown tool: ${name}` }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a chain name or numeric string to a chainId number.
 * Throws if the chain is unknown.
 */
function resolveChainId (chain: string): number {
  // If it's already a numeric string, parse it
  const asNum = Number(chain)
  if (!Number.isNaN(asNum) && Number.isInteger(asNum)) return asNum

  // Look up by name
  const id = (CHAIN_IDS as Record<string, number>)[chain.toLowerCase()]
  if (id === undefined) throw new Error(`Unknown chain: ${chain}`)
  return id
}

/**
 * Encode a basic ERC-20 transfer calldata.
 * In production this would use the actual token ABI; here it's a placeholder.
 */
function encodeTransferData (token: string, to: string, amount: string): string {
  // ERC-20 transfer(address,uint256) selector = 0xa9059cbb
  // This is a simplified placeholder -- real implementation would use ethers/abi
  const selector = '0xa9059cbb'
  const paddedTo = to.replace('0x', '').padStart(64, '0')
  const paddedAmount = BigInt(amount).toString(16).padStart(64, '0')
  return `${selector}${paddedTo}${paddedAmount}`
}
