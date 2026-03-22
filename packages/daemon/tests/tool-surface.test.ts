import { jest } from '@jest/globals'
import { TOOL_DEFINITIONS } from '../src/ai-tool-schema.js'
import { executeToolCall } from '../src/tool-surface.js'
import type { ToolExecutionContext, AnyToolResult } from '../src/tool-surface.js'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface MockLogger {
  info: jest.Mock
  warn: jest.Mock
  error: jest.Mock
  debug: jest.Mock
}

function createMockLogger (): MockLogger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}

function createMockFacade (overrides: Record<string, any> = {}): any {
  const account = {
    sendTransaction: jest.fn<() => Promise<{ hash: string; fee: string }>>().mockResolvedValue({ hash: '0xabc123', fee: '0.001' }),
    signTransaction: jest.fn<() => Promise<{ signedTx: string; intentHash: string; requestId: string }>>().mockResolvedValue({
      signedTx: '0xsigned_tx_data',
      intentHash: '0xintent_hash',
      requestId: 'req_sign_1'
    }),
    getBalance: jest.fn<() => Promise<Array<{ token: string; balance: string }>>>().mockResolvedValue([
      { token: 'ETH', balance: '1.5' },
      { token: 'USDC', balance: '1000' }
    ]),
    ...overrides.account
  }

  return {
    getAccount: jest.fn<() => Promise<any>>().mockResolvedValue(account),
    on: jest.fn(),
    off: jest.fn(),
    // Store read methods
    loadPolicy: jest.fn<() => Promise<{ policies: unknown[]; signature: Record<string, unknown>; accountIndex: number; chainId: number; policyVersion: number; updatedAt: number }>>().mockResolvedValue({
      policies: [{ type: 'auto', maxUsd: 100 }],
      signature: {},
      accountIndex: 0,
      chainId: 1,
      policyVersion: 1,
      updatedAt: Date.now()
    }),
    getPendingApprovals: jest.fn<() => Promise<Array<{ requestId: string; type: string; status: string }>>>().mockResolvedValue([
      { requestId: 'req_1', type: 'policy', status: 'pending' }
    ]),
    listRejections: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    listPolicyVersions: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    getPolicyVersion: jest.fn<() => Promise<number>>().mockResolvedValue(1),
    saveRejection: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    // Broker methods
    submitApproval: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    createApprovalRequest: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    ...overrides.facade
  }
}

function createMockDaemonStore (overrides: Record<string, any> = {}): any {
  return {
    saveCron: jest.fn<() => Promise<string>>().mockResolvedValue('mock-cron-id'),
    listCrons: jest.fn<() => Promise<Array<{ id: string; interval: string; prompt: string }>>>().mockResolvedValue([
      { id: 'cron_1', interval: '5m', prompt: 'check balance' }
    ]),
    removeCron: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    ...overrides
  }
}

function buildContext (overrides: Record<string, any> = {}): ToolExecutionContext & { facade: any; daemonStore: any; logger: MockLogger } {
  return {
    facade: createMockFacade(overrides),
    daemonStore: createMockDaemonStore(overrides.daemonStore),
    logger: createMockLogger() as any,
    ...overrides.extra
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TOOL_DEFINITIONS', () => {
  test('exports exactly 12 tool definitions', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(12)
  })

  test('every tool has a valid function schema', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.type).toBe('function')
      expect(tool.function.name).toBeDefined()
      expect(typeof tool.function.description).toBe('string')
      expect(tool.function.parameters).toBeDefined()
      expect(tool.function.parameters.type).toBe('object')
    }
  })
})

