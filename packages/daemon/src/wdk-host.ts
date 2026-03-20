import { join, dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { SqliteApprovalStore, SignedApprovalBroker } from '@wdk-app/guarded-wdk'
import type { createGuardedWDK } from '@wdk-app/guarded-wdk'
import type { DaemonConfig } from './config.js'
import type { Logger } from 'pino'

// ---------------------------------------------------------------------------
// Boundary Types — derived from guarded-wdk public export
// ---------------------------------------------------------------------------

type GuardedWDK = Awaited<ReturnType<typeof createGuardedWDK>>

/** daemon이 실제 사용하는 WDK facade 메서드만 선택 */
export type WDKInstance = Pick<GuardedWDK,
  'getAccount' | 'getApprovalBroker' | 'getApprovalStore' |
  'on' | 'off' | 'dispose'
>

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

  // Create shared EventEmitter and pass to broker
  const emitter = new EventEmitter()
  const broker = new SignedApprovalBroker(trustedApprovers, store, emitter)

  // Try to create the real guarded WDK; fall back to mock if @tetherto/wdk is absent
  let wdk: WDKInstance
  try {
    const mod = await import('@wdk-app/guarded-wdk')
    wdk = await mod.createGuardedWDK({
      seed: mnemonic,
      wallets: {},
      protocols: {},
      approvalStore: store,
      trustedApprovers
    })
  } catch (err: unknown) {
    logger.warn({ err: (err as Error).message }, 'Could not create real GuardedWDK. Using mock host.')
    wdk = createMockWDK(broker, store)
  }

  logger.info({ approverCount: trustedApprovers.length }, 'WDK host initialized.')

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
function createMockWDK (broker: SignedApprovalBroker, store: InstanceType<typeof SqliteApprovalStore>): WDKInstance {
  return {
    async getAccount (_chain: string, _index: number = 0) {
      return {
        chain: _chain,
        index: _index,
        async sendTransaction (_tx: Record<string, unknown>): Promise<never> {
          throw new Error('Mock WDK: sendTransaction not available. Install @tetherto/wdk.')
        },
        async signTransaction (tx: Record<string, unknown>): Promise<{ signedTx: string }> {
          const hash = createHash('sha256').update(JSON.stringify(tx)).digest('hex')
          return { signedTx: '0x' + hash }
        },
        async getBalance (): Promise<{ balances: unknown[] }> {
          return { balances: [] }
        }
      } as unknown as Awaited<ReturnType<WDKInstance['getAccount']>>
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
  } as WDKInstance
}
