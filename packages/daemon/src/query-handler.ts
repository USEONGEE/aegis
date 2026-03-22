import type { Logger } from 'pino'
import type { QueryMessage, QueryResult } from '@wdk-app/protocol'
import type { QueryFacadePort } from './ports.js'

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

interface QueryHandlerDeps {
  facade: QueryFacadePort
  logger: Logger
}

/**
 * Handle query channel messages from the Relay.
 *
 * v0.4.8: 4종 query → facade 조회 → QueryResult 반환.
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
