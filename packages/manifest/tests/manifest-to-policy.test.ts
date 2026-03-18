import { describe, test, expect } from '@jest/globals'
import { manifestToPolicy, validateManifest } from '../src/index.js'
import type { PolicyPermission } from '../src/index.js'
import { aaveV3Manifest } from '../src/examples/aave-v3.js'

const POOL_ADDRESS = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'
const APPROVE_SELECTOR = '0x095ea7b3'

describe('manifestToPolicy', () => {
  test('Aave manifest -> policy -> permissions contain correct target/selector/args', () => {
    const permissions: PolicyPermission[] = manifestToPolicy(aaveV3Manifest, 'ethereum')

    // supply call permission
    const supplyPerm = permissions.find((p: PolicyPermission) => p.selector === '0x617ba037')
    expect(supplyPerm).toBeDefined()
    expect(supplyPerm!.type).toBe('call')
    expect(supplyPerm!.address).toBe(POOL_ADDRESS)
    expect(supplyPerm!.description).toContain('aave-v3/supply')

    // repay call permission
    const repayPerm = permissions.find((p: PolicyPermission) => p.selector === '0x573ade81')
    expect(repayPerm).toBeDefined()
    expect(repayPerm!.type).toBe('call')
    expect(repayPerm!.address).toBe(POOL_ADDRESS)
    expect(repayPerm!.description).toContain('aave-v3/repay')

    // borrow call permission
    const borrowPerm = permissions.find((p: PolicyPermission) => p.selector === '0xa415bcad')
    expect(borrowPerm).toBeDefined()
    expect(borrowPerm!.address).toBe(POOL_ADDRESS)

    // withdraw call permission
    const withdrawPerm = permissions.find((p: PolicyPermission) => p.selector === '0x69328dec')
    expect(withdrawPerm).toBeDefined()
    expect(withdrawPerm!.address).toBe(POOL_ADDRESS)
  })

  test('approve permissions auto-generated from feature.approvals', () => {
    const permissions: PolicyPermission[] = manifestToPolicy(aaveV3Manifest, 'ethereum')

    const approvePerms = permissions.filter((p: PolicyPermission) => p.selector === APPROVE_SELECTOR)

    // supply has 1 approval, repay has 1 approval = 2 total
    expect(approvePerms.length).toBe(2)

    // All approve permissions have wildcard address and spender constraint
    for (const perm of approvePerms) {
      expect(perm.type).toBe('call')
      expect(perm.address).toBe('*')
      expect(perm.constraints).toBeDefined()
      expect(perm.constraints!.spender).toBe(POOL_ADDRESS)
    }

    // One for supply, one for repay
    const supplyApprove = approvePerms.find((p: PolicyPermission) => p.description.includes('aave-v3/supply'))
    expect(supplyApprove).toBeDefined()
    expect(supplyApprove!.description).toContain('Approve token for Aave V3 Pool')

    const repayApprove = approvePerms.find((p: PolicyPermission) => p.description.includes('aave-v3/repay'))
    expect(repayApprove).toBeDefined()
    expect(repayApprove!.description).toContain('Approve token for repayment')
  })

  test('features without approvals do not generate approve permissions', () => {
    const permissions: PolicyPermission[] = manifestToPolicy(aaveV3Manifest, 'ethereum', {
      features: ['borrow']
    })

    const approvePerms = permissions.filter((p: PolicyPermission) => p.selector === APPROVE_SELECTOR)
    expect(approvePerms.length).toBe(0)

    // Only the borrow call permission
    expect(permissions.length).toBe(1)
    expect(permissions[0].selector).toBe('0xa415bcad')
  })

  test('userConfig.features filters to specific features', () => {
    const permissions: PolicyPermission[] = manifestToPolicy(aaveV3Manifest, 'ethereum', {
      features: ['supply', 'repay']
    })

    // supply: 1 call + 1 approve = 2
    // repay: 1 call + 1 approve = 2
    // total = 4
    expect(permissions.length).toBe(4)

    // No borrow or withdraw
    expect(permissions.find((p: PolicyPermission) => p.selector === '0xa415bcad')).toBeUndefined()
    expect(permissions.find((p: PolicyPermission) => p.selector === '0x69328dec')).toBeUndefined()
  })

  test('userConfig overrides decision', () => {
    const permissions: PolicyPermission[] = manifestToPolicy(aaveV3Manifest, 'ethereum', {
      features: ['supply'],
      decision: 'AUTO'
    })

    for (const perm of permissions) {
      expect(perm.decision).toBe('AUTO')
    }
  })

  test('userConfig overrides args conditions', () => {
    const permissions: PolicyPermission[] = manifestToPolicy(aaveV3Manifest, 'ethereum', {
      features: ['supply'],
      argsConditions: { maxValue: '1000000' }
    })

    // argsConditions applied to call permissions (not approve)
    const callPerms = permissions.filter((p: PolicyPermission) => p.selector !== APPROVE_SELECTOR)
    for (const perm of callPerms) {
      expect(perm.argsConditions).toEqual({ maxValue: '1000000' })
    }
  })

  test('unknown chainId returns empty array', () => {
    const permissions: PolicyPermission[] = manifestToPolicy(aaveV3Manifest, 'solana')
    expect(permissions).toEqual([])
  })

  test('empty features array returns empty permissions', () => {
    const permissions: PolicyPermission[] = manifestToPolicy(aaveV3Manifest, 'ethereum', {
      features: []
    })
    expect(permissions).toEqual([])
  })

  test('all features when userConfig.features is omitted', () => {
    const permissions: PolicyPermission[] = manifestToPolicy(aaveV3Manifest, 'ethereum')

    // supply: 1 call + 1 approve
    // borrow: 1 call
    // repay: 1 call + 1 approve
    // withdraw: 1 call
    // total = 6
    expect(permissions.length).toBe(6)
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
        ethereum: {
          chainId: 'ethereum',
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
