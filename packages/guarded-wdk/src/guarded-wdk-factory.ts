import { EventEmitter } from 'node:events'
import WDK from '@tetherto/wdk'
import { createGuardedMiddleware, validatePolicies } from './guarded-middleware.js'
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
  updatePolicies (chain: string, newPolicies: { policies: unknown[] } & Record<string, unknown>): Promise<void>
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wdk = new WDK(seed) as any
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

  // Load policies from store if available, then overlay with provided policies
  let policiesStore: Record<string, Record<string, unknown>> = {}
  if (approvalStore) {
    for (const chain of Object.keys(wallets || {})) {
      const stored = await approvalStore.loadPolicy(seed, chain)
      if (stored && stored.policies) {
        policiesStore[chain] = deepCopy(stored) as Record<string, unknown>
      }
    }
  }

  // Overlay with explicitly provided policies (they take precedence)
  if (policies) {
    for (const [chain, policyConfig] of Object.entries(policies)) {
      policiesStore[chain] = deepCopy(policyConfig) as Record<string, unknown>
    }
  }

  for (const policyConfig of Object.values(policiesStore)) {
    if (policyConfig.policies) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validatePolicies(policyConfig.policies as any)
    }
  }

  for (const [chain, wallet] of Object.entries(wallets || {})) {
    wdk.registerWallet(chain, wallet.Manager, wallet.config)
  }

  for (const [chain, protos] of Object.entries(protocols || {})) {
    for (const { label, Protocol, config: protoConfig } of protos) {
      wdk.registerProtocol(chain, label, Protocol, protoConfig)
    }
  }

  for (const chain of Object.keys(wallets || {})) {
    wdk.registerMiddleware(chain, createGuardedMiddleware({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      policiesRef: () => policiesStore as any,
      approvalBroker,
      emitter,
      chain
    }))
  }

  return {
    async getAccount (chain: string, index: number = 0) {
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

    async updatePolicies (chain: string, newPolicies: { policies: unknown[] } & Record<string, unknown>) {
      if (!newPolicies || typeof newPolicies !== 'object') {
        throw new Error('newPolicies must be an object.')
      }
      if (!Array.isArray(newPolicies.policies)) {
        throw new Error("newPolicies must have a 'policies' array.")
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validatePolicies(newPolicies.policies as any)
      policiesStore = {
        ...policiesStore,
        [chain]: deepCopy(newPolicies) as Record<string, unknown>
      }
      if (approvalStore) {
        await approvalStore.savePolicy(seed, chain, newPolicies as unknown as import('./approval-store.js').SignedPolicy)
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
