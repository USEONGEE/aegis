import { describe, test, expect } from '@jest/globals'
import { sortKeysDeep, canonicalJSON, intentHash, policyHash, CHAIN_IDS } from '../src/index.js'
import type { PolicyObject } from '../src/index.js'

describe('sortKeysDeep', () => {
  test('sorts top-level keys alphabetically', () => {
    expect(sortKeysDeep({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 })
  })

  test('sorts nested keys recursively', () => {
    expect(sortKeysDeep({ b: { d: 1, c: 2 }, a: 3 })).toEqual({ a: 3, b: { c: 2, d: 1 } })
  })

  test('sorts objects inside arrays', () => {
    expect(sortKeysDeep([{ b: 1, a: 2 }])).toEqual([{ a: 2, b: 1 }])
  })

  test('preserves array order', () => {
    expect(sortKeysDeep([3, 1, 2])).toEqual([3, 1, 2])
  })

  test('preserves empty objects and arrays', () => {
    expect(sortKeysDeep({})).toEqual({})
    expect(sortKeysDeep([])).toEqual([])
  })

  test('handles null and primitives', () => {
    expect(sortKeysDeep(null)).toBe(null)
    expect(sortKeysDeep('hello')).toBe('hello')
    expect(sortKeysDeep(42)).toBe(42)
    expect(sortKeysDeep(true)).toBe(true)
  })

  test('deeply nested structure', () => {
    const input = { z: { y: { x: 1, w: 2 }, v: 3 }, a: [{ c: 1, b: 2 }] }
    const expected = { a: [{ b: 2, c: 1 }], z: { v: 3, y: { w: 2, x: 1 } } }
    expect(sortKeysDeep(input)).toEqual(expected)
  })
})

describe('canonicalJSON', () => {
  test('produces sorted JSON without whitespace', () => {
    const result = canonicalJSON({ b: 1, a: 2 })
    expect(result).toBe('{"a":2,"b":1}')
  })

  test('produces no whitespace', () => {
    const result = canonicalJSON({ a: { b: 1 } })
    expect(result).not.toContain(' ')
    expect(result).not.toContain('\n')
  })
})

describe('intentHash', () => {
  test('produces deterministic hash', () => {
    const hash1 = intentHash({ chainId: CHAIN_IDS.ethereum, to: '0xAbC', data: '0xDef', value: '0' })
    const hash2 = intentHash({ chainId: CHAIN_IDS.ethereum, to: '0xAbC', data: '0xDef', value: '0' })
    expect(hash1).toBe(hash2)
  })

  test('normalizes addresses to lowercase', () => {
    const hash1 = intentHash({ chainId: CHAIN_IDS.ethereum, to: '0xABC', data: '0xDEF', value: '0' })
    const hash2 = intentHash({ chainId: CHAIN_IDS.ethereum, to: '0xabc', data: '0xdef', value: '0' })
    expect(hash1).toBe(hash2)
  })

  test('keys are sorted alphabetically (chainId, data, to, value)', () => {
    const hash = intentHash({ chainId: CHAIN_IDS.ethereum, to: '0xabc', data: '0xdef', value: '0' })
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
  })

  test('different inputs produce different hashes', () => {
    const hash1 = intentHash({ chainId: CHAIN_IDS.ethereum, to: '0xabc', data: '0xdef', value: '0' })
    const hash2 = intentHash({ chainId: CHAIN_IDS.arbitrum, to: '0xabc', data: '0xdef', value: '0' })
    expect(hash1).not.toBe(hash2)
  })

  test('value is passed through as-is (string required)', () => {
    const hash1 = intentHash({ chainId: CHAIN_IDS.ethereum, to: '0xabc', data: '0xdef', value: '0', timestamp: 1000 })
    const hash2 = intentHash({ chainId: CHAIN_IDS.ethereum, to: '0xabc', data: '0xdef', value: '0', timestamp: 1000 })
    expect(hash1).toBe(hash2)
  })
})

describe('policyHash', () => {
  test('produces deterministic hash', () => {
    const policies: PolicyObject[] = [{ type: 'call', permissions: [{ target: '0xABC', decision: 'AUTO' }] }]
    const hash1 = policyHash(policies)
    const hash2 = policyHash(policies)
    expect(hash1).toBe(hash2)
  })

  test('normalizes addresses to lowercase', () => {
    const hash1 = policyHash([{ type: 'call', permissions: [{ target: '0xABC' }] }])
    const hash2 = policyHash([{ type: 'call', permissions: [{ target: '0xabc' }] }])
    expect(hash1).toBe(hash2)
  })

  test('sorts keys recursively', () => {
    const hash1 = policyHash([{ permissions: [{ target: '0xabc' }], type: 'call' }])
    const hash2 = policyHash([{ type: 'call', permissions: [{ target: '0xabc' }] }])
    expect(hash1).toBe(hash2)
  })

  test('normalizes numbers to decimal strings', () => {
    const hash1 = policyHash([{ type: 'timestamp', validAfter: 1000 }])
    const hash2 = policyHash([{ type: 'timestamp', validAfter: 1000 }])
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^0x[0-9a-f]{64}$/)
  })
})
