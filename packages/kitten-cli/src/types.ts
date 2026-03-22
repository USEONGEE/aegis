import type { PermissionDict } from '@wdk-app/manifest'

// ── Contracts ──

export const KITTENSWAP_CONTRACTS = {
  nftManager: '0x9ea4459c8DefBF561495d95414b9CF1E2242a3E2',
  factory: '0x5f95E92c338e6453111Fc55ee66D4AafccE661A7',
  farmingCenter: '0x211BD8917d433B7cC1F4497AbA906554Ab6ee479',
} as const

export const CHAIN_ID = 999

// ── Function Selectors (Algebra Integral) ──

export const SELECTORS = {
  /** NPM.mint((address,address,address,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) */
  mint: '0xfe3f3be7',
  /** NPM.decreaseLiquidity((uint256,uint128,uint256,uint256,uint256)) */
  decreaseLiquidity: '0x0c49ccbe',
  /** NPM.collect((uint256,address,uint128,uint128)) */
  collect: '0xfc6f7865',
  /** ERC20.approve(address,uint256) */
  approve: '0x095ea7b3',
} as const

// ── Mint ──

export interface MintInput {
  token0: `0x${string}`
  token1: `0x${string}`
  deployer: `0x${string}`
  tickLower: number
  tickUpper: number
  amount0Desired: string
  amount1Desired: string
  amount0Min: string
  amount1Min: string
  recipient: `0x${string}`
  deadline: string
}

export interface MintOutput {
  tx: TxEnvelope
  policy: PermissionDict
}

// ── Burn (Remove Liquidity) ──

export interface BurnInput {
  tokenId: string
  liquidity: string
  amount0Min: string
  amount1Min: string
  deadline: string
  recipient: `0x${string}`
}

export interface BurnOutput {
  txs: [TxEnvelope, TxEnvelope]
  policy: PermissionDict
}

// ── Fetch ──

export interface FetchInput {
  poolAddress: `0x${string}`
}

export interface FetchOutput {
  sqrtPriceX96: string
  currentTick: number
  liquidity: string
  token0Balance: string
  token1Balance: string
}

// ── Common ──

export interface TxEnvelope {
  to: string
  data: string
  value: string
}
