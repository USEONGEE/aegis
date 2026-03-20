import { EventEmitter } from 'node:events'
import WDK from '@tetherto/wdk'
import { createGuardedMiddleware, validatePolicies } from './guarded-middleware.js'
import type { Policy } from './guarded-middleware.js'
import { SignedApprovalBroker } from './signed-approval-broker.js'
import type { ApprovalStore } from './approval-store.js'

interface WalletConfig {
  Manager: new (seed: string, config: unknown) => WalletManager
  config: unknown
}

interface WalletManager {
  getAccount (index: number): Promise<unknown>
  getAccountByPath (path: string): Promise<unknown>
  getFeeRates (): Promise<unknown>
  dispose (): void
}

interface ProtocolEntry {
  label: string
  Protocol: new (...args: unknown[]) => unknown
  config: unknown
}

interface GuardedWDKConfig {
  seed: string
  wallets?: Record<string, WalletConfig>
  protocols?: Record<string, ProtocolEntry[]>
  approvalBroker?: SignedApprovalBroker
  approvalStore: ApprovalStore
  trustedApprovers?: string[]
}

interface GuardedWDKFacade {
  getAccount (chain: string, index?: number): Promise<unknown>
  getAccountByPath (chain: string, path: string): Promise<unknown>
  getFeeRates (chain: string): Promise<unknown>
  getApprovalBroker (): SignedApprovalBroker
  getApprovalStore (): ApprovalStore
  on (type: string, handler: (...args: unknown[]) => void): void
  off (type: string, handler: (...args: unknown[]) => void): void
  dispose (): void
}

export async function createGuardedWDK (config: GuardedWDKConfig): Promise<GuardedWDKFacade> {
  const {
    seed,
    wallets,
    protocols,
    approvalBroker: externalBroker,
    approvalStore,
    trustedApprovers
  } = config

  if (!approvalStore) {
    throw new Error('approvalStore is required.')
  }

  const wdk: Record<string, (...args: any[]) => any> = new WDK(seed) as any
  const emitter = new EventEmitter()

  await approvalStore.init()

  let approvalBroker: SignedApprovalBroker
  if (externalBroker) {
    approvalBroker = externalBroker
  } else {
    if (!trustedApprovers || !Array.isArray(trustedApprovers) || trustedApprovers.length === 0) {
      throw new Error('trustedApprovers must be a non-empty array when approvalStore is provided.')
    }
    approvalBroker = new SignedApprovalBroker(trustedApprovers, approvalStore, emitter)
  }

  let currentAccountIndex = 0

  for (const [chainKey, wallet] of Object.entries(wallets || {})) {
    wdk.registerWallet(chainKey, wallet.Manager, wallet.config)
  }

  for (const [chainKey, protos] of Object.entries(protocols || {})) {
    for (const { label, Protocol, config: protoConfig } of protos) {
      wdk.registerProtocol(chainKey, label, Protocol, protoConfig)
    }
  }

  for (const chainKey of Object.keys(wallets || {})) {
    wdk.registerMiddleware(chainKey, createGuardedMiddleware({
      policyResolver: async (chainId: number) => {
        const stored = await approvalStore.loadPolicy(currentAccountIndex, chainId)
        if (!stored) return []
        validatePolicies(stored.policies as Policy[])
        return stored.policies as Policy[]
      },
      approvalBroker,
      emitter,
      chainId: Number(chainKey),
      getAccountIndex: () => currentAccountIndex
    }))
  }

  return {
    async getAccount (chain: string, index: number = 0) {
      currentAccountIndex = index
      const account = await wdk.getAccount(chain, index)
      Object.freeze(account)
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
      Object.freeze(account)
      return account
    },

    async getFeeRates (chain: string) {
      return wdk.getFeeRates(chain)
    },

    getApprovalBroker () {
      return approvalBroker
    },

    getApprovalStore () {
      return approvalStore
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
