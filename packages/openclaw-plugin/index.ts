import { Type } from '@sinclair/typebox'

// ---------------------------------------------------------------------------
// WDK Tools Plugin — registers 15 DeFi agent tools callable by the LLM.
// Each tool's execute() calls the Daemon HTTP Tool API.
// ---------------------------------------------------------------------------

const DAEMON_URL = process.env.DAEMON_TOOL_API_URL || 'http://daemon:18790'
const TOKEN = process.env.TOOL_API_TOKEN || ''

async function callDaemon (toolName: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${DAEMON_URL}/api/tools/${toolName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
    },
    body: JSON.stringify({ args }),
    signal: AbortSignal.timeout(60_000)
  })

  const data = await res.json() as { ok: boolean; result?: unknown; error?: string }
  if (!data.ok) {
    return JSON.stringify({ status: 'error', error: data.error || 'Unknown error' })
  }
  return JSON.stringify(data.result)
}

function tool (name: string, description: string, parameters: unknown) {
  return {
    name,
    description,
    parameters,
    async execute (_id: string, params: Record<string, unknown>) {
      const text = await callDaemon(name, params)
      return { content: [{ type: 'text' as const, text }] }
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin Entry — stock plugin pattern: export default function register(api)
// ---------------------------------------------------------------------------

export default function register (api: { registerTool: (tool: unknown) => void }) {
  // Transaction tools
  api.registerTool(tool('sendTransaction',
    'Send a raw transaction on-chain. Returns execution result or requests approval.',
    Type.Object({
      chain: Type.String({ description: 'Target chain identifier (use "999" for HyperEVM)' }),
      to: Type.String({ description: 'Destination address (0x-prefixed)' }),
      data: Type.String({ description: 'Calldata hex string (0x-prefixed)' }),
      value: Type.String({ description: 'Value in wei as decimal string' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  // transfer 제거됨 (v0.5.5) — erc20Transfer + policyRequest + sendTransaction 플로우로 대체

  api.registerTool(tool('getBalance',
    'Get token balances for the active wallet on the specified chain.',
    Type.Object({
      chain: Type.String({ description: 'Target chain identifier' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  api.registerTool(tool('getWalletAddress',
    'Get the wallet address for the specified chain and account index.',
    Type.Object({
      chain: Type.String({ description: 'Target chain identifier' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  api.registerTool(tool('signTransaction',
    'Sign a transaction without broadcasting. Returns signed tx data for later submission.',
    Type.Object({
      chain: Type.String({ description: 'Target chain identifier (use "999" for HyperEVM)' }),
      to: Type.String({ description: 'Destination address (0x-prefixed)' }),
      data: Type.String({ description: 'Calldata hex string (0x-prefixed)' }),
      value: Type.String({ description: 'Value in wei as decimal string' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  // Policy tools
  api.registerTool(tool('policyList',
    'List active policies for the specified chain.',
    Type.Object({
      chain: Type.String({ description: 'Target chain identifier' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  api.registerTool(tool('policyPending',
    'List pending policy approval requests for the specified chain.',
    Type.Object({
      chain: Type.String({ description: 'Target chain identifier' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  api.registerTool(tool('policyRequest',
    'Request a policy change. Creates a pending request that requires owner approval.',
    Type.Object({
      chain: Type.String({ description: 'Target chain identifier' }),
      description: Type.String({ description: 'Human-readable description for the policy change' }),
      policies: Type.Array(Type.Unknown(), { description: 'Array of policy objects to apply' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  api.registerTool(tool('listRejections',
    'List transaction rejection history for the specified chain and account.',
    Type.Object({
      chain: Type.String({ description: 'Target chain identifier' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' }),
      limit: Type.Optional(Type.Number({ description: 'Maximum number of entries to return' }))
    })))

  api.registerTool(tool('listPolicyVersions',
    'List policy version history for the specified chain and account.',
    Type.Object({
      chain: Type.String({ description: 'Target chain identifier' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  // Cron tools
  api.registerTool(tool('registerCron',
    'Register a cron job that runs a prompt at a regular interval.',
    Type.Object({
      interval: Type.String({ description: 'Cron expression or duration (e.g. "5m", "1h")' }),
      prompt: Type.String({ description: 'Prompt to execute on each tick' }),
      chain: Type.String({ description: 'Target chain for the cron context' }),
      sessionId: Type.String({ description: 'Session ID for the cron conversation' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  api.registerTool(tool('listCrons',
    'List all registered cron jobs.',
    Type.Object({
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  api.registerTool(tool('removeCron',
    'Remove a registered cron job by its ID.',
    Type.Object({
      cronId: Type.String({ description: 'The cron job ID to remove' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  // ERC-20 read-only query
  api.registerTool(tool('erc20Balances',
    'Query ERC-20 token balances for an address. Pass a list of token addresses and an owner address. Returns balances in smallest unit.',
    Type.Object({
      tokens: Type.Array(Type.String(), { description: 'List of ERC-20 token contract addresses (0x-prefixed)' }),
      owner: Type.String({ description: 'Owner address to query balances for (0x-prefixed)' }),
      chain: Type.String({ description: 'Target chain identifier' })
    })))

  // DeFi (Manifest) tools — pure computation, returns { tx, policy, description }
  api.registerTool(tool('erc20Transfer',
    'Build ERC-20 transfer tx and matching policy. Does NOT execute — use sendTransaction with the returned tx.',
    Type.Object({
      token: Type.String({ description: 'Token contract address (0x-prefixed)' }),
      to: Type.String({ description: 'Recipient address (0x-prefixed)' }),
      amount: Type.String({ description: 'Amount in smallest unit (decimal string, e.g. "1000000" for 1 USDT)' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  api.registerTool(tool('erc20Approve',
    'Build ERC-20 approve tx and matching policy. Does NOT execute — use sendTransaction with the returned tx.',
    Type.Object({
      token: Type.String({ description: 'Token contract address (0x-prefixed)' }),
      spender: Type.String({ description: 'Spender address to approve (0x-prefixed)' }),
      amount: Type.String({ description: 'Allowance amount in smallest unit (decimal string)' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))

  api.registerTool(tool('hyperlendDepositUsdt',
    'Build HyperLend USDT0 deposit (supply) tx and matching policy on HyperEVM (chain 999). Does NOT execute — use sendTransaction with the returned tx. Requires prior erc20Approve for USDT0 to HyperLend Pool.',
    Type.Object({
      amount: Type.String({ description: 'Deposit amount in smallest unit (6 decimals, e.g. "1000000" for 1 USDT0)' }),
      onBehalfOf: Type.String({ description: 'Depositor address (0x-prefixed)' }),
      accountIndex: Type.Number({ description: 'BIP-44 account index' })
    })))
}
