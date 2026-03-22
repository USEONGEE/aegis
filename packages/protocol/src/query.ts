// ---------------------------------------------------------------------------
// Query channel wire types (app → daemon: query, daemon → app: query_result)
//
// v0.4.8: WS 직접 전달 (Redis 미경유, 영속 불필요)
// ---------------------------------------------------------------------------

export type QueryType =
  | 'policyList'
  | 'pendingApprovals'
  | 'signerList'
  | 'walletList'

export type QueryMessage =
  | { type: 'policyList'; requestId: string; params: { accountIndex: number; chainId: number } }
  | { type: 'pendingApprovals'; requestId: string; params: { accountIndex: number } }
  | { type: 'signerList'; requestId: string; params: Record<string, never> }
  | { type: 'walletList'; requestId: string; params: Record<string, never> }

interface QueryResultOk {
  requestId: string
  status: 'ok'
  data: unknown
}

interface QueryResultError {
  requestId: string
  status: 'error'
  error: string
}

export type QueryResult = QueryResultOk | QueryResultError
