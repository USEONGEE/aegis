import { evaluatePolicy, validatePolicies, permissionsToDict } from '../src/guarded-middleware.js'

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
    1: {
      policies: [
        { type: 'timestamp' as const, validAfter: 1000000000, validUntil: 2000000000 },
        {
          type: 'call' as const,
          permissions: permissionsToDict([
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
          ])
        }
      ]
    }
  }

  test('matches first permission: repay small amount -> AUTO', () => {
    const amount = (500n).toString(16).padStart(64, '0')
    const arg0 = usdcAddr.replace('0x', '').padStart(64, '0')
    const tx = makeTx(aavePool, repaySelector, arg0 + amount)

    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('AUTO')
    expect(result.context).toBeNull()
  })

  test('falls through to second permission: repay large amount -> REQUIRE_APPROVAL', () => {
    const amount = (5000n).toString(16).padStart(64, '0')
    const arg0 = usdcAddr.replace('0x', '').padStart(64, '0')
    const tx = makeTx(aavePool, repaySelector, arg0 + amount)

    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('REQUIRE_APPROVAL')
    expect(result.context).not.toBeNull()
    expect(result.context!.target).toBe(aavePool)
    expect(result.context!.selector).toBe(repaySelector)
    expect(result.context!.effectiveRules).toEqual(expect.any(Array))
    expect(result.context!.effectiveRules.length).toBe(2)
    expect(result.context!.ruleFailures).toEqual(expect.any(Array))
    expect(result.context!.ruleFailures.length).toBe(1)
    expect(result.context!.ruleFailures[0].failedArgs.length).toBeGreaterThan(0)
    expect(result.context!.ruleFailures[0].failedArgs[0].argIndex).toBe('1')
    expect(result.context!.ruleFailures[0].failedArgs[0].condition).toBe('LTE')
  })

  test('no matching permission -> REJECT', () => {
    const tx = makeTx('0x0000000000000000000000000000000000000000', '0xdeadbeef', '00'.repeat(32))
    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('REJECT')
    expect(result.context).toBeNull()
  })

  test('no policies for chain -> REJECT', () => {
    const tx = makeTx(aavePool, repaySelector, '00'.repeat(64))
    const result = evaluatePolicy(policies, 999, tx)
    expect(result.decision).toBe('REJECT')
    expect(result.reason).toBe('no policies for chain')
    expect(result.context).toBeNull()
  })

  test('empty permissions -> REJECT', () => {
    const emptyPolicies = { 1: { policies: [{ type: 'call' as const, permissions: {} }] } }
    const tx = makeTx(aavePool, repaySelector, '00'.repeat(64))
    const result = evaluatePolicy(emptyPolicies, 1, tx)
    expect(result.decision).toBe('REJECT')
    expect(result.context).toBeNull()
  })

  test('missing tx.to -> REJECT', () => {
    const result = evaluatePolicy(policies, 1, { data: '0xdeadbeef' })
    expect(result.decision).toBe('REJECT')
    expect(result.reason).toBe('missing tx.to')
    expect(result.context).toBeNull()
  })

  test('missing tx.data (< 4 bytes) -> REJECT', () => {
    const result = evaluatePolicy(policies, 1, { to: aavePool, data: '0x12' })
    expect(result.decision).toBe('REJECT')
    expect(result.context).toBeNull()
  })

  test('approve with correct spender + bounded amount -> AUTO', () => {
    const spender = aavePool.replace('0x', '').padStart(64, '0')
    const amount = (3000n).toString(16).padStart(64, '0')
    const tx = makeTx(usdcAddr, approveSelector, spender + amount)

    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('AUTO')
    expect(result.context).toBeNull()
  })

  test('approve with wrong spender -> REJECT with context', () => {
    const wrongSpender = '0000000000000000000000000000000000000099'.padStart(64, '0')
    const amount = (100n).toString(16).padStart(64, '0')
    const tx = makeTx(usdcAddr, approveSelector, wrongSpender + amount)

    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('REJECT')
    expect(result.context).not.toBeNull()
    expect(result.context!.effectiveRules.length).toBe(1)
    expect(result.context!.ruleFailures.length).toBe(1)
    expect(result.context!.ruleFailures[0].failedArgs[0].argIndex).toBe('0')
    expect(result.context!.ruleFailures[0].failedArgs[0].condition).toBe('EQ')
  })

  test('approve with excessive amount -> REJECT with context (args fail)', () => {
    const spender = aavePool.replace('0x', '').padStart(64, '0')
    const amount = (99999n).toString(16).padStart(64, '0')
    const tx = makeTx(usdcAddr, approveSelector, spender + amount)

    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('REJECT')
    expect(result.context).not.toBeNull()
    expect(result.context!.ruleFailures.length).toBe(1)
    expect(result.context!.ruleFailures[0].failedArgs[0].argIndex).toBe('1')
    expect(result.context!.ruleFailures[0].failedArgs[0].condition).toBe('LTE')
  })
})

