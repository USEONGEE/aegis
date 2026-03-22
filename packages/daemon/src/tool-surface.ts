import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { intentHash, policyHash, CHAIN_IDS } from '@wdk-app/canonical'
import type { PolicyObject } from '@wdk-app/canonical'
import type { Logger } from 'pino'
import type { WDKInstance } from './wdk-host.js'
import type { ToolFacadePort } from './ports.js'
import type { DaemonStore } from './daemon-store.js'
import type { EvaluationContext, Policy, PendingApprovalRequest, RejectionEntry, PolicyVersionEntry } from '@wdk-app/guarded-wdk'
import type { StoredCron } from './daemon-store.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract error message from unknown catch value. */
function errMsg (err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Narrow unknown catch value to an object with optional typed fields. */
function errObj (err: unknown): { name?: string; message?: string; context?: EvaluationContext | null } {
  if (err instanceof Error) return err as Error & { context?: EvaluationContext | null }
  return {}
}

// ---------------------------------------------------------------------------
// Boundary type: describes methods the tool-surface calls on an account.
// IWalletAccountWithProtocols lacks `data` on sendTransaction and `signTransaction`
// because those are added by the guarded middleware at runtime.
// ---------------------------------------------------------------------------

interface ToolAccount {
  sendTransaction (tx: { to: string; data: string; value: string }): Promise<{ hash: string; fee: bigint }>
  signTransaction (tx: { to: string; data: string; value: string }): Promise<{ signedTx: string; intentHash: string; requestId: string }>
  getBalance (): Promise<unknown>
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolExecutionContext {
  facade: (WDKInstance & ToolFacadePort) | null
  daemonStore: DaemonStore
  logger: Logger
}

// ---------------------------------------------------------------------------
// Per-tool result types (v0.2.9 — discriminated union)
// ---------------------------------------------------------------------------

// Common error/rejection types
export interface ToolErrorResult {
  status: 'error'
  error: string
}

interface IntentErrorResult {
  status: 'error'
  error: string
  intentHash: string
}

interface IntentRejectedResult {
  status: 'rejected'
  reason: string
  intentHash: string
  context: EvaluationContext | null
}

interface TransferRejectedResult {
  status: 'rejected'
  reason: string
  context: EvaluationContext | null
}

// 1. sendTransaction
interface SendTransactionExecuted {
  status: 'executed'
  hash: string
  fee: string
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
  hash: string
  fee: string
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

// 3b. getWalletAddress
interface GetWalletAddressSuccess {
  status: 'ok'
  address: string
}

export type GetWalletAddressResult = GetWalletAddressSuccess | ToolErrorResult

// 4. policyList
interface PolicyListSuccess {
  policies: Policy[]
}

export type PolicyListResult = PolicyListSuccess | ToolErrorResult

// 5. policyPending
interface PolicyPendingSuccess {
  pending: PendingApprovalRequest[]
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
  crons: StoredCron[]
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
  signedTx: string
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
  rejections: RejectionEntry[]
}

export type ListRejectionsResult = ListRejectionsSuccess | ToolErrorResult

// 12. listPolicyVersions
interface ListPolicyVersionsSuccess {
  policyVersions: PolicyVersionEntry[]
}

export type ListPolicyVersionsResult = ListPolicyVersionsSuccess | ToolErrorResult

// 13. kittenFetch
interface KittenFetchSuccess {
  status: 'ok'
  pool: {
    sqrtPriceX96: string
    currentTick: number
    liquidity: string
    token0Balance: string
    token1Balance: string
  }
}

export type KittenFetchResult = KittenFetchSuccess | ToolErrorResult

// 14. kittenMint
interface KittenMintPrepared {
  status: 'prepared'
  tx: { to: string; data: string; value: string }
  policy: Record<string, unknown>
  description: string
}

export type KittenMintResult = KittenMintPrepared | ToolErrorResult

// 15. kittenBurn
interface KittenBurnPrepared {
  status: 'prepared'
  txs: Array<{ to: string; data: string; value: string }>
  policy: Record<string, unknown>
  description: string
}

export type KittenBurnResult = KittenBurnPrepared | ToolErrorResult

// All tool results union
export type AnyToolResult =
  | SendTransactionResult
  | TransferResult
  | GetBalanceResult
  | GetWalletAddressResult
  | PolicyListResult
  | PolicyPendingResult
  | PolicyRequestResult
  | RegisterCronResult
  | ListCronsResult
  | RemoveCronResult
  | SignTransactionResult
  | ListRejectionsResult
  | ListPolicyVersionsResult
  | KittenFetchResult
  | KittenMintResult
  | KittenBurnResult

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
  accountIndex: number
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
  accountIndex: number
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

interface KittenFetchArgs {
  pool: string
  rpc: string
  accountIndex: number
}

interface KittenMintArgs {
  token0: string
  token1: string
  deployer: string
  tickLower: number
  tickUpper: number
  amount0Desired: string
  amount1Desired: string
  amount0Min: string
  amount1Min: string
  recipient: string
  deadline: string
  accountIndex: number
}

interface KittenBurnArgs {
  tokenId: string
  liquidity: string
  amount0Min: string
  amount1Min: string
  deadline: string
  recipient: string
  accountIndex: number
}

type ToolArgs = SendTransactionArgs | TransferArgs | ChainArgs | PolicyRequestArgs | RegisterCronArgs | CronIdArgs | RejectionListArgs | PolicyVersionListArgs | KittenFetchArgs | KittenMintArgs | KittenBurnArgs | Record<string, unknown>

// ---------------------------------------------------------------------------
// Tool call dispatcher
// ---------------------------------------------------------------------------

/**
 * Execute a single tool call.
 */
export async function executeToolCall (name: string, args: ToolArgs, ctx: ToolExecutionContext): Promise<AnyToolResult> {
  const { facade: facadeOrNull, daemonStore, logger } = ctx
  const accountIndex = (args as Record<string, unknown>).accountIndex as number | undefined

  // Tools that require facade (WDK) — fail fast if not initialized
  const FACADE_REQUIRED = ['sendTransaction', 'transfer', 'getBalance', 'getWalletAddress', 'policyList', 'policyPending', 'policyRequest', 'signTransaction', 'listRejections', 'listPolicyVersions']
  if (FACADE_REQUIRED.includes(name) && !facadeOrNull) {
    return { status: 'error', error: 'WDK not initialized (no master seed)' }
  }

  // After the guard, facade is non-null for FACADE_REQUIRED tools.
  // Non-facade tools (cron, kitten) never access this variable.
  const facade = facadeOrNull!

  switch (name) {
    // -----------------------------------------------------------------------
    // 1. sendTransaction
    // -----------------------------------------------------------------------
    case 'sendTransaction': {
      const { chain, to, data, value, accountIndex: acctIdx } = args as SendTransactionArgs
      const chainId = resolveChainId(chain)
      const hash = intentHash({ chainId, to, data, value, timestamp: Date.now() })

      try {
        const account = await facade.getAccount(chain, acctIdx) as unknown as ToolAccount
        const result = await account.sendTransaction({ to, data, value })

        return {
          status: 'executed',
          hash: result.hash,
          fee: String(result.fee),
          intentHash: hash
        }
      } catch (err: unknown) {
        const e = errObj(err)
        if (e.name === 'PolicyRejectionError') {
          return { status: 'rejected', reason: errMsg(err), intentHash: hash, context: e.context ?? null }
        }

        logger.error({ err, name: 'sendTransaction' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err), intentHash: hash }
      }
    }

    // -----------------------------------------------------------------------
    // 2. transfer
    // -----------------------------------------------------------------------
    case 'transfer': {
      const { chain, token, to, amount, accountIndex: acctIdx } = args as TransferArgs

      try {
        const account = await facade.getAccount(chain, acctIdx) as unknown as ToolAccount
        const result = await account.sendTransaction({ to, data: encodeTransferData(token, to, amount), value: token.toLowerCase() === 'eth' ? amount : '0' })

        return {
          status: 'executed',
          hash: result.hash,
          fee: String(result.fee),
          token,
          amount
        }
      } catch (err: unknown) {
        const e = errObj(err)
        if (e.name === 'PolicyRejectionError') {
          return { status: 'rejected', reason: errMsg(err), context: e.context ?? null }
        }
        logger.error({ err, name: 'transfer' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 3. getBalance
    // -----------------------------------------------------------------------
    case 'getBalance': {
      const { chain, accountIndex } = args as ChainArgs
      try {
        const account = await facade.getAccount(chain, accountIndex) as unknown as ToolAccount
        const balance = await account.getBalance()
        return { balances: Array.isArray(balance) ? balance : [balance] }
      } catch (err: unknown) {
        logger.error({ err, name: 'getBalance' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 3b. getWalletAddress
    // -----------------------------------------------------------------------
    case 'getWalletAddress': {
      const { chain, accountIndex } = args as ChainArgs
      try {
        const account = await facade.getAccount(chain, accountIndex) as unknown as ToolAccount
        const address = await (account as unknown as { getAddress: () => Promise<string> }).getAddress()
        return { status: 'ok', address }
      } catch (err: unknown) {
        logger.error({ err, name: 'getWalletAddress' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 4. policyList
    // -----------------------------------------------------------------------
    case 'policyList': {
      const { chain, accountIndex } = args as ChainArgs
      try {
        const chainId = resolveChainId(chain)
        const policy = await facade.loadPolicy(accountIndex, chainId)
        return { policies: policy ? policy.policies : [] }
      } catch (err: unknown) {
        logger.error({ err, name: 'policyList' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 5. policyPending
    // -----------------------------------------------------------------------
    case 'policyPending': {
      const { chain } = args as ChainArgs
      try {
        const chainId = resolveChainId(chain)
        const pending = await facade.getPendingApprovals({ accountIndex, type: 'policy', chainId })
        return { pending: pending || [] }
      } catch (err: unknown) {
        logger.error({ err, name: 'policyPending' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 6. policyRequest
    // -----------------------------------------------------------------------
    case 'policyRequest': {
      const { chain, description, policies: rawPolicies, accountIndex: acctIdx } = args as PolicyRequestArgs
      try {
        const chainId = resolveChainId(chain)
        // Wrap bare PermissionDict as CallPolicy if needed
        const policies = rawPolicies.map(p => {
          const obj = p as Record<string, unknown>
          if (obj.type === 'call' || obj.type === 'timestamp') return obj as unknown as Policy
          return { type: 'call', permissions: obj } as unknown as Policy
        })
        const hash = policyHash(policies as unknown as PolicyObject[])

        await facade.createApprovalRequest('policy', {
          requestId: randomUUID(),
          chainId,
          targetHash: hash,
          accountIndex: acctIdx,
          content: description,
          walletName: 'Policy Request',
          policies
        })

        return { status: 'pending', policyHash: hash }
      } catch (err: unknown) {
        logger.error({ err, name: 'policyRequest' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 7. registerCron
    // -----------------------------------------------------------------------
    case 'registerCron': {
      const { interval, prompt, chain, sessionId, accountIndex: acctIdx } = args as RegisterCronArgs
      try {
        const chainId = resolveChainId(chain)
        const cronId = await daemonStore.saveCron(acctIdx, {
          sessionId,
          interval,
          prompt,
          chain: { kind: 'specific', chainId }
        })
        return { cronId, status: 'registered' }
      } catch (err: unknown) {
        logger.error({ err, name: 'registerCron' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 8. listCrons
    // -----------------------------------------------------------------------
    case 'listCrons': {
      try {
        const crons = await daemonStore.listCrons({ accountIndex })
        return { crons }
      } catch (err: unknown) {
        logger.error({ err, name: 'listCrons' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 9. removeCron
    // -----------------------------------------------------------------------
    case 'removeCron': {
      const { cronId } = args as CronIdArgs
      try {
        await daemonStore.removeCron(cronId)
        return { status: 'removed' }
      } catch (err: unknown) {
        logger.error({ err, name: 'removeCron' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 10. signTransaction
    // -----------------------------------------------------------------------
    case 'signTransaction': {
      const { chain, to, data, value, accountIndex: acctIdx } = args as SendTransactionArgs
      const chainId = resolveChainId(chain)
      const hash = intentHash({ chainId, to, data, value, timestamp: Date.now() })

      try {
        const account = await facade.getAccount(chain, acctIdx) as unknown as ToolAccount
        const result = await account.signTransaction({ to, data, value })

        return {
          status: 'signed',
          signedTx: result.signedTx,
          intentHash: result.intentHash,
          requestId: result.requestId
        }
      } catch (err: unknown) {
        const e = errObj(err)
        if (e.name === 'PolicyRejectionError') {
          return { status: 'rejected', reason: errMsg(err), intentHash: hash, context: e.context ?? null }
        }

        logger.error({ err, name: 'signTransaction' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err), intentHash: hash }
      }
    }

    // -----------------------------------------------------------------------
    // 11. listRejections
    // -----------------------------------------------------------------------
    case 'listRejections': {
      const { chain, accountIndex: acctIdx, limit } = args as RejectionListArgs
      try {
        const chainId = resolveChainId(chain)
        const rejections = await facade.listRejections({ accountIndex: acctIdx, chainId, limit })
        return { rejections }
      } catch (err: unknown) {
        logger.error({ err, name: 'listRejections' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 12. listPolicyVersions
    // -----------------------------------------------------------------------
    case 'listPolicyVersions': {
      const { chain, accountIndex: acctIdx } = args as PolicyVersionListArgs
      try {
        const chainId = resolveChainId(chain)
        const policyVersions = await facade.listPolicyVersions(acctIdx, chainId)
        return { policyVersions }
      } catch (err: unknown) {
        logger.error({ err, name: 'listPolicyVersions' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 13. kittenFetch
    // -----------------------------------------------------------------------
    case 'kittenFetch': {
      const { pool, rpc } = args as KittenFetchArgs
      try {
        const result = await callKittenCli(['fetch', '--pool', pool, '--rpc', rpc], logger)
        return { status: 'ok', pool: result as KittenFetchSuccess['pool'] }
      } catch (err: unknown) {
        logger.error({ err, name: 'kittenFetch' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 14. kittenMint
    // -----------------------------------------------------------------------
    case 'kittenMint': {
      const { accountIndex: _acctIdx, ...mintInput } = args as KittenMintArgs
      try {
        const result = await callKittenCli(['mint', '--json', JSON.stringify(mintInput)], logger)
        const { tx, policy } = result as { tx: { to: string; data: string; value: string }; policy: Record<string, unknown> }
        return {
          status: 'prepared',
          tx,
          policy,
          description: 'KittenSwap LP mint position'
        }
      } catch (err: unknown) {
        logger.error({ err, name: 'kittenMint' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // 15. kittenBurn
    // -----------------------------------------------------------------------
    case 'kittenBurn': {
      const { accountIndex: _acctIdx, ...burnInput } = args as KittenBurnArgs
      try {
        const result = await callKittenCli(['burn', '--json', JSON.stringify(burnInput)], logger)
        const { txs, policy } = result as { txs: Array<{ to: string; data: string; value: string }>; policy: Record<string, unknown> }
        return {
          status: 'prepared',
          txs,
          policy,
          description: 'KittenSwap LP burn (remove liquidity)'
        }
      } catch (err: unknown) {
        logger.error({ err, name: 'kittenBurn' }, 'Tool execution error')
        return { status: 'error', error: errMsg(err) }
      }
    }

    // -----------------------------------------------------------------------
    // Manifest tools (pure computation — no facade required)
    // -----------------------------------------------------------------------

    case 'erc20Transfer': {
      const { erc20Transfer } = await import('@wdk-app/manifest')
      const { token, to, amount } = args as { token: string; to: string; amount: string }
      const result = erc20Transfer({ token, to, amount })
      return { status: 'prepared', tx: result.tx, policy: result.policy, description: result.description }
    }

    case 'erc20Approve': {
      const { erc20Approve } = await import('@wdk-app/manifest')
      const { token, spender, amount } = args as { token: string; spender: string; amount: string }
      const result = erc20Approve({ token, spender, amount })
      return { status: 'prepared', tx: result.tx, policy: result.policy, description: result.description }
    }

    case 'hyperlendDepositUsdt': {
      const { hyperlendDepositUsdt } = await import('@wdk-app/manifest')
      const { amount, onBehalfOf } = args as { amount: string; onBehalfOf: string }
      const result = hyperlendDepositUsdt({ amount, onBehalfOf })
      return { status: 'prepared', tx: result.tx, policy: result.policy, description: result.description }
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

// ---------------------------------------------------------------------------
// DeFi CLI helpers
// ---------------------------------------------------------------------------

const execFileAsync = promisify(execFile)

/**
 * Call kitten-cli as a subprocess and parse JSON stdout.
 * CLI path is configurable via KITTEN_CLI_PATH env var.
 */
async function callKittenCli (cliArgs: string[], logger: Logger): Promise<Record<string, unknown>> {
  const kittenPath = process.env.KITTEN_CLI_PATH || 'kitten-cli'
  logger.info({ cmd: kittenPath, args: cliArgs }, 'Calling kitten-cli')

  const { stdout, stderr } = await execFileAsync(kittenPath, cliArgs, {
    timeout: 30000,
    env: { ...process.env }
  })

  if (stderr) {
    logger.warn({ stderr: stderr.slice(0, 500) }, 'kitten-cli stderr')
  }

  return JSON.parse(stdout) as Record<string, unknown>
}
