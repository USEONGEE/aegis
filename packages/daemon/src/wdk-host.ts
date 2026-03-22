import { join, dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { SqliteWdkStore, createGuardedWDK } from '@wdk-app/guarded-wdk'
import { StubWalletManager } from './stub-wallet-manager.js'
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
 *
 * No Fallback: @tetherto/wdk가 없으면 실패한다. mock 없음.
 */
export async function initWDK (config: DaemonConfig, logger: Logger): Promise<WDKInitResult> {
  const dbPath = config.storePath.endsWith('.db')
    ? config.storePath
    : join(config.storePath, 'wdk.db')
  await mkdir(dirname(dbPath), { recursive: true })
  const store = new SqliteWdkStore(dbPath)
  await store.init()

  // Load master seed (or provision from MASTER_SEED env var)
  let masterSeed = await store.getMasterSeed()
  if (!masterSeed && process.env.MASTER_SEED) {
    const envMnemonic = process.env.MASTER_SEED
    await store.setMasterSeed(envMnemonic)
    masterSeed = { mnemonic: envMnemonic, createdAt: Date.now() }
    logger.info('Master seed provisioned from MASTER_SEED environment variable')
  }
  if (!masterSeed) {
    logger.warn('No master seed found. WDK will not be initialized until a seed is added.')
    await store.dispose()
    return { facade: null }
  }

  const mnemonic: string = masterSeed.mnemonic

  // Load trusted approvers (public keys) from paired signers
  const signers = await store.listSigners()
  const trustedApprovers: string[] = signers
    .filter(d => d.status.kind === 'active')
    .map(d => d.publicKey)

  // EVM wallet manager 등록: HyperEVM (chain 999) 데모 환경.
  // IMPORTANT: 이 값은 AI tool 호출의 chain 파라미터와 일치해야 한다.
  // TOOLS.md에서 AI에게 chain: "999"를 사용하도록 지시하고 있다.
  const EVM_CHAIN_KEY = '999'

  // Factory가 emitter + broker를 소유. daemon은 facade 메서드만 사용.
  const facade = await createGuardedWDK({
    seed: mnemonic,
    wallets: {
      [EVM_CHAIN_KEY]: { Manager: StubWalletManager as never, config: {} }
    },
    protocols: {},
    approvalStore: store,
    trustedApprovers
  })

  logger.info({ approverCount: trustedApprovers.length }, 'WDK host initialized.')

  return { facade }
}
