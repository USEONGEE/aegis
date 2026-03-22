import type { PermissionDict } from '@wdk-app/manifest'
import { KITTENSWAP_CONTRACTS, SELECTORS } from './types.js'

/**
 * Build a minimal PermissionDict that allows a mint transaction.
 * Permits: approve(token0 → npm), approve(token1 → npm), mint on NPM.
 */
export function buildMintPolicy(): PermissionDict {
  const npm = KITTENSWAP_CONTRACTS.nftManager.toLowerCase()
  return {
    // approve any ERC-20 token to NPM
    '*': {
      [SELECTORS.approve]: [
        {
          order: 0,
          decision: 'ALLOW',
          args: { 0: { condition: 'EQ', value: npm } },
        },
      ],
    },
    // mint on NPM
    [npm]: {
      [SELECTORS.mint]: [
        { order: 1, decision: 'ALLOW' },
      ],
    },
  }
}

/**
 * Build a minimal PermissionDict that allows a burn (remove liquidity) transaction.
 * Permits: decreaseLiquidity + collect on NPM.
 */
export function buildBurnPolicy(): PermissionDict {
  const npm = KITTENSWAP_CONTRACTS.nftManager.toLowerCase()
  return {
    [npm]: {
      [SELECTORS.decreaseLiquidity]: [
        { order: 0, decision: 'ALLOW' },
      ],
      [SELECTORS.collect]: [
        { order: 1, decision: 'ALLOW' },
      ],
    },
  }
}
