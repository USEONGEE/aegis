// Token registry — ported from HypurrQuant_FE core/token

import type { TokenInfo } from './types.js'
import * as hlTokens from './hyperliquid.js'

/**
 * Static token registry.
 * Available without on-chain lookup.
 */
export const KNOWN_TOKENS: readonly TokenInfo[] = [
  ...Object.values(hlTokens),
]

// --- Lookup Maps ---

const byChainAddress = new Map<string, TokenInfo>()

for (const token of KNOWN_TOKENS) {
  byChainAddress.set(`${token.chainId}:${token.address.toLowerCase()}`, token)
}

/** Chain-aware token lookup by chain + address */
export function findKnownToken (chainId: number, address: string): TokenInfo | undefined {
  return byChainAddress.get(`${chainId}:${address.toLowerCase()}`)
}

/** Get all tokens for a specific chain */
export function getTokensByChain (chainId: number): TokenInfo[] {
  return KNOWN_TOKENS.filter(t => t.chainId === chainId)
}
