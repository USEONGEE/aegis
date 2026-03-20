import type { Manifest, ValidationResult } from './types.js'

/**
 * Validate a manifest object structure.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 */
export function validateManifest(manifest: Manifest | null | undefined): ValidationResult {
  const errors: string[] = []

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest must be a non-null object'] }
  }

  if (typeof manifest.protocol !== 'string' || manifest.protocol.length === 0) {
    errors.push('manifest.protocol must be a non-empty string')
  }

  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    errors.push('manifest.version must be a non-empty string')
  }

  if (typeof manifest.description !== 'string') {
    errors.push('manifest.description must be a string')
  }

  if (!manifest.chains || typeof manifest.chains !== 'object' || Array.isArray(manifest.chains)) {
    errors.push('manifest.chains must be a non-null object')
    return { valid: errors.length === 0, errors }
  }

  for (const [chainId, chainConfig] of Object.entries(manifest.chains)) {
    const prefix = `manifest.chains.${chainId}`

    if (typeof chainConfig.chainId !== 'number' || !Number.isInteger(chainConfig.chainId)) {
      errors.push(`${prefix}.chainId must be an integer`)
    }

    if (!chainConfig.contracts || typeof chainConfig.contracts !== 'object') {
      errors.push(`${prefix}.contracts must be a non-null object`)
    }

    if (!Array.isArray(chainConfig.features)) {
      errors.push(`${prefix}.features must be an array`)
      continue
    }

    for (let i = 0; i < chainConfig.features.length; i++) {
      const feature = chainConfig.features[i]
      const fp = `${prefix}.features[${i}]`

      if (typeof feature.id !== 'string' || feature.id.length === 0) {
        errors.push(`${fp}.id must be a non-empty string`)
      }

      if (typeof feature.name !== 'string' || feature.name.length === 0) {
        errors.push(`${fp}.name must be a non-empty string`)
      }

      if (!Array.isArray(feature.calls)) {
        errors.push(`${fp}.calls must be an array`)
      } else {
        for (let j = 0; j < feature.calls.length; j++) {
          const call = feature.calls[j]
          const cp = `${fp}.calls[${j}]`

          if (typeof call.contract !== 'string' || call.contract.length === 0) {
            errors.push(`${cp}.contract must be a non-empty string`)
          }

          if (typeof call.selector !== 'string' || !/^0x[0-9a-fA-F]{8}$/.test(call.selector)) {
            errors.push(`${cp}.selector must be a 4-byte hex string (e.g., '0x12345678')`)
          }
        }
      }

      if (!Array.isArray(feature.approvals)) {
        errors.push(`${fp}.approvals must be an array`)
      } else {
        for (let j = 0; j < feature.approvals.length; j++) {
          const approval = feature.approvals[j]
          const ap = `${fp}.approvals[${j}]`

          if (typeof approval.spender !== 'string' || approval.spender.length === 0) {
            errors.push(`${ap}.spender must be a non-empty string`)
          }
        }
      }

    }
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors }
}
