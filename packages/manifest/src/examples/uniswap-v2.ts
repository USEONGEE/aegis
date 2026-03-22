import type { Manifest } from '../types.js'

/**
 * Uniswap V2 DEX Liquidity Protocol manifest.
 * Covers addLiquidity and removeLiquidity features on Ethereum mainnet.
 *
 * Contracts:
 *   - Router02: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
 *   - Factory:  0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f
 */
export const uniswapV2Manifest: Manifest = {
  protocol: 'uniswap-v2',
  version: '1.0.0',
  description: 'Uniswap V2 DEX Liquidity Protocol',
  chains: {
    1: {
      chainId: 1,
      contracts: {
        router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
      },
      features: [
        {
          id: 'addLiquidity',
          name: 'Add Liquidity',
          description: 'Add liquidity to a Uniswap V2 token pair',
          calls: [
            {
              contract: 'router',
              selector: '0xe8e33700',
              signature: 'addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)',
              description: 'Add liquidity to token pair via Router02'
            }
          ],
          approvals: [
            {
              token: 'tokenA',
              spender: 'router',
              description: 'Approve tokenA for Uniswap V2 Router'
            },
            {
              token: 'tokenB',
              spender: 'router',
              description: 'Approve tokenB for Uniswap V2 Router'
            }
          ]
        },
        {
          id: 'removeLiquidity',
          name: 'Remove Liquidity',
          description: 'Remove liquidity from a Uniswap V2 token pair',
          calls: [
            {
              contract: 'router',
              selector: '0xbaa2abde',
              signature: 'removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)',
              description: 'Remove liquidity from token pair via Router02'
            }
          ],
          approvals: []
        }
      ]
    }
  }
}
