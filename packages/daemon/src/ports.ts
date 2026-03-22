import type {
  StoredPolicy,
  PendingApprovalRequest,
  CronInput,
  StoredCron,
  RejectionEntry,
  RejectionQueryOpts,
  PolicyVersionEntry,
  ApprovalType,
  ApprovalRequest,
  StoredSigner,
  StoredWallet
} from '@wdk-app/guarded-wdk'

// ---------------------------------------------------------------------------
// Port: tool-surface.ts용 Store
// ---------------------------------------------------------------------------

/**
 * tool-surface.ts가 store에서 사용하는 메서드만 정의한 Port.
 * 구현: SqliteApprovalStore (guarded-wdk).
 */
export interface ToolStorePort {
  getPolicyVersion (accountIndex: number, chainId: number): Promise<number>
  loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null>
  loadPendingApprovals (accountIndex: number | null, type: string | null, chainId: number | null): Promise<PendingApprovalRequest[]>
  saveRejection (entry: RejectionEntry): Promise<void>
  listRejections (opts: RejectionQueryOpts): Promise<RejectionEntry[]>
  saveCron (accountIndex: number, cron: CronInput): Promise<string>
  listCrons (accountIndex?: number): Promise<StoredCron[]>
  removeCron (cronId: string): Promise<void>
  listPolicyVersions (accountIndex: number, chainId: number): Promise<PolicyVersionEntry[]>
}

// ---------------------------------------------------------------------------
// Port: tool-surface.ts용 Broker
// ---------------------------------------------------------------------------

interface CreateRequestOptions {
  requestId: string
  chainId: number
  targetHash: string
  accountIndex: number
  content: string
  walletName: string | null
}

/**
 * tool-surface.ts가 broker에서 사용하는 메서드만 정의한 Port.
 * 구현: SignedApprovalBroker (guarded-wdk).
 */
export interface ApprovalBrokerPort {
  createRequest (type: ApprovalType, opts: CreateRequestOptions): Promise<ApprovalRequest>
}

// ---------------------------------------------------------------------------
// Port: admin-server.ts용 Store
// ---------------------------------------------------------------------------

/**
 * admin-server.ts가 store에서 사용하는 메서드만 정의한 Port.
 * 구현: SqliteApprovalStore (guarded-wdk).
 */
export interface AdminStorePort {
  listSigners (): Promise<StoredSigner[]>
  listWallets (): Promise<StoredWallet[]>
}
