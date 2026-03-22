import type { Manifest } from '../types.js'

/**
 * KittenSwap DEX LP manifest.
 * Algebra Integral protocol on Hyperliquid EVM (chainId: 999).
 *
 * Contracts:
 *   - NFT Position Manager: 0x9ea4459c8DefBF561495d95414b9CF1E2242a3E2
 *   - Factory:              0x5f95E92c338e6453111Fc55ee66D4AafccE661A7
 *   - FarmingCenter:        0x211BD8917d433B7cC1F4497AbA906554Ab6ee479
 */
export const kittenSwapManifest: Manifest = {
  protocol: 'kittenswap',
  version: '1.0.0',
  description: 'KittenSwap DEX — Algebra Integral concentrated liquidity on Hyperliquid',
  chains: {
    999: {
      chainId: 999,
      contracts: {
        nftManager: '0x9ea4459c8DefBF561495d95414b9CF1E2242a3E2',
        factory: '0x5f95E92c338e6453111Fc55ee66D4AafccE661A7',
        farmingCenter: '0x211BD8917d433B7cC1F4497AbA906554Ab6ee479',
      },
      features: [
        {
          id: 'mint',
          name: 'Mint LP Position',
          description: 'Create a new concentrated liquidity position',
          calls: [
            {
              contract: 'nftManager',
              selector: '0xfe3f3be7',
              signature: 'mint((address,address,address,int24,int24,uint256,uint256,uint256,uint256,address,uint256))',
              description: 'Mint new LP NFT position via Algebra NPM',
            },
          ],
          approvals: [
            {
              token: 'token0',
              spender: 'nftManager',
              description: 'Approve token0 for NFT Position Manager',
            },
            {
              token: 'token1',
              spender: 'nftManager',
              description: 'Approve token1 for NFT Position Manager',
            },
          ],
        },
        {
          id: 'burn',
          name: 'Remove Liquidity',
          description: 'Remove liquidity from an existing LP position (decreaseLiquidity + collect)',
          calls: [
            {
              contract: 'nftManager',
              selector: '0x0c49ccbe',
              signature: 'decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))',
              description: 'Decrease liquidity from position',
            },
            {
              contract: 'nftManager',
              selector: '0xfc6f7865',
              signature: 'collect((uint256,address,uint128,uint128))',
              description: 'Collect tokens from decreased position',
            },
          ],
          approvals: [],
        },
      ],
    },
  },
}
