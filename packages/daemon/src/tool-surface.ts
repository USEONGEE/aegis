import { randomUUID } from 'node:crypto'
import { intentHash, policyHash, CHAIN_IDS } from '@wdk-app/canonical'
import type { Logger } from 'pino'
import type { WDKInstance } from './wdk-host.js'
import type { RelayClient } from './relay-client.js'
import type { ExecutionJournal } from './execution-journal.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description: string; items?: { type: string }; enum?: string[] }>
      required?: string[]
    }
  }
}

export interface WDKContext {
  wdk: WDKInstance
  broker: any
  store: any
  logger: Logger
  journal: ExecutionJournal | null
  relayClient?: RelayClient
}

export interface ToolResult {
  status?: string
  hash?: string | null
  fee?: string | null
  intentHash?: string
  error?: string
  reason?: string
  requestId?: string
  signedTx?: string
  policyHash?: string
  token?: string
  amount?: string
  cronId?: string
  balances?: unknown[]
  policies?: unknown[]
  pending?: unknown[]
  crons?: unknown[]
  context?: unknown
  rejections?: unknown[]
  policyVersions?: unknown[]
}

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
// 9 Agent Tool Definitions (OpenAI function calling JSON schema)
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'sendTransaction',
      description: 'Send a raw transaction on-chain. Returns execution result or requests approval.',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Target chain identifier (e.g. "ethereum")' },
          to: { type: 'string', description: 'Destination address (0x-prefixed)' },
          data: { type: 'string', description: 'Calldata hex string (0x-prefixed)' },
          value: { type: 'string', description: 'Value in wei as decimal string' },
          accountIndex: { type: 'number', description: 'BIP-44 account index' }
        },
        required: ['chain', 'to', 'data', 'value', 'accountIndex']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'transfer',
      description: 'Transfer a token to an address. High-level wrapper around sendTransaction.',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Target chain identifier' },
          token: { type: 'string', description: 'Token symbol or contract address' },
          to: { type: 'string', description: 'Recipient address' },
          amount: { type: 'string', description: 'Amount as decimal string (human-readable)' },
          accountIndex: { type: 'number', description: 'BIP-44 account index' }
        },
        required: ['chain', 'token', 'to', 'amount', 'accountIndex']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getBalance',
      description: 'Get token balances for the active wallet on the specified chain.',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Target chain identifier' },
          accountIndex: { type: 'number', description: 'BIP-44 account index' }
        },
        required: ['chain']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'policyList',
      description: 'List active policies for the specified chain.',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Target chain identifier' },
          accountIndex: { type: 'number', description: 'BIP-44 account index' }
        },
        required: ['chain']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'policyPending',
      description: 'List pending policy approval requests for the specified chain.',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Target chain identifier' },
          accountIndex: { type: 'number', description: 'BIP-44 account index' }
        },
        required: ['chain']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'policyRequest',
      description: 'Request a policy change. Creates a pending request that requires owner approval.',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Target chain identifier' },
          description: { type: 'string', description: 'Human-readable description for the policy change' },
          policies: {
            type: 'array',
            description: 'Array of policy objects to apply',
            items: { type: 'object' }
          },
          accountIndex: { type: 'number', description: 'BIP-44 account index' }
        },
        required: ['chain', 'description', 'policies', 'accountIndex']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'registerCron',
      description: 'Register a cron job that runs a prompt at a regular interval.',
      parameters: {
        type: 'object',
        properties: {
          interval: { type: 'string', description: 'Cron expression or duration (e.g. "5m", "1h", "0 * * * *")' },
          prompt: { type: 'string', description: 'Prompt to execute on each tick' },
          chain: { type: 'string', description: 'Target chain for the cron context' },
          sessionId: { type: 'string', description: 'Session ID for the cron conversation' },
          accountIndex: { type: 'number', description: 'BIP-44 account index' }
        },
        required: ['interval', 'prompt', 'chain', 'sessionId', 'accountIndex']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listCrons',
      description: 'List all registered cron jobs.',
      parameters: {
        type: 'object',
        properties: {
          accountIndex: { type: 'number', description: 'BIP-44 account index' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'removeCron',
      description: 'Remove a registered cron job by its ID.',
      parameters: {
        type: 'object',
        properties: {
          cronId: { type: 'string', description: 'The cron job ID to remove' },
          accountIndex: { type: 'number', description: 'BIP-44 account index' }
        },
        required: ['cronId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'signTransaction',
      description: 'Sign a transaction without broadcasting. Returns signed tx data for later submission.',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Target chain identifier (e.g. "ethereum")' },
          to: { type: 'string', description: 'Destination address (0x-prefixed)' },
          data: { type: 'string', description: 'Calldata hex string (0x-prefixed)' },
          value: { type: 'string', description: 'Value in wei as decimal string' },
          accountIndex: { type: 'number', description: 'BIP-44 account index' }
        },
        required: ['chain', 'to', 'data', 'value', 'accountIndex']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listRejections',
      description: 'List transaction rejection history for the specified chain and account.',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Target chain identifier' },
          accountIndex: { type: 'number', description: 'BIP-44 account index' },
          limit: { type: 'number', description: 'Maximum number of entries to return' }
        },
        required: ['chain', 'accountIndex']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listPolicyVersions',
      description: 'List policy version history for the specified chain and account.',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Target chain identifier' },
          accountIndex: { type: 'number', description: 'BIP-44 account index' }
        },
        required: ['chain', 'accountIndex']
      }
    }
  }
]

// ---------------------------------------------------------------------------
// Tool call dispatcher
// ---------------------------------------------------------------------------

/**
 * Execute a single tool call.
 */
export async function executeToolCall (name: string, args: ToolArgs, wdkContext: WDKContext): Promise<ToolResult> {
  const { wdk, broker, store, logger, journal } = wdkContext
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
