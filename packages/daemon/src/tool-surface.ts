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
  account: any
  broker: any
  store: any
  seedId: string
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
  intentId?: string
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
}

interface SendTransactionArgs {
  chain: string
  to: string
  data: string
  value: string
}

interface TransferArgs {
  chain: string
  token: string
  to: string
  amount: string
}

interface ChainArgs {
  chain: string
}

interface PolicyRequestArgs {
  chain: string
  reason: string
  policies: Record<string, unknown>[]
}

interface RegisterCronArgs {
  interval: string
  prompt: string
  chain: string
  sessionId: string
}

interface CronIdArgs {
  cronId: string
}

type ToolArgs = SendTransactionArgs | TransferArgs | ChainArgs | PolicyRequestArgs | RegisterCronArgs | CronIdArgs | Record<string, unknown>

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
          value: { type: 'string', description: 'Value in wei as decimal string' }
        },
        required: ['chain', 'to', 'data', 'value']
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
          amount: { type: 'string', description: 'Amount as decimal string (human-readable)' }
        },
        required: ['chain', 'token', 'to', 'amount']
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
          chain: { type: 'string', description: 'Target chain identifier' }
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
          chain: { type: 'string', description: 'Target chain identifier' }
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
          chain: { type: 'string', description: 'Target chain identifier' }
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
          reason: { type: 'string', description: 'Human-readable reason for the policy change' },
          policies: {
            type: 'array',
            description: 'Array of policy objects to apply',
            items: { type: 'object' }
          }
        },
        required: ['chain', 'reason', 'policies']
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
          sessionId: { type: 'string', description: 'Session ID for the cron conversation' }
        },
        required: ['interval', 'prompt', 'chain', 'sessionId']
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
        properties: {}
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
          cronId: { type: 'string', description: 'The cron job ID to remove' }
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
          value: { type: 'string', description: 'Value in wei as decimal string' }
        },
        required: ['chain', 'to', 'data', 'value']
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
  const { wdk, broker, store, seedId, logger, journal } = wdkContext

  switch (name) {
    // -----------------------------------------------------------------------
    // 1. sendTransaction
    // -----------------------------------------------------------------------
    case 'sendTransaction': {
      const { chain, to, data, value } = args as SendTransactionArgs
      const chainId = resolveChainId(chain)
      const hash = intentHash({ chainId, to, data, value })
      const intentId = randomUUID()

      // Deduplicate via journal
      if (journal && journal.isDuplicate(hash)) {
        logger.info({ hash }, 'Duplicate intent detected, skipping.')
        return { status: 'duplicate', intentHash: hash }
      }

      // Track in journal
      if (journal) {
        journal.track(intentId, { seedId, chainId, targetHash: hash })
      }

      try {
        const account = await wdk.getAccount(chain, 0)

        // Race sendTransaction against the ApprovalRequested event.
        const approvalBroker = wdk.getApprovalBroker ? wdk.getApprovalBroker() : null

        let approvalListener: ((evt: any) => void) | undefined
        const approvalPromise: Promise<any> = approvalBroker
          ? new Promise((resolve) => {
            approvalListener = (evt: any) => resolve(evt)
            wdk.on('ApprovalRequested', approvalListener!)
          })
          : new Promise<never>(() => {}) // never resolves if no broker

        const txPromise = account.sendTransaction({ to, data, value })

        const result = await Promise.race([
          txPromise.then((res: any) => ({ kind: 'completed' as const, res })),
          approvalPromise.then((evt: any) => ({ kind: 'approval_requested' as const, evt }))
        ])

        // Clean up listener
        if (approvalListener) wdk.off('ApprovalRequested', approvalListener)

        if (result.kind === 'completed') {
          // AUTO or no-policy path -- tx executed synchronously
          if (journal) journal.updateStatus(intentId, 'settled', result.res?.hash)
          return {
            status: 'executed',
            hash: result.res?.hash || null,
            fee: result.res?.fee || null,
            intentHash: hash
          }
        }

        // REQUIRE_APPROVAL -- return immediately, let background tx complete after approval
        const requestId = result.evt?.requestId || intentId
        if (journal) journal.updateStatus(intentId, 'pending_approval')

        txPromise
          .then((txResult: any) => {
            if (journal) journal.updateStatus(intentId, 'settled', txResult?.hash)
            logger.info({ requestId, hash: txResult?.hash }, 'Background tx completed after approval')

            if (wdkContext.relayClient) {
              wdkContext.relayClient.send('control', {
                type: 'approval_result',
                requestId,
                intentHash: hash,
                status: 'executed',
                txHash: txResult?.hash || null,
                fee: txResult?.fee || null
              })
            }
          })
          .catch((bgErr: Error) => {
            if (journal) journal.updateStatus(intentId, 'failed')
            logger.error({ err: bgErr, requestId }, 'Background tx failed after approval')

            if (wdkContext.relayClient) {
              wdkContext.relayClient.send('control', {
                type: 'approval_error',
                requestId,
                intentHash: hash,
                error: bgErr.message
              })
            }
          })

        return {
          status: 'pending_approval',
          requestId,
          intentHash: hash,
          context: result.evt?.context ?? null
        }
      } catch (err: any) {
        if (err.name === 'PolicyRejectionError') {
          if (journal) journal.updateStatus(intentId, 'rejected')
          return { status: 'rejected', reason: err.message, intentHash: hash, context: err.context ?? null }
        }

        if (err.name === 'ApprovalTimeoutError') {
          if (journal) journal.updateStatus(intentId, 'failed')
          return { status: 'approval_timeout', requestId: err.requestId || intentId, intentHash: hash }
        }

        if (journal) journal.updateStatus(intentId, 'failed')
        logger.error({ err, name: 'sendTransaction' }, 'Tool execution error')
        return { status: 'error', error: err.message, intentHash: hash }
      }
    }

    // -----------------------------------------------------------------------
    // 2. transfer
    // -----------------------------------------------------------------------
    case 'transfer': {
      const { chain, token, to, amount } = args as TransferArgs
      const transferIntentId = randomUUID()

      try {
        const account = await wdk.getAccount(chain, 0)
        const txData = encodeTransferData(token, to, amount)
        const txValue = token.toLowerCase() === 'eth' ? amount : '0'

        // Race sendTransaction against the ApprovalRequested event (same pattern as sendTransaction)
        const approvalBroker = wdk.getApprovalBroker ? wdk.getApprovalBroker() : null

        let approvalListener: ((evt: any) => void) | undefined
        const approvalPromise: Promise<any> = approvalBroker
          ? new Promise((resolve) => {
            approvalListener = (evt: any) => resolve(evt)
            wdk.on('ApprovalRequested', approvalListener!)
          })
          : new Promise<never>(() => {})

        const txPromise = account.sendTransaction({ to, data: txData, value: txValue })

        const result = await Promise.race([
          txPromise.then((res: any) => ({ kind: 'completed' as const, res })),
          approvalPromise.then((evt: any) => ({ kind: 'approval_requested' as const, evt }))
        ])

        if (approvalListener) wdk.off('ApprovalRequested', approvalListener)

        if (result.kind === 'completed') {
          return {
            status: 'executed',
            hash: result.res?.hash || null,
            fee: result.res?.fee || null,
            token,
            amount
          }
        }

        // REQUIRE_APPROVAL path
        const requestId = result.evt?.requestId || transferIntentId

        txPromise
          .then((txResult: any) => {
            logger.info({ requestId, hash: txResult?.hash }, 'Background transfer completed')
            if (wdkContext.relayClient) {
              wdkContext.relayClient.send('control', {
                type: 'approval_result',
                requestId,
                status: 'executed',
                txHash: txResult?.hash || null,
                token,
                amount
              })
            }
          })
          .catch((bgErr: Error) => {
            logger.error({ err: bgErr, requestId }, 'Background transfer failed')
            if (wdkContext.relayClient) {
              wdkContext.relayClient.send('control', {
                type: 'approval_error',
                requestId,
                error: bgErr.message
              })
            }
          })

        return { status: 'pending_approval', requestId, token, amount, context: result.evt?.context ?? null }
      } catch (err: any) {
        if (err.name === 'PolicyRejectionError') {
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
        const account = await wdk.getAccount(chain, 0)
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
        const policy = await store.loadPolicy(seedId, chainId)
        return { policies: policy ? JSON.parse(policy.policiesJson) : [] }
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
        const pending = await store.loadPendingApprovals(seedId, 'policy', chainId)
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
      const { chain, reason, policies } = args as PolicyRequestArgs
      try {
        const chainId = resolveChainId(chain)
        const hash = policyHash(policies as any)
        const requestId = randomUUID()

        await broker.createRequest('policy', {
          chainId,
          targetHash: hash,
          requestId,
          metadata: { seedId, reason, policies }
        })

        return { requestId, status: 'pending', policyHash: hash }
      } catch (err: any) {
        logger.error({ err, name: 'policyRequest' }, 'Tool execution error')
        return { status: 'error', error: err.message }
      }
    }

    // -----------------------------------------------------------------------
    // 7. registerCron
    // -----------------------------------------------------------------------
    case 'registerCron': {
      const { interval, prompt, chain, sessionId } = args as RegisterCronArgs
      try {
        const chainId = resolveChainId(chain)
        const cronId = await store.saveCron(seedId, {
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
        const crons = await store.listCrons(seedId)
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
      const { chain, to, data, value } = args as SendTransactionArgs
      const chainId = resolveChainId(chain)
      const hash = intentHash({ chainId, to, data, value })
      const intentId = randomUUID()

      // Deduplicate via journal
      if (journal && journal.isDuplicate(hash)) {
        logger.info({ hash }, 'Duplicate intent detected, skipping.')
        return { status: 'duplicate', intentHash: hash }
      }

      // Track in journal
      if (journal) {
        journal.track(intentId, { seedId, chainId, targetHash: hash })
      }

      try {
        const account = await wdk.getAccount(chain, 0)

        // Race signTransaction against the ApprovalRequested event.
        const approvalBroker = wdk.getApprovalBroker ? wdk.getApprovalBroker() : null

        let approvalListener: ((evt: any) => void) | undefined
        const approvalPromise: Promise<any> = approvalBroker
          ? new Promise((resolve) => {
            approvalListener = (evt: any) => resolve(evt)
            wdk.on('ApprovalRequested', approvalListener!)
          })
          : new Promise<never>(() => {})

        const signPromise = account.signTransaction({ to, data, value })

        const result = await Promise.race([
          signPromise.then((res: any) => ({ kind: 'completed' as const, res })),
          approvalPromise.then((evt: any) => ({ kind: 'approval_requested' as const, evt }))
        ])

        // Clean up listener
        if (approvalListener) wdk.off('ApprovalRequested', approvalListener)

        if (result.kind === 'completed') {
          // AUTO or no-policy path -- tx signed synchronously
          if (journal) journal.updateStatus(intentId, 'signed')
          return {
            status: 'signed',
            signedTx: result.res?.signedTx || null,
            intentHash: result.res?.intentHash || hash,
            requestId: result.res?.requestId || intentId,
            intentId: result.res?.intentId || intentId
          }
        }

        // REQUIRE_APPROVAL -- return immediately, let background sign complete after approval
        const requestId = result.evt?.requestId || intentId
        if (journal) journal.updateStatus(intentId, 'pending_approval')

        signPromise
          .then((signResult: any) => {
            if (journal) journal.updateStatus(intentId, 'signed')
            logger.info({ requestId, intentHash: hash }, 'Background sign completed after approval')

            if (wdkContext.relayClient) {
              wdkContext.relayClient.send('control', {
                type: 'sign_result',
                requestId,
                intentHash: hash,
                status: 'signed',
                signedTx: signResult?.signedTx || null
              })
            }
          })
          .catch((bgErr: Error) => {
            if (journal) journal.updateStatus(intentId, 'failed')
            logger.error({ err: bgErr, requestId }, 'Background sign failed after approval')

            if (wdkContext.relayClient) {
              wdkContext.relayClient.send('control', {
                type: 'sign_error',
                requestId,
                intentHash: hash,
                error: bgErr.message
              })
            }
          })

        return {
          status: 'pending_approval',
          requestId,
          intentHash: hash,
          intentId,
          context: result.evt?.context ?? null
        }
      } catch (err: any) {
        if (err.name === 'PolicyRejectionError') {
          if (journal) journal.updateStatus(intentId, 'rejected')
          return { status: 'rejected', reason: err.message, intentHash: hash, context: err.context ?? null }
        }

        if (err.name === 'ApprovalTimeoutError') {
          if (journal) journal.updateStatus(intentId, 'failed')
          return { status: 'approval_timeout', requestId: err.requestId || intentId, intentHash: hash }
        }

        if (journal) journal.updateStatus(intentId, 'failed')
        logger.error({ err, name: 'signTransaction' }, 'Tool execution error')
        return { status: 'error', error: err.message, intentHash: hash }
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
