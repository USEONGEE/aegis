import { encodeTupleCall } from '../abi-encode.js'
import { KITTENSWAP_CONTRACTS, SELECTORS } from '../types.js'
import type { BurnInput, BurnOutput } from '../types.js'
import { buildBurnPolicy } from '../policy-builder.js'

const MAX_UINT128 = (2n ** 128n - 1n).toString()

const DECREASE_COMPONENTS = [
  { name: 'tokenId', type: 'uint256' as const },
  { name: 'liquidity', type: 'uint128' as const },
  { name: 'amount0Min', type: 'uint256' as const },
  { name: 'amount1Min', type: 'uint256' as const },
  { name: 'deadline', type: 'uint256' as const },
]

const COLLECT_COMPONENTS = [
  { name: 'tokenId', type: 'uint256' as const },
  { name: 'recipient', type: 'address' as const },
  { name: 'amount0Max', type: 'uint128' as const },
  { name: 'amount1Max', type: 'uint128' as const },
]

/**
 * Build burn (remove liquidity) transactions + policy for KittenSwap LP.
 * Returns two tx envelopes: [decreaseLiquidity, collect].
 */
export function burn(input: BurnInput): BurnOutput {
  const decreaseData = encodeTupleCall(SELECTORS.decreaseLiquidity, DECREASE_COMPONENTS, {
    tokenId: input.tokenId,
    liquidity: input.liquidity,
    amount0Min: input.amount0Min,
    amount1Min: input.amount1Min,
    deadline: input.deadline,
  })

  const collectData = encodeTupleCall(SELECTORS.collect, COLLECT_COMPONENTS, {
    tokenId: input.tokenId,
    recipient: input.recipient,
    amount0Max: MAX_UINT128,
    amount1Max: MAX_UINT128,
  })

  const npm = KITTENSWAP_CONTRACTS.nftManager

  return {
    txs: [
      { to: npm, data: decreaseData, value: '0' },
      { to: npm, data: collectData, value: '0' },
    ],
    policy: buildBurnPolicy(),
  }
}
