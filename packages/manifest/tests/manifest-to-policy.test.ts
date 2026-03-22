import { describe, test, expect } from '@jest/globals'
import { validateManifest } from '../src/index.js'

describe('validateManifest', () => {
  test('null manifest fails validation', () => {
    const result = validateManifest(null)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })

  test('missing protocol fails validation', () => {
    const manifest = {
      protocol: '',
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
              calls: [{ contract: 'pool', selector: '0x12345678', signature: 'fn()', description: 'test' }],
              approvals: []
            }
          ]
        }
      }
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e: string) => e.includes('protocol'))).toBe(true)
    }
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
              approvals: []
            }
          ]
        }
      }
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e: string) => e.includes('selector'))).toBe(true)
    }
  })
})
