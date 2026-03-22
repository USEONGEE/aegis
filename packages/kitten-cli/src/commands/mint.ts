import { encodeTupleCall } from '../abi-encode.js'
import { KITTENSWAP_CONTRACTS, SELECTORS } from '../types.js'
import type { MintInput, MintOutput } from '../types.js'
import { buildMintPolicy } from '../policy-builder.js'

const MINT_COMPONENTS = [
  { name: 'token0', type: 'address' as const },
  { name: 'token1', type: 'address' as const },
  { name: 'deployer', type: 'address' as const },
  { name: 'tickLower', type: 'int24' as const },
  { name: 'tickUpper', type: 'int24' as const },
  { name: 'amount0Desired', type: 'uint256' as const },
  { name: 'amount1Desired', type: 'uint256' as const },
  { name: 'amount0Min', type: 'uint256' as const },
  { name: 'amount1Min', type: 'uint256' as const },
  { name: 'recipient', type: 'address' as const },
  { name: 'deadline', type: 'uint256' as const },
]

/**
 * Build a mint transaction + policy for KittenSwap LP.
 * Returns a complete tx envelope ready for signing, plus the minimal policy.
 */
export function mint(input: MintInput): MintOutput {
  const data = encodeTupleCall(SELECTORS.mint, MINT_COMPONENTS, {
    token0: input.token0,
    token1: input.token1,
    deployer: input.deployer,
    tickLower: input.tickLower,
    tickUpper: input.tickUpper,
    amount0Desired: input.amount0Desired,
    amount1Desired: input.amount1Desired,
    amount0Min: input.amount0Min,
    amount1Min: input.amount1Min,
    recipient: input.recipient,
    deadline: input.deadline,
  })

  return {
    tx: {
      to: KITTENSWAP_CONTRACTS.nftManager,
      data,
      value: '0',
    },
    policy: buildMintPolicy(),
  }
}
