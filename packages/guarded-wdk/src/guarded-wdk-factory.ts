import { EventEmitter } from 'node:events'
import WDK from '@tetherto/wdk'
import { createGuardedMiddleware, validatePolicies } from './guarded-middleware.js'
import type { Policy, ChainPolicies } from './guarded-middleware.js'
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
  policies?: Record<string, { policies: unknown[] } & Record<string, unknown>>
  approvalBroker?: SignedApprovalBroker
  approvalStore?: ApprovalStore
  trustedApprovers?: string[]
}

interface GuardedWDKFacade {
  getAccount (chain: string, index?: number): Promise<unknown>
  getAccountByPath (chain: string, path: string): Promise<unknown>
  getFeeRates (chain: string): Promise<unknown>
  updatePolicies (chainId: number, newPolicies: { policies: unknown[] } & Record<string, unknown>, accountIndex?: number): Promise<void>
  getApprovalBroker (): SignedApprovalBroker
  getApprovalStore (): ApprovalStore | null
  on (type: string, handler: (...args: unknown[]) => void): void
  off (type: string, handler: (...args: unknown[]) => void): void
  dispose (): void
}

function deepCopy<T> (obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

export async function createGuardedWDK (config: GuardedWDKConfig): Promise<GuardedWDKFacade> {
  const {
    seed,
    wallets,
    protocols,
    policies,
    approvalBroker: externalBroker,
    approvalStore,
    trustedApprovers
  } = config

  const wdk = new WDK(seed) as InstanceType<typeof WDK> & Record<string, (...args: unknown[]) => unknown>
  const emitter = new EventEmitter()

  // Create or use provided approval broker
  let approvalBroker: SignedApprovalBroker
  if (externalBroker) {
    approvalBroker = externalBroker
  } else if (approvalStore) {
    if (!trustedApprovers || !Array.isArray(trustedApprovers) || trustedApprovers.length === 0) {
      throw new Error('trustedApprovers must be a non-empty array when approvalStore is provided.')
    }
    await approvalStore.init()
    approvalBroker = new SignedApprovalBroker(trustedApprovers, approvalStore, emitter)
  } else {
    throw new Error('Either approvalBroker or approvalStore must be provided.')
  }

  // Hydrate memory cache from store (store is source of truth).
  // If store has policies for a chain, those take precedence over config.policies.
  // config.policies is only used as fallback for chains not found in the store.
  let policiesStore: Record<string, Record<string, unknown>> = {}
  let currentAccountIndex = 0

  // 1. Start with config.policies as baseline (fallback)
  if (policies) {
    for (const [chainKey, policyConfig] of Object.entries(policies)) {
      policiesStore[chainKey] = deepCopy(policyConfig) as Record<string, unknown>
    }
  }

  // 2. Overlay with store-loaded policies (store takes precedence)
  // Boot with accountIndex 0 as default. Runtime swap loads per-wallet from DB.
  if (approvalStore) {
    for (const chainKey of Object.keys(wallets || {})) {
      const stored = await approvalStore.loadPolicy(0, Number(chainKey))
      if (stored && stored.policies) {
        policiesStore[chainKey] = deepCopy({ ...stored }) as Record<string, unknown>
      }
    }
  }

  for (const policyConfig of Object.values(policiesStore)) {
    if (policyConfig.policies) {
      validatePolicies(policyConfig.policies as Policy[])
    }
  }

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
      policiesRef: () => policiesStore as ChainPolicies,
      approvalBroker,
      emitter,
      chainId: Number(chainKey),
      accountIndexRef: () => currentAccountIndex
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
      const account = await wdk.getAccountByPath(chain, path)
      Object.freeze(account)
      return account
    },

    async getFeeRates (chain: string) {
      return wdk.getFeeRates(chain)
    },

    async updatePolicies (chainId: number, newPolicies: { policies: unknown[] } & Record<string, unknown>, acctIndex: number = 0) {
      if (!newPolicies || typeof newPolicies !== 'object') {
        throw new Error('newPolicies must be an object.')
      }
      if (!Array.isArray(newPolicies.policies)) {
        throw new Error("newPolicies must have a 'policies' array.")
      }
      validatePolicies(newPolicies.policies as Policy[])

      // Write-through: persist to store first, then update memory cache.
      // If store write fails, memory is not updated (consistent state).
      if (approvalStore) {
        await approvalStore.savePolicy(acctIndex, chainId, {
          policies: newPolicies.policies,
          signature: (newPolicies as Record<string, unknown>).signature as Record<string, unknown> || {}
        })
      }
      policiesStore = {
        ...policiesStore,
        [chainId]: deepCopy(newPolicies) as Record<string, unknown>
      }
    },

    getApprovalBroker () {
      return approvalBroker
    },

    getApprovalStore () {
      return approvalStore || null
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