describe('evaluatePolicy timestamp gate', () => {
  test('validAfter in future -> REJECT too early', () => {
    const futurePolicy = {
      1: {
        policies: [
          { type: 'timestamp' as const, validAfter: Date.now() / 1000 + 9999 },
          { type: 'call' as const, permissions: permissionsToDict([{ target: '0x01', decision: 'AUTO' as const }]) }
        ]
      }
    }
    const result = evaluatePolicy(futurePolicy, 1, { to: '0x01', data: '0xdeadbeef' + '00'.repeat(32) })
    expect(result.decision).toBe('REJECT')
    expect(result.reason).toBe('too early')
    expect(result.context).toBeNull()
  })

  test('validUntil in past -> REJECT expired', () => {
    const expiredPolicy = {
      1: {
        policies: [
          { type: 'timestamp' as const, validUntil: 1000000 },
          { type: 'call' as const, permissions: permissionsToDict([{ target: '0x01', decision: 'AUTO' as const }]) }
        ]
      }
    }
    const result = evaluatePolicy(expiredPolicy, 1, { to: '0x01', data: '0xdeadbeef' + '00'.repeat(32) })
    expect(result.decision).toBe('REJECT')
    expect(result.reason).toBe('expired')
    expect(result.context).toBeNull()
  })

  test('no call policy -> REJECT', () => {
    const noPolicyConfig = { 1: { policies: [{ type: 'timestamp' as const }] } }
    const result = evaluatePolicy(noPolicyConfig, 1, { to: '0x01', data: '0xdeadbeef' + '00'.repeat(32) })
    expect(result.decision).toBe('REJECT')
    expect(result.reason).toBe('no call policy')
    expect(result.context).toBeNull()
  })
})

describe('evaluatePolicy wildcard order preservation', () => {
  const aavePool = '0x1234567890abcdef1234567890abcdef12345678'
  const repaySelector = '0x573ade81'

  const makeTx = (to: string, selector: string, args: string = '') => ({
    to,
    value: 0,
    data: selector + args
  })

  test('wildcard-first: wildcard rule with lower order takes priority over specific rule', () => {
    const perms = permissionsToDict([
      { decision: 'REJECT' as const },           // order 0: wildcard target+selector, matches everything
      { target: aavePool, selector: repaySelector, decision: 'AUTO' as const }  // order 1: specific
    ])
    const policies = { 1: { policies: [{ type: 'call' as const, permissions: perms }] } }
    const tx = makeTx(aavePool, repaySelector, '00'.repeat(64))
    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('REJECT')  // wildcard has lower order, matches first
    expect(result.context).toBeNull()  // REJECT via matched rule → context null (not "no matching permission")
  })

  test('specific-first: specific rule with lower order takes priority over wildcard', () => {
    const perms = permissionsToDict([
      { target: aavePool, selector: repaySelector, decision: 'AUTO' as const },  // order 0: specific
      { decision: 'REJECT' as const }             // order 1: wildcard
    ])
    const policies = { 1: { policies: [{ type: 'call' as const, permissions: perms }] } }
    const tx = makeTx(aavePool, repaySelector, '00'.repeat(64))
    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('AUTO')  // specific has lower order, matches first
    expect(result.context).toBeNull()
  })

  test('wildcard rules included in effectiveRules', () => {
    const perms = permissionsToDict([
      { target: aavePool, selector: repaySelector, args: { 0: { condition: 'EQ' as const, value: '0xffff' } }, decision: 'AUTO' as const },
      { decision: 'REQUIRE_APPROVAL' as const }
    ])
    const policies = { 1: { policies: [{ type: 'call' as const, permissions: perms }] } }
    const tx = makeTx(aavePool, repaySelector, '00'.repeat(64))
    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('REQUIRE_APPROVAL')
    expect(result.context).not.toBeNull()
    expect(result.context!.effectiveRules.length).toBe(2)
    expect(result.context!.ruleFailures.length).toBe(1)
  })
})

