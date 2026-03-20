import { describe, test, expect } from '@jest/globals'
import { manifestToPolicy, validateManifest } from '../src/index.js'
import type { PermissionDict } from '../src/index.js'
import { aaveV3Manifest } from '../src/examples/aave-v3.js'

const POOL_ADDRESS = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'.toLowerCase()
const APPROVE_SELECTOR = '0x095ea7b3'

describe('manifestToPolicy', () => {
  test('Aave manifest -> PermissionDict contains correct target/selector buckets', () => {
    const dict: PermissionDict = manifestToPolicy(aaveV3Manifest, 1)

    // supply call rule: pool/0x617ba037
    expect(dict[POOL_ADDRESS]).toBeDefined()
    expect(dict[POOL_ADDRESS]['0x617ba037']).toBeDefined()
    expect(dict[POOL_ADDRESS]['0x617ba037'].length).toBe(1)
    expect(dict[POOL_ADDRESS]['0x617ba037'][0].decision).toBe('REQUIRE_APPROVAL')

    // repay call rule: pool/0x573ade81
    expect(dict[POOL_ADDRESS]['0x573ade81']).toBeDefined()
    expect(dict[POOL_ADDRESS]['0x573ade81'].length).toBe(1)

    // borrow call rule: pool/0xa415bcad
    expect(dict[POOL_ADDRESS]['0xa415bcad']).toBeDefined()
    expect(dict[POOL_ADDRESS]['0xa415bcad'].length).toBe(1)

    // withdraw call rule: pool/0x69328dec
    expect(dict[POOL_ADDRESS]['0x69328dec']).toBeDefined()
    expect(dict[POOL_ADDRESS]['0x69328dec'].length).toBe(1)
  })

  test('approve rules auto-generated from feature.approvals with spender constraint', () => {
    const dict: PermissionDict = manifestToPolicy(aaveV3Manifest, 1)

    // Wildcard target with approve selector
    expect(dict['*']).toBeDefined()
    expect(dict['*'][APPROVE_SELECTOR]).toBeDefined()

    // supply has 1 approval, repay has 1 approval = 2 total
    const approveRules = dict['*'][APPROVE_SELECTOR]
    expect(approveRules.length).toBe(2)

    // All approve rules have spender constraint as args[0] EQ
    for (const rule of approveRules) {
      expect(rule.args).toBeDefined()
      expect(rule.args!['0']).toBeDefined()
      expect(rule.args!['0'].condition).toBe('EQ')
      expect(rule.args!['0'].value).toBe(POOL_ADDRESS)
    }
  })

  test('features without approvals do not generate approve rules', () => {
    const dict: PermissionDict = manifestToPolicy(aaveV3Manifest, 1, {
      features: ['borrow']
    })

    // No wildcard approve rules
    expect(dict['*']).toBeUndefined()

    // Only the borrow call rule
    expect(dict[POOL_ADDRESS]).toBeDefined()
    expect(dict[POOL_ADDRESS]['0xa415bcad']).toBeDefined()
    expect(dict[POOL_ADDRESS]['0xa415bcad'].length).toBe(1)

    // No other selectors under pool
    const selectorCount = Object.keys(dict[POOL_ADDRESS]).length
    expect(selectorCount).toBe(1)
  })

  test('userConfig.features filters to specific features', () => {
    const dict: PermissionDict = manifestToPolicy(aaveV3Manifest, 1, {
      features: ['supply', 'repay']
    })

    // supply: pool/0x617ba037 + approve
    // repay: pool/0x573ade81 + approve
    expect(dict[POOL_ADDRESS]['0x617ba037']).toBeDefined()
    expect(dict[POOL_ADDRESS]['0x573ade81']).toBeDefined()

    // No borrow or withdraw
    expect(dict[POOL_ADDRESS]['0xa415bcad']).toBeUndefined()
    expect(dict[POOL_ADDRESS]['0x69328dec']).toBeUndefined()

    // 2 approve rules
    expect(dict['*'][APPROVE_SELECTOR].length).toBe(2)
  })

  test('userConfig overrides decision', () => {
    const dict: PermissionDict = manifestToPolicy(aaveV3Manifest, 1, {
      features: ['supply'],
      decision: 'AUTO'
    })

    // Call rule
    expect(dict[POOL_ADDRESS]['0x617ba037'][0].decision).toBe('AUTO')

    // Approve rule
    expect(dict['*'][APPROVE_SELECTOR][0].decision).toBe('AUTO')
  })

  test('userConfig overrides args conditions', () => {
    const dict: PermissionDict = manifestToPolicy(aaveV3Manifest, 1, {
      features: ['supply'],
      argsConditions: { maxValue: '1000000' }
    })

    // argsConditions applied to call rules
    const callRule = dict[POOL_ADDRESS]['0x617ba037'][0]
    expect(callRule.args).toBeDefined()
    expect(callRule.args!.maxValue).toEqual({ condition: 'EQ', value: '1000000' })
  })

  test('unknown chainId returns empty dict', () => {
    const dict: PermissionDict = manifestToPolicy(aaveV3Manifest, 999)
    expect(dict).toEqual({})
  })

  test('empty features array returns empty dict', () => {
    const dict: PermissionDict = manifestToPolicy(aaveV3Manifest, 1, {
      features: []
    })
    expect(dict).toEqual({})
  })

  test('all features when userConfig.features is omitted', () => {
    const dict: PermissionDict = manifestToPolicy(aaveV3Manifest, 1)

    // Count total rules across all buckets
    let totalRules = 0
    for (const selectorMap of Object.values(dict)) {
      for (const rules of Object.values(selectorMap)) {
        totalRules += rules.length
      }
    }

    // supply: 1 call + 1 approve = 2
    // borrow: 1 call = 1
    // repay: 1 call + 1 approve = 2
    // withdraw: 1 call = 1
    // total = 6
    expect(totalRules).toBe(6)
  })

  test('rules have sequential order values', () => {
    const dict: PermissionDict = manifestToPolicy(aaveV3Manifest, 1)

    // Collect all rules and verify order is sequential
    const allRules: Array<{ order: number }> = []
    for (const selectorMap of Object.values(dict)) {
      for (const rules of Object.values(selectorMap)) {
        allRules.push(...rules)
      }
    }

    allRules.sort((a, b) => a.order - b.order)
    for (let i = 0; i < allRules.length; i++) {
      expect(allRules[i].order).toBe(i)
    }
  })

  test('round-trip: output is structurally compatible with guarded-wdk CallPolicy', () => {
    const dict: PermissionDict = manifestToPolicy(aaveV3Manifest, 1, {
      features: ['supply'],
      decision: 'AUTO'
    })

    // Wrap as CallPolicy — this is exactly how guarded-wdk consumes it
    const callPolicy = { type: 'call' as const, permissions: dict }
    const chainPolicies = { 1: { policies: [callPolicy] } }

    // Verify structure: target -> selector -> Rule[]
    const permissions = chainPolicies[1].policies[0].permissions
    expect(typeof permissions).toBe('object')

    // Each rule must have: order (number), decision (valid string), optional args/valueLimit
    for (const [target, selectorMap] of Object.entries(permissions)) {
      expect(typeof target).toBe('string')
      for (const [selector, rules] of Object.entries(selectorMap)) {
        expect(typeof selector).toBe('string')
        expect(Array.isArray(rules)).toBe(true)
        for (const rule of rules) {
          expect(typeof rule.order).toBe('number')
          expect(['AUTO', 'REQUIRE_APPROVAL', 'REJECT']).toContain(rule.decision)
          if (rule.args) {
            for (const [, cond] of Object.entries(rule.args)) {
              expect(['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'ONE_OF', 'NOT_ONE_OF']).toContain(cond.condition)
              expect(cond.value).toBeDefined()
            }
          }
          if (rule.valueLimit !== undefined) {
            expect(['string', 'number']).toContain(typeof rule.valueLimit)
          }
        }
      }
    }

    // Verify the supply call rule is present
    expect(permissions[POOL_ADDRESS]['0x617ba037'][0].decision).toBe('AUTO')
    // Verify the approve rule is present with args
    expect(permissions['*'][APPROVE_SELECTOR][0].args!['0'].condition).toBe('EQ')
    expect(permissions['*'][APPROVE_SELECTOR][0].args!['0'].value).toBe(POOL_ADDRESS)
  })
})

describe('validateManifest', () => {
  test('valid manifest passes validation', () => {
    const result = validateManifest(aaveV3Manifest)
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  test('null manifest fails validation', () => {
    const result = validateManifest(null)
    expect(result.valid).toBe(false)
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  test('missing protocol fails validation', () => {
    const result = validateManifest({
      ...aaveV3Manifest,
      protocol: ''
    })
    expect(result.valid).toBe(false)
    expect(result.errors!.some((e: string) => e.includes('protocol'))).toBe(true)
  })

  test('invalid selector fails validation', () => {
    const manifest = {
      protocol: 'test',
      version: '1.0.0',
      description: 'Test',
      chains: {
        1: {
          chainId: 1,
          contracts: { pool: '0xabc' },
          features: [
            {
              id: 'f1',
              name: 'F1',
              description: 'Test',
              calls: [{ contract: 'pool', selector: 'bad', signature: 'fn()', description: 'test' }],
              approvals: [],
              constraints: []
            }
          ]
        }
      }
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors!.some((e: string) => e.includes('selector'))).toBe(true)
  })
})
