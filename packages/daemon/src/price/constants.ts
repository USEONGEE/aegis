// Token Price constants — ported from HypurrQuant_FE core/price

import type { TokenPriceMap } from './types.js'

/**
 * Stablecoin fallback prices (address-keyed, lowercase).
 * Used when Enso API fails or price is missing.
 */
export const STABLECOIN_FALLBACK_PRICES: TokenPriceMap = {
  '0xb88339cb7199b77e23db6e890353e22632ba630f': 1.0, // USDC
  '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb': 1.0, // USDT / USD₮0
  '0x111111a1a0667d36bd57c0a9f569b98057111111': 1.0, // USDH
}

/**
 * Price aliases (tokens sharing the same price).
 * Source token's price is copied to target.
 */
export const PRICE_ALIASES: ReadonlyArray<{
  source: `0x${string}`
  target: `0x${string}`
}> = [
  {
    // kHYPE uses WHYPE price (Liquid Staking Token)
    source: '0x5555555555555555555555555555555555555555', // WHYPE
    target: '0xfD739d4e423301CE9385c1fb8850539D657C296D', // kHYPE
  },
]

/** Price cache TTL (ms) */
export const PRICE_CACHE_TTL_MS = 5 * 60_000 // 5 min