describe('executeToolCall', () => {
  // 1. sendTransaction -- AUTO policy (immediate execution)
  test('sendTransaction returns { status: "executed" } for AUTO policy', async () => {
    const ctx = buildContext()

    const result = await executeToolCall('sendTransaction', {
      chain: 'ethereum',
      to: '0x1234567890abcdef1234567890abcdef12345678',
      data: '0x',
      value: '1000000000000000000',
      accountIndex: 0
    }, ctx) as any

    expect(result.status).toBe('executed')
    expect(result.hash).toBe('0xabc123')
    expect(result.fee).toBe('0.001')
    expect(result.intentHash).toBeDefined()
    expect(result.intentHash!.startsWith('0x')).toBe(true)
    expect(result).not.toHaveProperty('context')
  })

  // 3. sendTransaction -- PolicyRejectionError
  test('sendTransaction returns { status: "rejected" } on PolicyRejectionError', async () => {
    const ctx = buildContext()
    const policyErr = new Error('Amount exceeds daily limit')
    policyErr.name = 'PolicyRejectionError'

    const mockAccount = {
      sendTransaction: jest.fn<() => Promise<never>>().mockRejectedValue(policyErr)
    }
    ;(ctx.facade as any).getAccount.mockResolvedValue(mockAccount)

    const result = await executeToolCall('sendTransaction', {
      chain: 'ethereum',
      to: '0xdead',
      data: '0x',
      value: '999999',
      accountIndex: 0
    }, ctx) as any

    expect(result.status).toBe('rejected')
    expect(result.reason).toBe('Amount exceeds daily limit')
    expect(result).toHaveProperty('context')
  })

  // 3b. transfer -- PolicyRejectionError (E6)
  test('transfer rejection returns rejected status', async () => {
    const ctx = buildContext()
    const policyErr = new Error('no matching permission')
    policyErr.name = 'PolicyRejectionError'

    const mockAccount = {
      sendTransaction: jest.fn<() => Promise<never>>().mockRejectedValue(policyErr)
    }
    ;(ctx.facade as any).getAccount.mockResolvedValue(mockAccount)

    const result = await executeToolCall('transfer', {
      chain: 'ethereum',
      token: 'USDC',
      to: '0xrecipient',
      amount: '100',
      accountIndex: 0
    }, ctx) as any

    expect(result.status).toBe('rejected')
    expect(result.reason).toBe('no matching permission')
  })

  // 4. transfer -- ALLOW policy
  test('transfer returns { status: "executed" } for AUTO policy', async () => {
    const ctx = buildContext()

    const result = await executeToolCall('transfer', {
      chain: 'ethereum',
      token: 'USDC',
      to: '0xrecipient',
      amount: '100',
      accountIndex: 0
    }, ctx) as any

    expect(result.status).toBe('executed')
    expect(result.hash).toBe('0xabc123')
    expect(result.token).toBe('USDC')
    expect(result.amount).toBe('100')
  })

  // 5. getBalance
  test('getBalance returns balances array', async () => {
    const ctx = buildContext()

    const result = await executeToolCall('getBalance', {
      chain: 'ethereum'
    }, ctx) as any

    expect(result.balances).toHaveLength(2)
    expect((result.balances as any[])[0].token).toBe('ETH')
    expect((result.balances as any[])[1].token).toBe('USDC')
  })

  // 6. policyList
  test('policyList returns policies from store', async () => {
    const ctx = buildContext()

    const result = await executeToolCall('policyList', {
      chain: 'ethereum'
    }, ctx) as any

    expect(result.policies).toHaveLength(1)
    expect((result.policies as any[])[0].type).toBe('auto')
  })

  // 7. policyPending
  test('policyPending returns pending requests from store', async () => {
    const ctx = buildContext()

    const result = await executeToolCall('policyPending', {
      chain: 'ethereum'
    }, ctx) as any

    expect(result.pending).toHaveLength(1)
    expect((result.pending as any[])[0].requestId).toBe('req_1')
  })

  // 8. policyRequest returns { status: "pending" }
  test('policyRequest returns { status: "pending" }', async () => {
    const ctx = buildContext()

    const result = await executeToolCall('policyRequest', {
      chain: 'ethereum',
      description: 'Increase daily limit',
      policies: [{ type: 'auto', maxUsd: 500 }],
      accountIndex: 0
    }, ctx) as any

    expect(result.status).toBe('pending')
    expect(result.policyHash).toBeDefined()
    expect(result.policyHash!.startsWith('0x')).toBe(true)

    // Verify facade.createApprovalRequest was called
    expect(ctx.facade.createApprovalRequest).toHaveBeenCalledWith('policy', expect.objectContaining({
      chainId: 1,
      targetHash: expect.any(String),
      accountIndex: 0,
      content: 'Increase daily limit'
    }))
  })

  // 9. registerCron
  test('registerCron returns { cronId, status: "registered" }', async () => {
    const ctx = buildContext()

    const result = await executeToolCall('registerCron', {
      interval: '5m',
      prompt: 'check ETH balance',
      chain: 'ethereum',
      sessionId: 'session_001',
      accountIndex: 0
    }, ctx) as any

    expect(result.status).toBe('registered')
    expect(result.cronId).toBe('mock-cron-id')
    expect(ctx.daemonStore.saveCron).toHaveBeenCalledWith(0, expect.objectContaining({
      interval: '5m',
      prompt: 'check ETH balance',
      chain: { kind: 'specific', chainId: 1 },
      sessionId: 'session_001'
    }))
  })

  // 10. listCrons
  test('listCrons returns crons from store', async () => {
    const ctx = buildContext()

    const result = await executeToolCall('listCrons', {}, ctx) as any

    expect(result.crons).toHaveLength(1)
    expect((result.crons as any[])[0].id).toBe('cron_1')
    expect(ctx.daemonStore.listCrons).toHaveBeenCalled()
  })

  // 11. removeCron
  test('removeCron returns { status: "removed" }', async () => {
    const ctx = buildContext()

    const result = await executeToolCall('removeCron', {
      cronId: 'cron_1'
    }, ctx) as any

    expect(result.status).toBe('removed')
    expect(ctx.daemonStore.removeCron).toHaveBeenCalledWith('cron_1')
  })

  // 12. Unknown tool returns error
  test('unknown tool returns { status: "error" }', async () => {
    const ctx = buildContext()

    const result = await executeToolCall('nonExistentTool', {}, ctx) as any

    expect(result.status).toBe('error')
    expect(result.error).toBe('Unknown tool: nonExistentTool')
    expect(ctx.logger.warn).toHaveBeenCalled()
    expect(result).not.toHaveProperty('context')
  })

  // 13. getBalance error propagation
  test('getBalance returns error when facade.getAccount throws', async () => {
    const ctx = buildContext()
    ;(ctx.facade as any).getAccount.mockRejectedValue(new Error('Chain not supported'))

    const result = await executeToolCall('getBalance', {
      chain: 'unsupported_chain'
    }, ctx) as any

    expect(result.status).toBe('error')
    expect(result.error).toBe('Chain not supported')
  })

  // 14. policyList with no policies
  test('policyList returns empty array when no policy exists', async () => {
    const ctx = buildContext()
    ctx.facade.loadPolicy.mockResolvedValue(null)

    const result = await executeToolCall('policyList', {
      chain: 'ethereum'
    }, ctx) as any

    expect(result.policies).toEqual([])
  })

  // 15. signTransaction -- AUTO policy (immediate signing)
  test('signTransaction returns { status: "signed" } for AUTO policy', async () => {
    const ctx = buildContext()

    const result = await executeToolCall('signTransaction', {
      chain: 'ethereum',
      to: '0x1234567890abcdef1234567890abcdef12345678',
      data: '0x',
      value: '1000000000000000000',
      accountIndex: 0
    }, ctx) as any

    expect(result.status).toBe('signed')
    expect(result.signedTx).toBe('0xsigned_tx_data')
    expect(result.intentHash).toBeDefined()
    expect(result.requestId).toBeDefined()
    expect(result).not.toHaveProperty('context')
  })

  // 16. signTransaction -- PolicyRejectionError
  test('signTransaction returns { status: "rejected" } on PolicyRejectionError', async () => {
    const ctx = buildContext()
    const policyErr = new Error('Amount exceeds daily limit')
    policyErr.name = 'PolicyRejectionError'

    const mockAccount = {
      signTransaction: jest.fn<() => Promise<never>>().mockRejectedValue(policyErr),
      sendTransaction: jest.fn<() => Promise<never>>().mockRejectedValue(policyErr)
    }
    ;(ctx.facade as any).getAccount.mockResolvedValue(mockAccount)

    const result = await executeToolCall('signTransaction', {
      chain: 'ethereum',
      to: '0xdead',
      data: '0x',
      value: '999999',
      accountIndex: 0
    }, ctx) as any

    expect(result.status).toBe('rejected')
    expect(result.reason).toBe('Amount exceeds daily limit')
    expect(result).toHaveProperty('context')
  })

  // 18. sendTransaction -- PolicyRejectionError includes context
  test('sendTransaction rejected returns context from PolicyRejectionError', async () => {
    const ctx = buildContext()
    const mockContext = {
      target: '0xdead',
      selector: '0xdeadbeef',
      effectiveRules: [{ order: 0, decision: 'REJECT' }],
      ruleFailures: [{ rule: { order: 0, decision: 'REJECT' }, failedArgs: [] }]
    }
    const policyErr = new Error('no matching permission') as any
    policyErr.name = 'PolicyRejectionError'
    policyErr.context = mockContext

    const mockAccount = {
      sendTransaction: jest.fn<() => Promise<never>>().mockRejectedValue(policyErr)
    }
    ;(ctx.facade as any).getAccount.mockResolvedValue(mockAccount)

    const result = await executeToolCall('sendTransaction', {
      chain: 'ethereum',
      to: '0xdead',
      data: '0xdeadbeef',
      value: '0',
      accountIndex: 0
    }, ctx) as any

    expect(result.status).toBe('rejected')
    expect(result.context).toEqual(expect.objectContaining({
      target: expect.any(String),
      selector: expect.any(String),
      effectiveRules: expect.any(Array),
      ruleFailures: expect.any(Array)
    }))
  })

  // 19. listRejections returns rejections from facade
  test('listRejections returns rejections from facade', async () => {
    const ctx = buildContext({
      facade: {
        listRejections: jest.fn<() => Promise<any[]>>().mockResolvedValue([
          { intentHash: 'r1', accountIndex: 0, chainId: 1, targetHash: '0x1', reason: 'no match', context: null, policyVersion: 1, rejectedAt: 1000 }
        ])
      }
    })

    const result = await executeToolCall('listRejections', {
      chain: 'ethereum',
      accountIndex: 0
    }, ctx) as any

    expect(result.rejections).toHaveLength(1)
    expect((result.rejections as any[])[0].reason).toBe('no match')
    expect(ctx.facade.listRejections).toHaveBeenCalledWith({ accountIndex: 0, chainId: 1, limit: undefined })
  })

  // 20. listPolicyVersions returns versions from facade
  test('listPolicyVersions returns versions from facade', async () => {
    const ctx = buildContext({
      facade: {
        listPolicyVersions: jest.fn<() => Promise<any[]>>().mockResolvedValue([
          { accountIndex: 0, chainId: 1, version: 1, description: 'initial', diff: null, changedAt: 1000 }
        ])
      }
    })

    const result = await executeToolCall('listPolicyVersions', {
      chain: 'ethereum',
      accountIndex: 0
    }, ctx) as any

    expect(result.policyVersions).toHaveLength(1)
    expect((result.policyVersions as any[])[0].description).toBe('initial')
    expect(ctx.facade.listPolicyVersions).toHaveBeenCalledWith(0, 1)
  })
})
