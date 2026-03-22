import { EventEmitter } from 'node:events'
import WDK from '@tetherto/wdk'
import type { IWalletAccountWithProtocols, FeeRates, MiddlewareFunction } from '@tetherto/wdk'
import WalletManagerBase from '@tetherto/wdk-wallet'
import { SwapProtocol, BridgeProtocol, LendingProtocol, FiatProtocol } from '@tetherto/wdk-wallet/protocols'
import { createGuardedMiddleware, validatePolicies } from './guarded-middleware.js'
import type { Policy } from './guarded-middleware.js'
import { SignedApprovalBroker } from './signed-approval-broker.js'
import type { ApprovalSubmitContext } from './signed-approval-broker.js'
import { ExecutionJournal } from './execution-journal.js'
import type {
  WdkStore,
  SignedApproval,
  StoredPolicy,
  PendingApprovalRequest,
  PendingApprovalFilter,
  RejectionEntry,
  RejectionQueryOpts,
  PolicyVersionEntry,
  StoredSigner,
  StoredWallet,
  StoredJournal,
  JournalQueryOpts,
  ApprovalType,
  ApprovalRequest
} from './wdk-store.js'

type ProtocolClass = typeof SwapProtocol | typeof BridgeProtocol | typeof LendingProtocol | typeof FiatProtocol

interface WalletEntry {
  Manager: typeof WalletManagerBase
  config: ConstructorParameters<typeof WalletManagerBase>[1]
}

interface ProtocolEntry {
  label: string
  Protocol: ProtocolClass
  config: ConstructorParameters<ProtocolClass>[1]
}

interface GuardedWDKConfig {
  seed: string
  wallets: Record<string, WalletEntry>
  protocols: Record<string, ProtocolEntry[]>
  approvalBroker?: SignedApprovalBroker | null
  approvalStore: WdkStore
  trustedApprovers: string[]
}

interface CreateRequestOptions {
  requestId: string
  chainId: number
  targetHash: string
  accountIndex: number
  content: string
  walletName: string
  policies: Policy[]
}

interface GuardedWDKFacade {
  getAccount (chain: string, index: number): Promise<IWalletAccountWithProtocols>
  getAccountByPath (chain: string, path: string): Promise<IWalletAccountWithProtocols>
  getFeeRates (chain: string): Promise<FeeRates>

  // --- Store read methods ---
  loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null>
  getPendingApprovals (filter: PendingApprovalFilter): Promise<PendingApprovalRequest[]>
  listRejections (opts: RejectionQueryOpts): Promise<RejectionEntry[]>
  listPolicyVersions (accountIndex: number, chainId: number): Promise<PolicyVersionEntry[]>
  listSigners (): Promise<StoredSigner[]>
  listWallets (): Promise<StoredWallet[]>
  listJournal (opts: JournalQueryOpts): Promise<StoredJournal[]>
  getPolicyVersion (accountIndex: number, chainId: number): Promise<number>
  saveRejection (entry: RejectionEntry): Promise<void>

  // --- Broker methods ---
  submitApproval (signedApproval: SignedApproval, context: ApprovalSubmitContext): Promise<void>
  createApprovalRequest (type: ApprovalType, opts: CreateRequestOptions): Promise<ApprovalRequest>
  setTrustedApprovers (approvers: string[]): void

  on (type: string, handler: (...args: unknown[]) => void): void
  off (type: string, handler: (...args: unknown[]) => void): void
  dispose (): void
}

