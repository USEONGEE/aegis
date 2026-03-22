import { describe, test, expect } from '@jest/globals'
import { erc20Transfer, erc20Approve } from '../src/tools/erc20.js'
import { validatePolicies } from '@wdk-app/guarded-wdk'

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const RECIPIENT = '0x1234567890abcdef1234567890abcdef12345678'
const SPENDER = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

describe('erc20Transfer', () => {
  test('tx has correct target and selector', () => {
    const result = erc20Transfer({ token: USDT, to: RECIPIENT, amount: '1000000' })

    expect(result.tx.to).toBe(USDT)
    expect(result.tx.data.startsWith('0xa9059cbb')).toBe(true)
    expect(result.tx.value).toBe('0x0')
  })

  test('tx calldata encodes address and amount correctly', () => {
    const result = erc20Transfer({ token: USDT, to: RECIPIENT, amount: '1000000' })
    const data = result.tx.data

    // selector (10 chars) + address (64 chars) + uint256 (64 chars)
    expect(data.length).toBe(10 + 64 + 64)

    // address arg: left-padded recipient
    const addressArg = data.slice(10, 74)
    expect(addressArg).toBe(RECIPIENT.replace('0x', '').toLowerCase().padStart(64, '0'))

    // amount arg: 1000000 = 0xF4240
    const amountArg = data.slice(74, 138)
    expect(amountArg).toBe(BigInt('1000000').toString(16).padStart(64, '0'))
  })

  test('policy targets correct token and selector', () => {
    const result = erc20Transfer({ token: USDT, to: RECIPIENT, amount: '1000000' })
    const perms = result.policy.permissions
    const tokenKey = USDT.toLowerCase()

    expect(perms[tokenKey]).toBeDefined()
    expect(perms[tokenKey]['0xa9059cbb']).toBeDefined()
    expect(perms[tokenKey]['0xa9059cbb'].length).toBe(1)
  })

  test('policy rule has EQ on recipient and LTE on amount', () => {
    const result = erc20Transfer({ token: USDT, to: RECIPIENT, amount: '1000000' })
    const rule = result.policy.permissions[USDT.toLowerCase()]['0xa9059cbb'][0]

    expect(rule.decision).toBe('ALLOW')
    expect(rule.args).toBeDefined()
    expect(rule.args!['0']).toEqual({ condition: 'EQ', value: RECIPIENT.toLowerCase() })
    expect(rule.args!['1']).toEqual({ condition: 'LTE', value: '1000000' })
  })

  test('policy passes guarded-wdk validatePolicies', () => {
    const result = erc20Transfer({ token: USDT, to: RECIPIENT, amount: '1000000' })
    expect(() => validatePolicies([result.policy])).not.toThrow()
  })
})

describe('erc20Approve', () => {
  test('tx has correct target and selector', () => {
    const result = erc20Approve({ token: USDT, spender: SPENDER, amount: '5000000' })

    expect(result.tx.to).toBe(USDT)
    expect(result.tx.data.startsWith('0x095ea7b3')).toBe(true)
    expect(result.tx.value).toBe('0x0')
  })

  test('tx calldata encodes spender and amount correctly', () => {
    const result = erc20Approve({ token: USDT, spender: SPENDER, amount: '5000000' })
    const data = result.tx.data

    expect(data.length).toBe(10 + 64 + 64)

    const spenderArg = data.slice(10, 74)
    expect(spenderArg).toBe(SPENDER.replace('0x', '').toLowerCase().padStart(64, '0'))

    const amountArg = data.slice(74, 138)
    expect(amountArg).toBe(BigInt('5000000').toString(16).padStart(64, '0'))
  })

  test('policy rule has EQ on spender and LTE on amount', () => {
    const result = erc20Approve({ token: USDT, spender: SPENDER, amount: '5000000' })
    const rule = result.policy.permissions[USDT.toLowerCase()]['0x095ea7b3'][0]

    expect(rule.decision).toBe('ALLOW')
    expect(rule.args!['0']).toEqual({ condition: 'EQ', value: SPENDER.toLowerCase() })
    expect(rule.args!['1']).toEqual({ condition: 'LTE', value: '5000000' })
  })

  test('policy passes guarded-wdk validatePolicies', () => {
    const result = erc20Approve({ token: USDT, spender: SPENDER, amount: '5000000' })
    expect(() => validatePolicies([result.policy])).not.toThrow()
  })
})

describe('integration: tx calldata matches policy', () => {
  test('transfer tx would be allowed by its own policy', () => {
    const result = erc20Transfer({ token: USDT, to: RECIPIENT, amount: '1000000' })
    const rule = result.policy.permissions[USDT.toLowerCase()]['0xa9059cbb'][0]

    // Extract args from calldata the same way guarded-wdk does
    const data = result.tx.data
    const arg0 = '0x' + data.slice(10, 74)   // address
    const arg1 = '0x' + data.slice(74, 138)   // amount

    // arg0 (address): BigInt comparison should match
    expect(BigInt(arg0)).toBe(BigInt(rule.args!['0'].value as string))

    // arg1 (amount): LTE comparison
    expect(BigInt(arg1) <= BigInt(rule.args!['1'].value as string)).toBe(true)
  })
})
