import type {
  StoredPolicy,
  PendingApprovalRequest,
  PendingApprovalFilter,
  RejectionQueryOpts,
  RejectionEntry,
  PolicyVersionEntry,
  ApprovalType,
  ApprovalRequest,
  StoredSigner,
  StoredWallet,
  SignedApproval,
  ApprovalSubmitContext
} from '@wdk-app/guarded-wdk'

// ---------------------------------------------------------------------------
// Port: tool-surface.ts용 Facade
// ---------------------------------------------------------------------------

interface CreateRequestOptions {
  requestId: string
  chainId: number
  targetHash: string
  accountIndex: number
  content: string
  walletName: string
}

/**
 * tool-surface.ts가 facade에서 사용하는 메서드만 정의한 Port.
 * 구현: GuardedWDKFacade (guarded-wdk).
 */
export interface ToolFacadePort {
  loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null>
  getPendingApprovals (filter: PendingApprovalFilter): Promise<PendingApprovalRequest[]>
  listRejections (opts: RejectionQueryOpts): Promise<RejectionEntry[]>
  listPolicyVersions (accountIndex: number, chainId: number): Promise<PolicyVersionEntry[]>
  createApprovalRequest (type: ApprovalType, opts: CreateRequestOptions): Promise<ApprovalRequest>
}

// ---------------------------------------------------------------------------
// Port: admin-server.ts용 Facade
// ---------------------------------------------------------------------------

/**
 * admin-server.ts가 facade에서 사용하는 메서드만 정의한 Port.
 * 구현: GuardedWDKFacade (guarded-wdk).
 */
export interface AdminFacadePort {
  listSigners (): Promise<StoredSigner[]>
  listWallets (): Promise<StoredWallet[]>
}

// ---------------------------------------------------------------------------
// Port: control-handler.ts용 Facade
// ---------------------------------------------------------------------------

/**
 * control-handler.ts가 facade에서 사용하는 메서드만 정의한 Port.
 * 구현: GuardedWDKFacade (guarded-wdk).
 */
export interface ControlFacadePort {
  submitApproval (signedApproval: SignedApproval, context: ApprovalSubmitContext): Promise<void>
}

// ---------------------------------------------------------------------------
// Port: query-handler.ts용 Facade
// ---------------------------------------------------------------------------

/**
 * query-handler.ts가 facade에서 사용하는 메서드만 정의한 Port.
 * ToolFacadePort + AdminFacadePort에서 query에 필요한 메서드만 조합.
 */
export interface QueryFacadePort {
  loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null>
  getPendingApprovals (filter: PendingApprovalFilter): Promise<PendingApprovalRequest[]>
  listSigners (): Promise<StoredSigner[]>
  listWallets (): Promise<StoredWallet[]>
}
