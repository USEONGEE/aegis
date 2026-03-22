import type { ToolCall } from './types.js'
import type { PermissionDict, Rule } from '@wdk-app/guarded-wdk'
import { encodeAddress, encodeUint256, encodeCall } from '../abi.js'

/** ERC-20 transfer(address,uint256) */
const TRANSFER_SELECTOR = '0xa9059cbb'

/** ERC-20 approve(address,uint256) */
const APPROVE_SELECTOR = '0x095ea7b3'

interface Erc20TransferParams {
  /** Token contract address */
  token: string
  /** Recipient address */
  to: string
  /** Amount in smallest unit (decimal string) */
  amount: string
}

interface Erc20ApproveParams {
  /** Token contract address */
  token: string
  /** Spender address */
  spender: string
  /** Allowance amount in smallest unit (decimal string) */
  amount: string
}

/**
 * Build tx + policy for ERC-20 transfer.
 *
 * Policy: ALLOW transfer to exact recipient, amount <= given amount.
 */
export function erc20Transfer(params: Erc20TransferParams): ToolCall {
  const { token, to, amount } = params
  const tokenLower = token.toLowerCase()
  const toLower = to.toLowerCase()

  const data = encodeCall(TRANSFER_SELECTOR, [
    encodeAddress(to),
    encodeUint256(amount)
  ])

  const rule: Rule = {
    order: 0,
    decision: 'ALLOW',
    args: {
      0: { condition: 'EQ', value: toLower },
      1: { condition: 'LTE', value: amount }
    }
  }

  const permissions: PermissionDict = {
    [tokenLower]: { [TRANSFER_SELECTOR]: [rule] }
  }

  return {
    tx: { to: token, data, value: '0x0' },
    policy: { type: 'call', permissions },
    description: `ERC-20 transfer ${amount} of ${token} to ${to}`
  }
}

/**
 * Build tx + policy for ERC-20 approve.
 *
 * Policy: ALLOW approve for exact spender, amount <= given amount.
 */
export function erc20Approve(params: Erc20ApproveParams): ToolCall {
  const { token, spender, amount } = params
  const tokenLower = token.toLowerCase()
  const spenderLower = spender.toLowerCase()

  const data = encodeCall(APPROVE_SELECTOR, [
    encodeAddress(spender),
    encodeUint256(amount)
  ])

  const rule: Rule = {
    order: 0,
    decision: 'ALLOW',
    args: {
      0: { condition: 'EQ', value: spenderLower },
      1: { condition: 'LTE', value: amount }
    }
  }

  const permissions: PermissionDict = {
    [tokenLower]: { [APPROVE_SELECTOR]: [rule] }
  }

  return {
    tx: { to: token, data, value: '0x0' },
    policy: { type: 'call', permissions },
    description: `ERC-20 approve ${amount} of ${token} for ${spender}`
  }
}
