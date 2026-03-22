import { join, dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { SqliteWdkStore, SignedApprovalBroker } from '@wdk-app/guarded-wdk'
import type { createGuardedWDK } from '@wdk-app/guarded-wdk'
import type { DaemonConfig } from './config.js'
import type { Logger } from 'pino'

// ---------------------------------------------------------------------------
// Boundary Types — derived from guarded-wdk public export
// ---------------------------------------------------------------------------

type GuardedWDK = Awaited<ReturnType<typeof createGuardedWDK>>

/** daemon이 실제 사용하는 WDK facade 메서드만 선택 */
export type WDKInstance = Pick<GuardedWDK,
  'getAccount' | 'loadPolicy' | 'getPendingApprovals' |
  'listRejections' | 'listPolicyVersions' | 'listSigners' | 'listWallets' | 'listJournal' |
  'getPolicyVersion' | 'saveRejection' |
  'submitApproval' | 'createApprovalRequest' | 'setTrustedApprovers' |
  'on' | 'off' | 'dispose'
>

interface WDKInitResult {
  facade: WDKInstance | null
}

/**
 * Initialize the WDK host: load master seed, create store, build guarded WDK.
 *
 * Returns { facade } or null facade if no seed is available.
 * store는 facade 내부에서 관리. dispose는 facade.dispose()가 처리.
 */
export async function initWDK (config: DaemonConfig, logger: Logger): Promise<WDKInitResult> {
  const dbPath = config.storePath.endsWith('.db')
    ? config.storePath
    : join(config.storePath, 'wdk.db')
  await mkdir(dirname(dbPath), { recursive: true })
  const store = new SqliteWdkStore(dbPath)
  await store.init()

  // Load master seed
  const masterSeed = await store.getMasterSeed()
  if (!masterSeed) {
    logger.warn('No master seed found. WDK will not be initialized until a seed is added.')
    await store.dispose()
    return { facade: null }
  }

  const mnemonic: string = masterSeed.mnemonic

  // Load trusted approvers (public keys) from paired signers
  const signers = await store.listSigners()
  const trustedApprovers: string[] = signers
    .filter(d => d.revokedAt === null || d.revokedAt === undefined)
    .map(d => d.publicKey)

  // Factory가 emitter + broker를 소유. daemon은 facade 메서드만 사용.
  let facade: WDKInstance
  try {
    const mod = await import('@wdk-app/guarded-wdk')
    facade = await mod.createGuardedWDK({
      seed: mnemonic,
      wallets: {},
      protocols: {},
      approvalStore: store,
      trustedApprovers
    })
  } catch (err: unknown) {
    logger.warn({ err: (err as Error).message }, 'Could not create real GuardedWDK. Using mock host.')
    facade = createMockWDK(store, trustedApprovers)
  }

  logger.info({ approverCount: trustedApprovers.length }, 'WDK host initialized.')

  return { facade }
}

/**
 * Minimal mock WDK for environments where @tetherto/wdk is not installed.
 * v0.4.5: facade 메서드를 직접 노출. getApprovalBroker/getWdkStore 제거.
 */
function createMockWDK (store: InstanceType<typeof SqliteWdkStore>, trustedApprovers: string[]): WDKInstance {
  const emitter = new EventEmitter()
  const broker = new SignedApprovalBroker(trustedApprovers, store, emitter)

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

    // --- Store read methods ---
    loadPolicy: (accountIndex, chainId) => store.loadPolicy(accountIndex, chainId),
    getPendingApprovals: (accountIndex, type, chainId) => store.loadPendingApprovals(accountIndex, type, chainId),
    listRejections: (opts) => store.listRejections(opts),
    listPolicyVersions: (accountIndex, chainId) => store.listPolicyVersions(accountIndex, chainId),
    listSigners: () => store.listSigners(),
    listWallets: () => store.listWallets(),
    listJournal: (opts) => store.listJournal(opts),
    getPolicyVersion: (accountIndex, chainId) => store.getPolicyVersion(accountIndex, chainId),
    saveRejection: (entry) => store.saveRejection(entry),

    // --- Broker methods ---
    submitApproval: (signedApproval, context) => broker.submitApproval(signedApproval, context),
    createApprovalRequest: (type, opts) => broker.createRequest(type, opts),
    setTrustedApprovers: (approvers) => broker.setTrustedApprovers(approvers),

    on (type: string, handler: (...args: unknown[]) => void): void {
      emitter.on(type, handler)
    },
    off (type: string, handler: (...args: unknown[]) => void): void {
      emitter.off(type, handler)
    },
    dispose (): void {
      broker.dispose()
    }
  } as WDKInstance
}
