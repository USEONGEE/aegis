import { join } from 'node:path'
import { JsonApprovalStore, SignedApprovalBroker } from '@wdk-app/guarded-wdk'
import type { DaemonConfig } from './config.js'
import type { Logger } from 'pino'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MockAccount {
  chain: string
  index: number
  sendTransaction (tx: Record<string, unknown>): Promise<never>
  getBalance (): Promise<{ balances: unknown[] }>
}

export interface WDKInstance {
  getAccount (chain: string, index?: number): Promise<any>
  getFeeRates? (): Promise<Record<string, unknown>>
  updatePolicies? (chain: string, newPolicies: Record<string, unknown>): Promise<void>
  getApprovalBroker? (): SignedApprovalBroker
  getApprovalStore? (): any
  on (event: string, listener: (...args: any[]) => void): void
  off (event: string, listener: (...args: any[]) => void): void
  dispose? (): void
}

export interface WDKInitResult {
  wdk: WDKInstance | null
  account: any | null
  broker: SignedApprovalBroker | null
  store: InstanceType<typeof JsonApprovalStore>
  seedId: string | null
}

/**
 * Initialize the WDK host: load active seed, create store + broker, build guarded WDK.
 *
 * Returns { wdk, account, broker, store, seedId } or null if no seed is available.
 *
 * NOTE: createGuardedWDK depends on @tetherto/wdk which may not be available
 * in all environments. The import is deferred so the rest of the daemon can
 * still load. When the real WDK is unavailable, a mock is returned.
 */
export async function initWDK (config: DaemonConfig, logger: Logger): Promise<WDKInitResult> {
  const store = new JsonApprovalStore(config.storePath)
  await store.init()

  // Load active seed
  const activeSeed = await store.getActiveSeed()
  if (!activeSeed) {
    logger.warn('No active seed found. WDK will not be initialized until a seed is added.')
    return { wdk: null, account: null, broker: null, store, seedId: null }
  }

  const seedId: string = activeSeed.id
  const mnemonic: string = activeSeed.mnemonic

  // Load trusted approvers (public keys) from paired devices
  const devices = await store.listDevices()
  const trustedApprovers: string[] = devices
    .filter((d: any) => d.revoked_at === null || d.revoked_at === undefined)
    .map((d: any) => d.public_key)

  // Create broker
  const broker = new SignedApprovalBroker(trustedApprovers, store)

  // Try to create the real guarded WDK; fall back to mock if @tetherto/wdk is absent
  let wdk: WDKInstance
  let account: any
  try {
    const { createGuardedWDK } = await import('@wdk-app/guarded-wdk')
    wdk = await createGuardedWDK({
      seed: mnemonic,
      wallets: {},
      protocols: {},
      policies: {},
      approvalBroker: broker,
      approvalStore: store,
      trustedApprovers
    })

    // Attempt to get the default account (ethereum, index 0)
    try {
      account = await wdk.getAccount('ethereum', 0)
    } catch {
      account = null
      logger.info('No ethereum wallet registered; account will be null.')
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Could not create real GuardedWDK. Using mock host.')
    wdk = createMockWDK(broker, store, seedId)
    account = null
  }

  logger.info({ seedId, approverCount: trustedApprovers.length }, 'WDK host initialized.')

  return { wdk, account, broker, store, seedId }
}

/**
 * Re-initialize WDK with a different seed (used on seed switch).
 */
export async function switchSeed (newSeedId: string, config: DaemonConfig, logger: Logger): Promise<WDKInitResult> {
  return initWDK(config, logger)
}

/**
 * Minimal mock WDK for environments where @tetherto/wdk is not installed.
 * Exposes the same interface shape so the daemon can boot and handle admin commands.
 */
function createMockWDK (broker: SignedApprovalBroker, store: any, seedId: string): WDKInstance {
  return {
    async getAccount (chain: string, index: number = 0) {
      return {
        chain,
        index,
        async sendTransaction (tx: Record<string, unknown>): Promise<never> {
          throw new Error('Mock WDK: sendTransaction not available. Install @tetherto/wdk.')
        },
        async getBalance (): Promise<{ balances: unknown[] }> {
          return { balances: [] }
        }
      }
    },
    async getFeeRates (): Promise<Record<string, unknown>> {
      return {}
    },
    async updatePolicies (chain: string, newPolicies: Record<string, unknown>): Promise<void> {
      await store.savePolicy(seedId, chain, newPolicies)
    },
    getApprovalBroker (): SignedApprovalBroker {
      return broker
    },
    getApprovalStore () {
      return store
    },
    on (): void {},
    off (): void {},
    dispose (): void {
      broker.dispose()
    }
  }
}