export async function createGuardedWDK (config: GuardedWDKConfig): Promise<GuardedWDKFacade> {
  const {
    seed,
    wallets,
    protocols,
    approvalBroker: externalBroker = null,
    approvalStore,
    trustedApprovers
  } = config

  if (!approvalStore) {
    throw new Error('approvalStore is required.')
  }

  const wdk = new WDK(seed)
  const emitter = new EventEmitter()

  await approvalStore.init()

  let approvalBroker: SignedApprovalBroker
  if (externalBroker !== null) {
    approvalBroker = externalBroker
  } else {
    // v0.4.2: 빈 trustedApprovers 허용. daemon이 첫 부팅 시 signer가 없을 수 있음.
    // daemon이 이후 broker.setTrustedApprovers()로 업데이트.
    approvalBroker = new SignedApprovalBroker(trustedApprovers || [], approvalStore, emitter)
  }

  const executionJournal = new ExecutionJournal(approvalStore)
  await executionJournal.recover()

  let currentAccountIndex = 0

  for (const [chainKey, wallet] of Object.entries(wallets)) {
    wdk.registerWallet(chainKey, wallet.Manager, wallet.config)
  }

  for (const [chainKey, protos] of Object.entries(protocols)) {
    for (const { label, Protocol, config: protoConfig } of protos) {
      wdk.registerProtocol(chainKey, label, Protocol, protoConfig)
    }
  }

  for (const chainKey of Object.keys(wallets)) {
    wdk.registerMiddleware(chainKey, createGuardedMiddleware({
      policyResolver: async (chainId: number) => {
        const stored = await approvalStore.loadPolicy(currentAccountIndex, chainId)
        if (!stored) return []
        validatePolicies(stored.policies as Policy[])
        return stored.policies as Policy[]
      },
      emitter,
      chainId: Number(chainKey),
      getAccountIndex: () => currentAccountIndex,
      onRejection: async (entry) => { await approvalStore.saveRejection(entry) },
      getPolicyVersion: async (acctIdx, cId) => approvalStore.getPolicyVersion(acctIdx, cId),
      journal: executionJournal
    }))
  }

  // Auto-create accountIndex=0 wallet if wallets are registered but store is empty
  if (Object.keys(wallets).length > 0) {
    const existing = await approvalStore.getWallet(0)
    if (!existing) {
      await approvalStore.createWallet(0, 'Default Wallet')
    }
  }

  return {
    async getAccount (chain: string, index: number) {
      currentAccountIndex = index
      const account = await wdk.getAccount(chain, index)
      // NOTE: Object.freeze 제거 (v0.5.15)
      // WalletManagerEvm은 account를 캐시하므로, freeze하면 두 번째 getAccount 호출 시
      // middleware가 frozen 객체에 메서드를 덮어쓸 수 없어 "Cannot assign to read only property" 에러 발생.
      // guarded middleware가 sign/keyPair 등을 이미 차단하므로 freeze는 불필요.
      return account
    },

    async getAccountByPath (chain: string, path: string) {
      // Parse accountIndex from BIP-44 path (m/44'/60'/N'/0/0)
      const parts = path.split('/')
      if (parts.length >= 4) {
        const idx = parseInt(parts[3].replace("'", ''), 10)
        if (!isNaN(idx)) currentAccountIndex = idx
      }
      const account = await wdk.getAccountByPath(chain, path)
      return account
    },

    async getFeeRates (chain: string) {
      return wdk.getFeeRates(chain)
    },

    // --- Store read methods ---

    loadPolicy (accountIndex: number, chainId: number) {
      return approvalStore.loadPolicy(accountIndex, chainId)
    },

    getPendingApprovals (filter: PendingApprovalFilter) {
      return approvalStore.loadPendingApprovals(filter)
    },

    listRejections (opts: RejectionQueryOpts) {
      return approvalStore.listRejections(opts)
    },

    listPolicyVersions (accountIndex: number, chainId: number) {
      return approvalStore.listPolicyVersions(accountIndex, chainId)
    },

    listSigners () {
      return approvalStore.listSigners()
    },

    listWallets () {
      return approvalStore.listWallets()
    },

    listJournal (opts: JournalQueryOpts) {
      return approvalStore.listJournal(opts)
    },

    getPolicyVersion (accountIndex: number, chainId: number) {
      return approvalStore.getPolicyVersion(accountIndex, chainId)
    },

    saveRejection (entry: RejectionEntry) {
      return approvalStore.saveRejection(entry)
    },

    // --- Broker methods ---

    submitApproval (signedApproval: SignedApproval, context: ApprovalSubmitContext) {
      return approvalBroker.submitApproval(signedApproval, context)
    },

    createApprovalRequest (type: ApprovalType, opts: CreateRequestOptions) {
      return approvalBroker.createRequest(type, opts)
    },

    setTrustedApprovers (approvers: string[]) {
      approvalBroker.setTrustedApprovers(approvers)
    },

    on (type: string, handler: (...args: unknown[]) => void) {
      emitter.on(type, handler)
    },

    off (type: string, handler: (...args: unknown[]) => void) {
      emitter.off(type, handler)
    },

    dispose () {
      if (approvalBroker.dispose) {
        approvalBroker.dispose()
      }
      wdk.dispose()
    }
  }
}
