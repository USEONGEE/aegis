import { join, dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { SqliteApprovalStore, SignedApprovalBroker } from '@wdk-app/guarded-wdk'
import type { DaemonConfig } from './config.js'
import type { Logger } from 'pino'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MockAccount {
  chain: string
  index: number
  sendTransaction (tx: Record<string, unknown>): Promise<never>
  signTransaction (tx: Record<string, unknown>): Promise<{ signedTx: string }>
  getBalance (): Promise<{ balances: unknown[] }>
}

export interface WDKInstance {
  getAccount (chain: string, index?: number): Promise<any>
  getFeeRates? (): Promise<Record<string, unknown>>
  updatePolicies? (chainId: number, newPolicies: Record<string, unknown>, accountIndex?: number): Promise<void>
  getApprovalBroker? (): SignedApprovalBroker
  getApprovalStore? (): any
  on (event: string, listener: (...args: any[]) => void): void
  off (event: string, listener: (...args: any[]) => void): void
  dispose? (): void
}

export interface WDKInitResult {
  wdk: WDKInstance | null
  broker: SignedApprovalBroker | null
  store: InstanceType<typeof SqliteApprovalStore>
}

/**
 * Initialize the WDK host: load master seed, create store + broker, build guarded WDK.
 *
 * Returns { wdk, broker, store } or null wdk if no seed is available.
 *
 * NOTE: createGuardedWDK depends on @tetherto/wdk which may not be available
 * in all environments. The import is deferred so the rest of the daemon can
 * still load. When the real WDK is unavailable, a mock is returned.
 */
export async function initWDK (config: DaemonConfig, logger: Logger): Promise<WDKInitResult> {
  // Step 11: Use SqliteApprovalStore as default (WAL mode, queryable)
  // config.storePath is a directory for JsonStore; SqliteStore needs a file path
  const dbPath = config.storePath.endsWith('.db')
    ? config.storePath
    : join(config.storePath, 'wdk.db')
  await mkdir(dirname(dbPath), { recursive: true })
  const store = new SqliteApprovalStore(dbPath)
  await store.init()

  // Load master seed
  const masterSeed = await store.getMasterSeed()
  if (!masterSeed) {
    logger.warn('No master seed found. WDK will not be initialized until a seed is added.')
    return { wdk: null, broker: null, store }
  }

  const mnemonic: string = masterSeed.mnemonic

  // Load trusted approvers (public keys) from paired signers
  const signers = await store.listSigners()
  const trustedApprovers: string[] = signers
    .filter(d => d.revokedAt === null || d.revokedAt === undefined)
    .map(d => d.publicKey)

  // Step 07: Create shared EventEmitter and pass to broker
  const emitter = new EventEmitter()
  const broker = new SignedApprovalBroker(trustedApprovers, store, emitter)

  // Step 08: Restore stored policies on boot (accountIndex 0 as default)
  // Runtime swap loads per-wallet policies from DB before each tool call.
  const restoredPolicies: Record<string, { policies: unknown[] } & Record<string, unknown>> = {}
  try {
    const chains = await store.listPolicyChains(0)
    for (const chainIdStr of chains) {
      const chainId = Number(chainIdStr)
      const stored = await store.loadPolicy(0, chainId)
      if (stored) {
        const policiesArr = JSON.parse(stored.policiesJson)
        restoredPolicies[chainIdStr] = { policies: policiesArr }
        logger.info({ accountIndex: 0, chainId }, 'Restored policy from store')
      }
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to restore policies from store')
  }

  // Try to create the real guarded WDK; fall back to mock if @tetherto/wdk is absent
  let wdk: WDKInstance
  try {
    const { createGuardedWDK } = await import('@wdk-app/guarded-wdk')
    wdk = await createGuardedWDK({
      seed: mnemonic,
      wallets: {},
      protocols: {},
      policies: restoredPolicies,
      approvalBroker: broker,
      approvalStore: store,
      trustedApprovers
    })
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Could not create real GuardedWDK. Using mock host.')
    wdk = createMockWDK(broker, store)
  }

  logger.info({ approverCount: trustedApprovers.length, restoredPolicies: Object.keys(restoredPolicies).length }, 'WDK host initialized.')

  return { wdk, broker, store }
}

/**
 * Re-initialize WDK (used on seed switch).
 */
export async function switchSeed (config: DaemonConfig, logger: Logger): Promise<WDKInitResult> {
  return initWDK(config, logger)
}

/**
 * Minimal mock WDK for environments where @tetherto/wdk is not installed.
 * Exposes the same interface shape so the daemon can boot and handle admin commands.
 */
function createMockWDK (broker: SignedApprovalBroker, store: any): WDKInstance {
  return {
    async getAccount (chain: string, index: number = 0) {
      return {
        chain,
        index,
        async sendTransaction (tx: Record<string, unknown>): Promise<never> {
          throw new Error('Mock WDK: sendTransaction not available. Install @tetherto/wdk.')
        },
        async signTransaction (tx: Record<string, unknown>): Promise<{ signedTx: string }> {
          // Mock: return deterministic hex-encoded signed tx
          const hash = createHash('sha256').update(JSON.stringify(tx)).digest('hex')
          return { signedTx: '0x' + hash }
        },
        async getBalance (): Promise<{ balances: unknown[] }> {
          return { balances: [] }
        }
      }
    },
    async getFeeRates (): Promise<Record<string, unknown>> {
      return {}
    },
    async updatePolicies (chainId: number, newPolicies: Record<string, unknown>, accountIndex: number = 0): Promise<void> {
      await store.savePolicy(accountIndex, chainId, {
        policies: (newPolicies as Record<string, unknown>).policies as unknown[] || [],
        signature: (newPolicies as Record<string, unknown>).signature as Record<string, unknown> || {}
      })
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
