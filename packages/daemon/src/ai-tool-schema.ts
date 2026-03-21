// ---------------------------------------------------------------------------
// AI Tool Schema — ToolDefinition interface + TOOL_DEFINITIONS const
// Separated from tool-surface.ts (v0.2.11, Step 01)
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