describe('evaluatePolicy edge cases', () => {
  const target = '0x1234567890abcdef1234567890abcdef12345678'
  const selector = '0xdeadbeef'
  const makeTx = (to: string, sel: string, args: string = '') => ({
    to,
    value: 0,
    data: sel + args
  })

  test('E1: candidates empty + no matching permission -> context null', () => {
    const perms = permissionsToDict([
      { target: '0x9999999999999999999999999999999999999999', selector: '0x11111111', decision: 'AUTO' as const }
    ])
    const policies = { 1: { policies: [{ type: 'call' as const, permissions: perms }] } }
    const tx = makeTx(target, selector, '00'.repeat(32))
    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('REJECT')
    expect(result.reason).toBe('no matching permission')
    expect(result.context).toBeNull()
  })

  test('E2: all candidates args-fail -> ruleFailures covers all', () => {
    const perms = permissionsToDict([
      { target, selector, args: { 0: { condition: 'EQ' as const, value: '0xaaaa' } }, decision: 'AUTO' as const },
      { target, selector, args: { 0: { condition: 'EQ' as const, value: '0xbbbb' } }, decision: 'AUTO' as const }
    ])
    const policies = { 1: { policies: [{ type: 'call' as const, permissions: perms }] } }
    const tx = makeTx(target, selector, '00'.repeat(32))
    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('REJECT')
    expect(result.context).not.toBeNull()
    expect(result.context!.ruleFailures.length).toBe(2)
    expect(result.context!.ruleFailures[0].failedArgs.length).toBeGreaterThan(0)
    expect(result.context!.ruleFailures[1].failedArgs.length).toBeGreaterThan(0)
  })

  test('E3: mix of args-fail and valueLimit-exceed', () => {
    const perms = permissionsToDict([
      { target, selector, args: { 0: { condition: 'EQ' as const, value: '0xaaaa' } }, decision: 'AUTO' as const },
      { target, selector, valueLimit: '0', decision: 'AUTO' as const }
    ])
    const policies = { 1: { policies: [{ type: 'call' as const, permissions: perms }] } }
    const tx = makeTx(target, selector, '00'.repeat(32))
    tx.value = 100
    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('REJECT')
    expect(result.context).not.toBeNull()
    expect(result.context!.ruleFailures.length).toBe(2)
    expect(result.context!.ruleFailures[0].failedArgs.length).toBeGreaterThan(0)
    expect(result.context!.ruleFailures[1].failedArgs.length).toBe(0)
  })

  test('E4: REQUIRE_APPROVAL after AUTO args-fail -> ruleFailures includes prior failure', () => {
    const perms = permissionsToDict([
      { target, selector, args: { 0: { condition: 'EQ' as const, value: '0xaaaa' } }, decision: 'AUTO' as const },
      { target, selector, decision: 'REQUIRE_APPROVAL' as const }
    ])
    const policies = { 1: { policies: [{ type: 'call' as const, permissions: perms }] } }
    const tx = makeTx(target, selector, '00'.repeat(32))
    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('REQUIRE_APPROVAL')
    expect(result.context).not.toBeNull()
    expect(result.context!.ruleFailures.length).toBe(1)
    expect(result.context!.ruleFailures[0].rule.decision).toBe('AUTO')
    expect(result.context!.ruleFailures[0].failedArgs.length).toBeGreaterThan(0)
  })

  test('E5: extractArg null (calldata too short) -> actual is sentinel "null"', () => {
    const perms = permissionsToDict([
      { target, selector, args: { 5: { condition: 'EQ' as const, value: '0xaaaa' } }, decision: 'AUTO' as const }
    ])
    const policies = { 1: { policies: [{ type: 'call' as const, permissions: perms }] } }
    const tx = makeTx(target, selector, '00'.repeat(32))
    const result = evaluatePolicy(policies, 1, tx)
    expect(result.decision).toBe('REJECT')
    expect(result.context).not.toBeNull()
    expect(result.context!.ruleFailures[0].failedArgs[0].actual).toBe('null')
  })
})

describe('validatePolicies', () => {
  test('valid policies pass', () => {
    expect(() => validatePolicies([
      { type: 'timestamp' as const, validAfter: 100 },
      { type: 'call' as const, permissions: permissionsToDict([{ decision: 'AUTO' as const }]) }
    ])).not.toThrow()
  })

  test('invalid type throws', () => {
    expect(() => validatePolicies([{ type: 'unknown' } as never])).toThrow('Unsupported policy type')
  })

  test('missing decision throws', () => {
    expect(() => validatePolicies([{
      type: 'call' as const,
      permissions: permissionsToDict([{} as never])
    }])).toThrow('decision')
  })

  test('invalid operator throws', () => {
    expect(() => validatePolicies([{
      type: 'call' as const,
      permissions: permissionsToDict([{ decision: 'AUTO' as const, args: { 0: { condition: 'INVALID' as never, value: '1' } } }])
    }])).toThrow('Invalid condition operator')
  })
})
