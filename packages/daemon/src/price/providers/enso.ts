// Enso Finance price provider — ported from HypurrQuant_FE

import type { PriceProvider, TokenPriceMap } from '../types.js'

const ENSO_API_URL = 'https://api.enso.finance/api/v1/prices'
const ENSO_ADDRESS_CHUNK_SIZE = 55
const ENSO_MIN_INTERVAL_MS = 10_000 // 10s — Enso free plan rate limit

// Sequential gating for rate limit
let gate: Promise<void> = Promise.resolve()

function withRateLimit<T> (fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    gate = gate.then(async () => {
      try {
        resolve(await fn())
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
      await new Promise((r) => setTimeout(r, ENSO_MIN_INTERVAL_MS))
    })
  })
}

interface EnsoPrice {
  address: string
  price: number
}

function chunkAddresses (
  addresses: readonly `0x${string}`[],
  size: number,
): `0x${string}`[][] {
  if (addresses.length === 0) return []

  const chunks: `0x${string}`[][] = []
  for (let index = 0; index < addresses.length; index += size) {
    chunks.push(addresses.slice(index, index + size))
  }
  return chunks
}

export const ensoProvider: PriceProvider = {
  name: 'enso',

  async fetchPrices (
    chainId: number,
    addresses: readonly `0x${string}`[],
  ): Promise<TokenPriceMap> {
    const normalized = [...new Set(
      addresses.map((a) => a.toLowerCase() as `0x${string}`),
    )]
    if (normalized.length === 0) return {}

    const chunks = chunkAddresses(normalized, ENSO_ADDRESS_CHUNK_SIZE)
    const prices: TokenPriceMap = {}

    for (const chunk of chunks) {
      const url = new URL(`${ENSO_API_URL}/${chainId}`)
      for (const address of chunk) {
        url.searchParams.append('addresses', address)
      }

      try {
        const data = await withRateLimit(async () => {
          const res = await fetch(url.toString(), {
            signal: AbortSignal.timeout(10_000),
          })
          if (!res.ok) throw new Error(`Enso API ${res.status}`)
          return res.json() as Promise<EnsoPrice[]>
        })

        for (const item of data) {
          if (item && item.price > 0) {
            prices[item.address.toLowerCase()] = item.price
          }
        }
      } catch {
        // chunk failure isolation — preserve previous results, continue
      }
    }

    return prices
  },
}
