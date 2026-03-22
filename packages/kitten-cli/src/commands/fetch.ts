import type { FetchInput, FetchOutput } from '../types.js'

// Precomputed selectors for view functions
const VIEW_SELECTORS = {
  /** globalState() → (uint160,int24,uint16,uint16,uint8,uint8) */
  globalState: '0xe76c01e4',
  /** liquidity() → uint128 */
  liquidity: '0x1a686502',
  /** token0() → address */
  token0: '0x0dfe1681',
  /** token1() → address */
  token1: '0xd21220a7',
  /** balanceOf(address) → uint256 */
  balanceOf: '0x70a08231',
}

interface RpcResult {
  result: string
}

async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const res = await globalThis.fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
      id: 1,
    }),
  })
  const json = await res.json() as RpcResult
  return json.result
}

function decodeUint256(hex: string, offset: number): bigint {
  const slice = hex.slice(2 + offset * 64, 2 + (offset + 1) * 64)
  return BigInt('0x' + slice)
}

function decodeInt24(hex: string, offset: number): number {
  const raw = decodeUint256(hex, offset)
  // Sign-extend from 24 bits
  if (raw > 0x7FFFFFn) {
    return Number(raw - (1n << 24n))
  }
  // Handle case where it's stored as 256-bit two's complement negative
  if (raw > (1n << 255n)) {
    return Number(raw - (1n << 256n))
  }
  return Number(raw)
}

function decodeAddress(hex: string, offset: number): `0x${string}` {
  const slice = hex.slice(2 + offset * 64 + 24, 2 + (offset + 1) * 64)
  return `0x${slice}` as `0x${string}`
}

function padAddress(addr: string): string {
  return '0x' + addr.replace('0x', '').toLowerCase().padStart(64, '0')
}

/**
 * Fetch pool state from KittenSwap Algebra pool on-chain.
 * Uses raw JSON-RPC eth_call — no viem dependency.
 */
export async function fetch(input: FetchInput, rpcUrl: string): Promise<FetchOutput> {
  const pool = input.poolAddress

  // 1. Parallel: globalState, liquidity, token0, token1
  const [globalStateHex, liquidityHex, token0Hex, token1Hex] = await Promise.all([
    ethCall(rpcUrl, pool, VIEW_SELECTORS.globalState),
    ethCall(rpcUrl, pool, VIEW_SELECTORS.liquidity),
    ethCall(rpcUrl, pool, VIEW_SELECTORS.token0),
    ethCall(rpcUrl, pool, VIEW_SELECTORS.token1),
  ])

  const sqrtPriceX96 = decodeUint256(globalStateHex, 0)
  const currentTick = decodeInt24(globalStateHex, 1)
  const liquidity = decodeUint256(liquidityHex, 0)
  const token0Addr = decodeAddress(token0Hex, 0)
  const token1Addr = decodeAddress(token1Hex, 0)

  // 2. Token balances in pool
  const balanceOfData = (addr: string) =>
    VIEW_SELECTORS.balanceOf + padAddress(addr).slice(2)

  const [bal0Hex, bal1Hex] = await Promise.all([
    ethCall(rpcUrl, token0Addr, balanceOfData(pool)),
    ethCall(rpcUrl, token1Addr, balanceOfData(pool)),
  ])

  return {
    sqrtPriceX96: sqrtPriceX96.toString(),
    currentTick,
    liquidity: liquidity.toString(),
    token0Balance: decodeUint256(bal0Hex, 0).toString(),
    token1Balance: decodeUint256(bal1Hex, 0).toString(),
  }
}
