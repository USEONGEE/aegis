import { evaluatePolicy, validatePolicies } from '../src/guarded-middleware.js'

describe('evaluatePolicy', () => {
  const aavePool = '0x1234567890abcdef1234567890abcdef12345678'
  const usdcAddr = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
  const repaySelector = '0x573ade81'
  const approveSelector = '0x095ea7b3'

  const makeTx = (to: string, selector: string, args: string = '') => ({
    to,
    value: 0,
    data: selector + args
  })

  const policies = {
    ethereum: {
      policies: [
        { type: 'timestamp' as const, validAfter: 1000000000, validUntil: 2000000000 },
        {
          type: 'call' as const,
          permissions: [
            {
              target: aavePool,
              selector: repaySelector,
              args: { 1: { condition: 'LTE' as const, value: '1000' } },
              decision: 'AUTO' as const
            },
            {
              target: aavePool,
              selector: repaySelector,
              decision: 'REQUIRE_APPROVAL' as const
            },
            {
              target: usdcAddr,
              selector: approveSelector,
              args: {
                0: { condition: 'EQ' as const, value: aavePool },
                1: { condition: 'LTE' as const, value: '5000' }
              },
              decision: 'AUTO' as const
            }
          ]
        }
      ]
    }
  }

  test('matches first permission: repay small amount -> AUTO', () => {
    const amount = (500n).toString(16).padStart(64, '0')
    const arg0 = usdcAddr.replace('0x', '').padStart(64, '0')
    const tx = makeTx(aavePool, repaySelector, arg0 + amount)

    const result = evaluatePolicy(policies, 'ethereum', tx)
    expect(result.decision).toBe('AUTO')
  })

  test('falls through to second permission: repay large amount -> REQUIRE_APPROVAL', () => {
    const amount = (5000n).toString(16).padStart(64, '0')
    const arg0 = usdcAddr.replace('0x', '').padStart(64, '0')
    const tx = makeTx(aavePool, repaySelector, arg0 + amount)

    const result = evaluatePolicy(policies, 'ethereum', tx)
    expect(result.decision).toBe('REQUIRE_APPROVAL')
  })

  test('no matching permission -> REJECT', () => {
    const tx = makeTx('0x0000000000000000000000000000000000000000', '0xdeadbeef', '00'.repeat(32))
    const result = evaluatePolicy(policies, 'ethereum', tx)
    expect(result.decision).toBe('REJECT')
  })

  test('no policies for chain -> REJECT', () => {
    const tx = makeTx(aavePool, repaySelector, '00'.repeat(64))
    const result = evaluatePolicy(policies, 'bitcoin', tx)
    expect(result.decision).toBe('REJECT')
    expect(result.reason).toBe('no policies for chain')
  })

  test('empty permissions -> REJECT', () => {
    const emptyPolicies = { ethereum: { policies: [{ type: 'call' as const, permissions: [] }] } }
    const tx = makeTx(aavePool, repaySelector, '00'.repeat(64))
    const result = evaluatePolicy(emptyPolicies, 'ethereum', tx)
    expect(result.decision).toBe('REJECT')
  })

  test('missing tx.to -> REJECT', () => {
    const result = evaluatePolicy(policies, 'ethereum', { data: '0xdeadbeef' })
    expect(result.decision).toBe('REJECT')
    expect(result.reason).toBe('missing tx.to')
  })

  test('missing tx.data (< 4 bytes) -> REJECT', () => {
    const result = evaluatePolicy(policies, 'ethereum', { to: aavePool, data: '0x12' })
    expect(result.decision).toBe('REJECT')
  })

  test('approve with correct spender + bounded amount -> AUTO', () => {
    const spender = aavePool.replace('0x', '').padStart(64, '0')
    const amount = (3000n).toString(16).padStart(64, '0')
    const tx = makeTx(usdcAddr, approveSelector, spender + amount)

    const result = evaluatePolicy(policies, 'ethereum', tx)
    expect(result.decision).toBe('AUTO')
  })

  test('approve with wrong spender -> REJECT', () => {
    const wrongSpender = '0000000000000000000000000000000000000099'.padStart(64, '0')
    const amount = (100n).toString(16).padStart(64, '0')
    const tx = makeTx(usdcAddr, approveSelector, wrongSpender + amount)

    const result = evaluatePolicy(policies, 'ethereum', tx)
    expect(result.decision).toBe('REJECT')
  })

  test('approve with excessive amount -> REJECT (falls through)', () => {
    const spender = aavePool.replace('0x', '').padStart(64, '0')
    const amount = (99999n).toString(16).padStart(64, '0')
    const tx = makeTx(usdcAddr, approveSelector, spender + amount)

    const result = evaluatePolicy(policies, 'ethereum', tx)
    expect(result.decision).toBe('REJECT')
  })
})

describe('evaluatePolicy timestamp gate', () => {
  test('validAfter in future -> REJECT too early', () => {
    const futurePolicy = {
      ethereum: {
        policies: [
          { type: 'timestamp' as const, validAfter: Date.now() / 1000 + 9999 },
          { type: 'call' as const, permissions: [{ target: '0x01', decision: 'AUTO' as const }] }
        ]
      }
    }
    const result = evaluatePolicy(futurePolicy, 'ethereum', { to: '0x01', data: '0xdeadbeef' + '00'.repeat(32) })
    expect(result.decision).toBe('REJECT')
    expect(result.reason).toBe('too early')
  })

  test('validUntil in past -> REJECT expired', () => {
    const expiredPolicy = {
      ethereum: {
        policies: [
          { type: 'timestamp' as const, validUntil: 1000000 },
          { type: 'call' as const, permissions: [{ target: '0x01', decision: 'AUTO' as const }] }
        ]
      }
    }
    const result = evaluatePolicy(expiredPolicy, 'ethereum', { to: '0x01', data: '0xdeadbeef' + '00'.repeat(32) })
    expect(result.decision).toBe('REJECT')
    expect(result.reason).toBe('expired')
  })
})

describe('validatePolicies', () => {
  test('valid policies pass', () => {
    expect(() => validatePolicies([
      { type: 'timestamp' as const, validAfter: 100 },
      { type: 'call' as const, permissions: [{ decision: 'AUTO' as const }] }
    ])).not.toThrow()
  })

  test('invalid type throws', () => {
    expect(() => validatePolicies([{ type: 'unknown' } as never])).toThrow('Unsupported policy type')
  })

  test('missing decision throws', () => {
    expect(() => validatePolicies([{ type: 'call' as const, permissions: [{} as never] }])).toThrow('decision')
  })

  test('invalid operator throws', () => {
    expect(() => validatePolicies([{
      type: 'call' as const,
      permissions: [{ decision: 'AUTO' as const, args: { 0: { condition: 'INVALID' as never, value: '1' } } }]
    }])).toThrow('Invalid condition operator')
  })
})
