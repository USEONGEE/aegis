import type { ToolCall } from './types.js'
import type { PermissionDict, Rule } from '@wdk-app/guarded-wdk'
import { encodeAddress, encodeUint256, encodeCall } from '../abi.js'

/** HyperLend Pool on HyperEVM (chain 999) */
const HYPERLEND_POOL = '0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b'

/** USDT0 on HyperEVM */
const USDT0 = '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb'

/** supply(address,uint256,address,uint16) */
const SUPPLY_SELECTOR = '0x617ba037'

interface HyperlendDepositUsdtParams {
  /** Deposit amount in smallest unit (decimal string, 6 decimals) */
  amount: string
  /** Depositor address (onBehalfOf) */
  onBehalfOf: string
}

/**
 * Build tx + policy for HyperLend USDT0 deposit (supply).
 *
 * Fixed: chain 999, HyperLend Pool, USDT0 asset, referralCode 0.
 * Dynamic: amount, onBehalfOf.
 *
 * Note: caller must also approve USDT0 → Pool via erc20Approve separately.
 */
export function hyperlendDepositUsdt(params: HyperlendDepositUsdtParams): ToolCall {
  const { amount, onBehalfOf } = params
  const onBehalfOfLower = onBehalfOf.toLowerCase()

  const data = encodeCall(SUPPLY_SELECTOR, [
    encodeAddress(USDT0),
    encodeUint256(amount),
    encodeAddress(onBehalfOf),
    encodeUint256('0') // referralCode = 0
  ])

  const rule: Rule = {
    order: 0,
    decision: 'ALLOW',
    args: {
      0: { condition: 'EQ', value: USDT0.toLowerCase() },
      1: { condition: 'LTE', value: amount },
      2: { condition: 'EQ', value: onBehalfOfLower }
    }
  }

  const permissions: PermissionDict = {
    [HYPERLEND_POOL.toLowerCase()]: { [SUPPLY_SELECTOR]: [rule] }
  }

  return {
    tx: { to: HYPERLEND_POOL, data, value: '0x0' },
    policy: { type: 'call', permissions },
    description: `HyperLend deposit ${amount} USDT0 on behalf of ${onBehalfOf}`
  }
}
