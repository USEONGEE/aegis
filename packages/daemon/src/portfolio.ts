// Portfolio: fetch token balances + USD prices for a wallet on chain 999

import type { Logger } from 'pino'
import { getTokensByChain } from './token/constants.js'
import { fetchPricesByChain } from './price/service.js'
import type { TokenInfo } from './token/types.js'

// ---------------------------------------------------------------------------
// RPC helpers
// ---------------------------------------------------------------------------

// ERC-20 balanceOf(address) selector
const BALANCE_OF_SELECTOR = '0x70a08231'

function encodeAddress (addr: string): string {
  return addr.replace(/^0x/i, '').toLowerCase().padStart(64, '0')
}

async function rpcCall (rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`RPC ${res.status}`)
  const json = await res.json() as { result?: string; error?: { message: string } }
  if (json.error) throw new Error(json.error.message)
  return json.result
}

/** Fetch native HYPE balance (wei) */
async function fetchNativeBalance (rpcUrl: string, wallet: string): Promise<bigint> {
  const result = await rpcCall(rpcUrl, 'eth_getBalance', [wallet, 'latest'])
  return BigInt(result as string)
}

/** Fetch ERC-20 balance (raw units) */
async function fetchErc20Balance (rpcUrl: string, token: `0x${string}`, wallet: string): Promise<bigint> {
  const data = BALANCE_OF_SELECTOR + encodeAddress(wallet)
  const result = await rpcCall(rpcUrl, 'eth_call', [{ to: token, data }, 'latest'])
  const hex = result as string
  if (!hex || hex === '0x' || hex === '0x0') return 0n
  return BigInt(hex)
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatBalance (raw: bigint, decimals: number): string {
  if (raw === 0n) return '0'
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const frac = raw % divisor
  if (frac === 0n) return whole.toString()
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole}.${fracStr}`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PortfolioBalance {
  symbol: string
  name: string
  balance: string
  usdValue: string
  chainId: number
  address: string
}

export interface PortfolioResult {
  balances: PortfolioBalance[]
  totalUSD: string
}

export async function getPortfolio (
  walletAddress: string,
  logger: Logger,
  rpcUrl: string = 'https://rpc.hyperliquid.xyz/evm',
): Promise<PortfolioResult> {
  const chainId = 999
  const tokens = getTokensByChain(chainId)

  // 1. Fetch all balances in parallel
  const balanceResults = await Promise.allSettled(
    tokens.map(async (token): Promise<{ token: TokenInfo; raw: bigint }> => {
      const raw = await fetchErc20Balance(rpcUrl, token.address, walletAddress)
      return { token, raw }
    })
  )

  // Also fetch native HYPE balance
  let nativeRaw = 0n
  try {
    nativeRaw = await fetchNativeBalance(rpcUrl, walletAddress)
  } catch (err: unknown) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to fetch native HYPE balance')
  }

  // 2. Collect non-zero balances
  const nonZero: Array<{ token: TokenInfo; raw: bigint }> = []

  // Native HYPE (not an ERC-20, show as HYPE)
  if (nativeRaw > 0n) {
    nonZero.push({
      token: { chainId: 999, address: '0x0000000000000000000000000000000000000000' as `0x${string}`, symbol: 'HYPE', decimals: 18, name: 'Hyperliquid' },
      raw: nativeRaw,
    })
  }

  for (const result of balanceResults) {
    if (result.status === 'fulfilled' && result.value.raw > 0n) {
      nonZero.push(result.value)
    }
  }

  if (nonZero.length === 0) {
    return { balances: [], totalUSD: '0.00' }
  }

  // 3. Fetch USD prices for non-zero tokens
  const addresses = nonZero.map(b => b.token.address)
  // Also include WHYPE address for native HYPE price
  if (nativeRaw > 0n) {
    addresses.push('0x5555555555555555555555555555555555555555')
  }

  let prices: Record<string, number> = {}
  try {
    prices = await fetchPricesByChain(chainId, addresses)
  } catch (err: unknown) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to fetch prices from Enso')
  }

  // 4. Build result
  let totalUSD = 0

  const balances: PortfolioBalance[] = nonZero.map(({ token, raw }) => {
    const balance = formatBalance(raw, token.decimals)
    const balanceNum = parseFloat(balance)

    // For native HYPE, use WHYPE price
    const priceKey = token.address === '0x0000000000000000000000000000000000000000'
      ? '0x5555555555555555555555555555555555555555'
      : token.address.toLowerCase()

    const price = prices[priceKey] ?? 0
    const usd = balanceNum * price
    totalUSD += usd

    return {
      symbol: token.symbol,
      name: token.name ?? token.symbol,
      balance,
      usdValue: usd.toFixed(2),
      chainId: token.chainId,
      address: token.address,
    }
  })

  // Sort by USD value descending
  balances.sort((a, b) => parseFloat(b.usdValue) - parseFloat(a.usdValue))

  return { balances, totalUSD: totalUSD.toFixed(2) }
}
