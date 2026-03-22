import { describe, test, expect } from '@jest/globals'
import { hyperlendDepositUsdt } from '../src/tools/hyperlend.js'
import { validatePolicies } from '@wdk-app/guarded-wdk'

const HYPERLEND_POOL = '0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b'
const USDT0 = '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb'
const DEPOSITOR = '0x11f13a0DA33AC58E45cbfC35bE2E65BdA004dF92'

/** Actual calldata from on-chain tx 0xda12cae2... (289633 USDT0 deposit) */
const REAL_TX_CALLDATA =
  '0x617ba037' +
  '000000000000000000000000b8ce59fc3717ada4c02eadf9682a9e934f625ebb' +
  '0000000000000000000000000000000000000000000000000000000000046b61' +
  '00000000000000000000000011f13a0da33ac58e45cbfc35be2e65bda004df92' +
  '0000000000000000000000000000000000000000000000000000000000000000'

describe('hyperlendDepositUsdt', () => {
  test('reproduces real on-chain calldata', () => {
    const result = hyperlendDepositUsdt({
      amount: '289633',
      onBehalfOf: DEPOSITOR
    })

    expect(result.tx.data).toBe(REAL_TX_CALLDATA)
  })

  test('tx targets HyperLend Pool', () => {
    const result = hyperlendDepositUsdt({ amount: '1000000', onBehalfOf: DEPOSITOR })

    expect(result.tx.to).toBe(HYPERLEND_POOL)
    expect(result.tx.value).toBe('0x0')
    expect(result.tx.data.startsWith('0x617ba037')).toBe(true)
  })

  test('calldata structure: selector + 4 args × 32 bytes', () => {
    const result = hyperlendDepositUsdt({ amount: '1000000', onBehalfOf: DEPOSITOR })

    // 0x + 8 (selector) + 64×4 (args) = 266 chars
    expect(result.tx.data.length).toBe(2 + 8 + 64 * 4)
  })

  test('policy targets Pool contract with supply selector', () => {
    const result = hyperlendDepositUsdt({ amount: '1000000', onBehalfOf: DEPOSITOR })
    const perms = result.policy.permissions
    const poolKey = HYPERLEND_POOL.toLowerCase()

    expect(perms[poolKey]).toBeDefined()
    expect(perms[poolKey]['0x617ba037']).toBeDefined()
    expect(perms[poolKey]['0x617ba037'].length).toBe(1)
  })

  test('policy rule: EQ on asset, LTE on amount, EQ on onBehalfOf', () => {
    const result = hyperlendDepositUsdt({ amount: '1000000', onBehalfOf: DEPOSITOR })
    const rule = result.policy.permissions[HYPERLEND_POOL.toLowerCase()]['0x617ba037'][0]

    expect(rule.decision).toBe('ALLOW')
    expect(rule.args!['0']).toEqual({ condition: 'EQ', value: USDT0.toLowerCase() })
    expect(rule.args!['1']).toEqual({ condition: 'LTE', value: '1000000' })
    expect(rule.args!['2']).toEqual({ condition: 'EQ', value: DEPOSITOR.toLowerCase() })
  })

  test('policy passes guarded-wdk validatePolicies', () => {
    const result = hyperlendDepositUsdt({ amount: '1000000', onBehalfOf: DEPOSITOR })
    expect(() => validatePolicies([result.policy])).not.toThrow()
  })

  test('tx calldata matches its own policy via BigInt comparison', () => {
    const result = hyperlendDepositUsdt({ amount: '500000', onBehalfOf: DEPOSITOR })
    const data = result.tx.data
    const rule = result.policy.permissions[HYPERLEND_POOL.toLowerCase()]['0x617ba037'][0]

    // Extract args the way guarded-wdk does
    const arg0 = '0x' + data.slice(10, 74)     // asset
    const arg1 = '0x' + data.slice(74, 138)     // amount
    const arg2 = '0x' + data.slice(138, 202)    // onBehalfOf

    // asset: EQ
    expect(BigInt(arg0)).toBe(BigInt(rule.args!['0'].value as string))
    // amount: LTE
    expect(BigInt(arg1) <= BigInt(rule.args!['1'].value as string)).toBe(true)
    // onBehalfOf: EQ
    expect(BigInt(arg2)).toBe(BigInt(rule.args!['2'].value as string))
  })
})
