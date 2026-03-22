import type {
  StoredPolicy,
  PendingApprovalRequest,
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
  walletName: string | null
}

/**
 * tool-surface.ts가 facade에서 사용하는 메서드만 정의한 Port.
 * 구현: GuardedWDKFacade (guarded-wdk).
 */
export interface ToolFacadePort {
  loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null>
  getPendingApprovals (accountIndex: number | null, type: string | null, chainId: number | null): Promise<PendingApprovalRequest[]>
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
