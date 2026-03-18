import type { Manifest } from '../types.js'

/**
 * Aave V3 Lending Protocol manifest.
 * Covers repay and supply features on Ethereum mainnet.
 */
export const aaveV3Manifest: Manifest = {
  protocol: 'aave-v3',
  version: '1.0.0',
  description: 'Aave V3 Lending Protocol',
  chains: {
    ethereum: {
      chainId: 'ethereum',
      contracts: {
        pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
        oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
        wethGateway: '0xD322A49006FC828F9B5B37Ab215F99B4E5caB19C'
      },
      features: [
        {
          id: 'supply',
          name: 'Supply',
          description: 'Supply assets to Aave V3 pool',
          calls: [
            {
              contract: 'pool',
              selector: '0x617ba037',
              signature: 'supply(address,uint256,address,uint16)',
              description: 'Supply asset to pool'
            }
          ],
          approvals: [
            {
              token: 'asset',
              spender: 'pool',
              description: 'Approve token for Aave V3 Pool'
            }
          ],
          constraints: [
            {
              type: 'allowedTokens',
              value: ['USDC', 'USDT', 'DAI', 'WETH', 'WBTC'],
              description: 'Supported supply tokens'
            }
          ]
        },
        {
          id: 'borrow',
          name: 'Borrow',
          description: 'Borrow assets from Aave V3 pool',
          calls: [
            {
              contract: 'pool',
              selector: '0xa415bcad',
              signature: 'borrow(address,uint256,uint256,uint16,address)',
              description: 'Borrow asset from pool'
            }
          ],
          approvals: [],
          constraints: []
        },
        {
          id: 'repay',
          name: 'Repay',
          description: 'Repay borrowed assets',
          calls: [
            {
              contract: 'pool',
              selector: '0x573ade81',
              signature: 'repay(address,uint256,uint256,address)',
              description: 'Repay borrowed asset'
            }
          ],
          approvals: [
            {
              token: 'asset',
              spender: 'pool',
              description: 'Approve token for repayment'
            }
          ],
          constraints: []
        },
        {
          id: 'withdraw',
          name: 'Withdraw',
          description: 'Withdraw supplied assets',
          calls: [
            {
              contract: 'pool',
              selector: '0x69328dec',
              signature: 'withdraw(address,uint256,address)',
              description: 'Withdraw asset from pool'
            }
          ],
          approvals: [],
          constraints: []
        }
      ]
    }
  }
}
