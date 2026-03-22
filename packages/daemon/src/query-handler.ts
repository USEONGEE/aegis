import type { Logger } from 'pino'
import type { QueryMessage, QueryResult } from '@wdk-app/protocol'
import type { QueryFacadePort } from './ports.js'
import { getPortfolio } from './portfolio.js'

// WDK에 등록된 chain key (wdk-host.ts 참조). WDK는 이 key로 wallet manager를 조회한다.
const EVM_CHAIN_KEY = '999'

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/** Account provider — resolves account index to wallet address. */
interface AccountProvider {
  getAccount (chain: string, index: number): Promise<{ getAddress (): Promise<string> }>
}

interface QueryHandlerDeps {
  facade: QueryFacadePort & Partial<AccountProvider>
  logger: Logger
}

/**
 * Handle query channel messages from the Relay.
 *
 * v0.4.8: 4종 query → facade 조회 → QueryResult 반환.
 * v0.5.6: getPortfolio 추가 — 999체인 토큰 잔액 + Enso USD 가격.
 * query/query_result는 WS 직접 전달 (Redis 미경유).
 */
export async function handleQueryMessage (
  msg: QueryMessage,
  deps: QueryHandlerDeps
): Promise<QueryResult> {
  const { facade, logger } = deps

  try {
    switch (msg.type) {
      case 'policyList': {
        const policy = await facade.loadPolicy(msg.params.accountIndex, msg.params.chainId)
        return { requestId: msg.requestId, status: 'ok', data: policy ? policy.policies : [] }
      }

      case 'pendingApprovals': {
        const approvals = await facade.getPendingApprovals({ accountIndex: msg.params.accountIndex })
        return { requestId: msg.requestId, status: 'ok', data: approvals }
      }

      case 'signerList': {
        const signers = await facade.listSigners()
        return { requestId: msg.requestId, status: 'ok', data: signers }
      }

      case 'walletList': {
        const wallets = await facade.listWallets()
        return { requestId: msg.requestId, status: 'ok', data: wallets }
      }

      case 'getWalletAddress': {
        if (!facade.getAccount) {
          return { requestId: msg.requestId, status: 'error', error: 'Account provider not available' }
        }
        // WDK wallet key는 '999' (wdk-host.ts EVM_CHAIN_KEY). 'ethereum'이 아님.
        const account = await facade.getAccount(EVM_CHAIN_KEY, msg.params.accountIndex)
        const address = await (account as unknown as { getAddress: () => Promise<string> }).getAddress()
        return { requestId: msg.requestId, status: 'ok', data: { address } }
      }

      case 'getPortfolio': {
        if (!facade.getAccount) {
          return { requestId: msg.requestId, status: 'error', error: 'Account provider not available' }
        }
        const account = await facade.getAccount(EVM_CHAIN_KEY, msg.params.accountIndex)
        const walletAddress = await account.getAddress()
        const result = await getPortfolio(walletAddress, logger)
        return { requestId: msg.requestId, status: 'ok', data: result }
      }

      default: {
        const unknownType: string = (msg as { type: string }).type
        logger.warn({ type: unknownType }, 'Unknown query type')
        return { requestId: (msg as { requestId: string }).requestId, status: 'error', error: `Unknown query type: ${unknownType}` }
      }
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error({ err: error, type: msg.type, requestId: msg.requestId }, 'Query handler error')
    return { requestId: msg.requestId, status: 'error', error }
  }
}
