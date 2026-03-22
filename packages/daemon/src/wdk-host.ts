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
 * Initialize the WDK host: load master seed, create store, build guarded WDK.
 *
 * Returns { wdk, broker, store } or null wdk if no seed is available.
 *
 * v0.4.2: Factory가 emitter + broker를 소유. daemon은 wdk.getApprovalBroker()로 획득.
 * Dual emitter 버그 수정 — 이전에는 daemon이 별도 emitter/broker를 생성하여
 * broker 이벤트가 wdk.on()에 도달하지 않았음.
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

  // v0.4.2: Factory가 emitter + broker를 소유. daemon은 직접 생성하지 않음.
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
    wdk = createMockWDK(store, trustedApprovers)
  }

  // Factory 산출물에서 broker를 획득
  const broker = wdk.getApprovalBroker() as SignedApprovalBroker

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
 * v0.4.2: 실제 EventEmitter + broker를 내장하여 wdk.on()이 동작.
 */
function createMockWDK (store: InstanceType<typeof SqliteApprovalStore>, trustedApprovers: string[]): WDKInstance {
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
    getApprovalBroker (): SignedApprovalBroker {
      return broker
    },
    getApprovalStore () {
      return store
    },
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
