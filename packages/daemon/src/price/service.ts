// Token Price Service — ported from HypurrQuant_FE core/price

import type { TokenPriceMap, PriceProvider } from './types.js'
import {
  STABLECOIN_FALLBACK_PRICES,
  PRICE_ALIASES,
  PRICE_CACHE_TTL_MS,
} from './constants.js'
import { ensoProvider } from './providers/enso.js'

// ---------------------------------------------------------------------------
// Pair cache
// ---------------------------------------------------------------------------

interface PairCacheEntry {
  value: number
  at: number
}

const pairCache = new Map<string, PairCacheEntry>()
const inFlightByMissSet = new Map<string, Promise<TokenPriceMap>>()

function normalizeAddresses (
  addresses: readonly `0x${string}`[],
): `0x${string}`[] {
  return [...new Set(
    addresses.map((a) => a.toLowerCase() as `0x${string}`),
  )]
}

function toPairKey (chainId: number, addressLower: string): string {
  return `${chainId}:${addressLower}`
}

function getInFlightKey (
  chainId: number,
  addresses: readonly `0x${string}`[],
): string {
  const sorted = [...addresses].sort()
  return `${chainId}:${sorted.join(',')}`
}

function readFreshCache (
  chainId: number,
  addressLower: `0x${string}`,
  now: number,
): number | undefined {
  const key = toPairKey(chainId, addressLower)
  const cached = pairCache.get(key)

  if (!cached) return undefined
  if (now - cached.at >= PRICE_CACHE_TTL_MS) {
    pairCache.delete(key)
    return undefined
  }
  return cached.value
}

function writeCache (
  chainId: number,
  addressLower: `0x${string}`,
  value: number,
): void {
  pairCache.set(toPairKey(chainId, addressLower), { value, at: Date.now() })
}

function collectAliasSourceAddresses (
  requestedTargets: readonly `0x${string}`[],
): `0x${string}`[] {
  if (requestedTargets.length === 0) return []

  const targetSet = new Set(requestedTargets)
  const sources: `0x${string}`[] = []
  for (const alias of PRICE_ALIASES) {
    const source = alias.source.toLowerCase() as `0x${string}`
    const target = alias.target.toLowerCase() as `0x${string}`
    if (targetSet.has(target) && !targetSet.has(source)) {
      sources.push(source)
    }
  }

  return normalizeAddresses(sources)
}

function normalizePriceMap (prices: TokenPriceMap): TokenPriceMap {
  const normalized: TokenPriceMap = {}
  for (const [address, price] of Object.entries(prices)) {
    if (price > 0) {
      normalized[address.toLowerCase()] = price
    }
  }
  return normalized
}

function applyFallbacks (
  prices: TokenPriceMap,
  requestedSet: ReadonlySet<string>,
): TokenPriceMap {
  const merged: TokenPriceMap = { ...prices }

  for (const [address, fallbackPrice] of Object.entries(STABLECOIN_FALLBACK_PRICES)) {
    const key = address.toLowerCase()
    if (!requestedSet.has(key)) continue
    if (merged[key] === undefined) {
      merged[key] = fallbackPrice
    }
  }

  return merged
}

function applyAliases (
  prices: TokenPriceMap,
  requestedSet: ReadonlySet<string>,
): TokenPriceMap {
  const merged: TokenPriceMap = { ...prices }

  for (const alias of PRICE_ALIASES) {
    const source = alias.source.toLowerCase()
    const target = alias.target.toLowerCase()
    if (!requestedSet.has(target)) continue
    if (merged[target] === undefined && merged[source] !== undefined) {
      merged[target] = merged[source]
    }
  }

  return merged
}

async function fetchMissesWithDedupe (
  chainId: number,
  misses: readonly `0x${string}`[],
  provider: PriceProvider,
): Promise<TokenPriceMap> {
  const aliasSources = collectAliasSourceAddresses(misses)
  const providerAddresses = normalizeAddresses([...misses, ...aliasSources])

  if (providerAddresses.length === 0) return {}

  const inFlightKey = getInFlightKey(chainId, providerAddresses)
  const existing = inFlightByMissSet.get(inFlightKey)
  if (existing) return existing

  const request = (async () => {
    try {
      return await provider.fetchPrices(chainId, providerAddresses)
    } catch {
      return {}
    }
  })()

  inFlightByMissSet.set(inFlightKey, request)
  try {
    return await request
  } finally {
    inFlightByMissSet.delete(inFlightKey)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch prices for chain + addresses (pair-cache + fallback + alias + dedupe)
 */
export async function fetchPricesByChain (
  chainId: number,
  addresses: readonly `0x${string}`[],
  provider: PriceProvider = ensoProvider,
): Promise<TokenPriceMap> {
  if (addresses.length === 0) return {}

  const normalizedAddresses = normalizeAddresses(addresses)
  const requestedSet = new Set(normalizedAddresses)
  const now = Date.now()

  const result: TokenPriceMap = {}
  const misses: `0x${string}`[] = []

  for (const address of normalizedAddresses) {
    const cached = readFreshCache(chainId, address, now)
    if (cached === undefined) {
      misses.push(address)
      continue
    }
    result[address] = cached
  }

  if (misses.length === 0) {
    return result
  }

  const fetchedRaw = await fetchMissesWithDedupe(chainId, misses, provider)
  const normalizedFetched = normalizePriceMap(fetchedRaw)
  const withFallbacks = applyFallbacks(normalizedFetched, requestedSet)
  const resolved = applyAliases(withFallbacks, requestedSet)

  for (const address of misses) {
    const price = resolved[address]
    if (price === undefined) continue
    writeCache(chainId, address, price)
    result[address] = price
  }

  return result
}
