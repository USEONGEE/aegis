import { randomUUID } from 'node:crypto'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  ApprovalStore,
  type SignedPolicy,
  type StoredPolicy,
  type ApprovalRequest,
  type PendingRequest,
  type HistoryEntry,
  type StoredHistoryEntry,
  type DeviceRecord,
  type CronRecord,
  type CronInput,
  type SeedRecord,
  type JournalEntry,
  type StoredJournalEntry,
  type HistoryQueryOpts,
  type JournalQueryOpts
} from './approval-store.js'

interface SeedsFile {
  seeds: SeedRecord[]
  activeSeedId: string | null
}

/**
 * JSON file-backed implementation of ApprovalStore.
 * Each data domain is stored in a separate JSON file.
 * Atomic writes: write to .tmp then rename.
 */
export class JsonApprovalStore extends ApprovalStore {
  private _dir: string

  constructor (dir?: string) {
    super()
    this._dir = dir || join(homedir(), '.wdk', 'store')
  }

  // --- File helpers ---

  private _path (name: string): string {
    return join(this._dir, name)
  }

  private async _read<T> (name: string): Promise<T | null> {
    try {
      const raw = await readFile(this._path(name), 'utf8')
      return JSON.parse(raw) as T
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  private async _write (name: string, data: unknown): Promise<void> {
    const target = this._path(name)
    const tmp = target + '.tmp'
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await rename(tmp, target)
  }

  // --- Lifecycle ---

  override async init (): Promise<void> {
    await mkdir(this._dir, { recursive: true })
    // Ensure all files exist with defaults
    const defaults: Record<string, unknown> = {
      'policies.json': {},
      'pending.json': [],
      'history.json': [],
      'devices.json': {},
      'nonces.json': {},
      'crons.json': [],
      'seeds.json': { seeds: [], activeSeedId: null },
      'journal.json': []
    }
    for (const [name, defaultVal] of Object.entries(defaults)) {
      const existing = await this._read(name)
      if (existing === null) {
        await this._write(name, defaultVal)
      }
    }
  }

  override async dispose (): Promise<void> {
    // No resources to release for file-based store
  }

  // --- Active Policy ---

  override async loadPolicy (seedId: string, chain: string): Promise<StoredPolicy | null> {
    const policies = await this._read<Record<string, StoredPolicy>>('policies.json') || {}
    const key = `${seedId}:${chain}`
    return policies[key] || null
  }

  override async savePolicy (seedId: string, chain: string, signedPolicy: SignedPolicy): Promise<void> {
    const policies = await this._read<Record<string, StoredPolicy>>('policies.json') || {}
    const key = `${seedId}:${chain}`
    const existing = policies[key]
    const version = existing ? (existing.policy_version || 0) + 1 : 1
    policies[key] = {
      seed_id: seedId,
      chain,
      ...signedPolicy,
      policy_version: version,
      updated_at: Date.now()
    }
    await this._write('policies.json', policies)
  }

  override async getPolicyVersion (seedId: string, chain: string): Promise<number> {
    const policy = await this.loadPolicy(seedId, chain)
    return policy ? policy.policy_version : 0
  }

  // --- Pending Requests ---

  override async loadPending (seedId: string | null, type: string | null, chain: string | null): Promise<PendingRequest[]> {
    const pending = await this._read<PendingRequest[]>('pending.json') || []
    return pending.filter(p => {
      if (seedId && p.seed_id !== seedId) return false
      if (type && p.type !== type) return false
      if (chain && p.chain !== chain) return false
      return true
    })
  }

  override async savePending (seedId: string, request: ApprovalRequest): Promise<void> {
    const pending = await this._read<PendingRequest[]>('pending.json') || []
    pending.push({
      request_id: request.requestId,
      seed_id: seedId,
      type: request.type,
      chain: request.chain,
      target_hash: request.targetHash,
      metadata_json: request.metadata ? JSON.stringify(request.metadata) : null,
      created_at: request.createdAt || Date.now()
    })
    await this._write('pending.json', pending)
  }

  override async removePending (requestId: string): Promise<void> {
    const pending = await this._read<PendingRequest[]>('pending.json') || []
    const filtered = pending.filter(p => p.request_id !== requestId)
    await this._write('pending.json', filtered)
  }

  // --- History ---

  override async appendHistory (entry: HistoryEntry): Promise<void> {
    const history = await this._read<StoredHistoryEntry[]>('history.json') || []
    history.push({
      seed_id: entry.seedId || entry.seed_id || '',
      type: entry.type,
      chain: entry.chain || null,
      target_hash: entry.targetHash || entry.target_hash || '',
      approver: entry.approver,
      device_id: entry.deviceId || entry.device_id || '',
      action: entry.action,
      signed_approval_json: entry.signedApproval ? JSON.stringify(entry.signedApproval) : null,
      timestamp: entry.timestamp || Date.now()
    })
    await this._write('history.json', history)
  }

  override async getHistory (opts: HistoryQueryOpts = {}): Promise<StoredHistoryEntry[]> {
    const history = await this._read<StoredHistoryEntry[]>('history.json') || []
    let result = history
    if (opts.seedId) {
      result = result.filter(h => h.seed_id === opts.seedId)
    }
    if (opts.type) {
      result = result.filter(h => h.type === opts.type)
    }
    if (opts.chain) {
      result = result.filter(h => h.chain === opts.chain)
    }
    if (opts.limit) {
      result = result.slice(-opts.limit)
    }
    return result
  }

  // --- Devices ---

  override async saveDevice (deviceId: string, publicKey: string): Promise<void> {
    const devices = await this._read<Record<string, DeviceRecord>>('devices.json') || {}
    devices[deviceId] = {
      device_id: deviceId,
      public_key: publicKey,
      name: null,
      paired_at: Date.now(),
      revoked_at: null
    }
    await this._write('devices.json', devices)
  }

  override async getDevice (deviceId: string): Promise<DeviceRecord | null> {
    const devices = await this._read<Record<string, DeviceRecord>>('devices.json') || {}
    return devices[deviceId] || null
  }

  override async listDevices (): Promise<DeviceRecord[]> {
    const devices = await this._read<Record<string, DeviceRecord>>('devices.json') || {}
    return Object.values(devices)
  }

  override async revokeDevice (deviceId: string): Promise<void> {
    const devices = await this._read<Record<string, DeviceRecord>>('devices.json') || {}
    if (devices[deviceId]) {
      devices[deviceId].revoked_at = Date.now()
      await this._write('devices.json', devices)
    }
  }

  override async isDeviceRevoked (deviceId: string): Promise<boolean> {
    const devices = await this._read<Record<string, DeviceRecord>>('devices.json') || {}
    const device = devices[deviceId]
    if (!device) return false
    return device.revoked_at !== null
  }

  // --- Nonce ---

  override async getLastNonce (approver: string, deviceId: string): Promise<number> {
    const nonces = await this._read<Record<string, number>>('nonces.json') || {}
    const key = `${approver}:${deviceId}`
    return nonces[key] || 0
  }

  override async updateNonce (approver: string, deviceId: string, nonce: number): Promise<void> {
    const nonces = await this._read<Record<string, number>>('nonces.json') || {}
    const key = `${approver}:${deviceId}`
    nonces[key] = nonce
    await this._write('nonces.json', nonces)
  }

  // --- Cron ---

  override async listCrons (seedId?: string): Promise<CronRecord[]> {
    const crons = await this._read<CronRecord[]>('crons.json') || []
    if (seedId) {
      return crons.filter(c => c.seed_id === seedId)
    }
    return crons
  }

  override async saveCron (seedId: string, cron: CronInput): Promise<void> {
    const crons = await this._read<CronRecord[]>('crons.json') || []
    crons.push({
      id: cron.id || randomUUID(),
      seed_id: seedId,
      session_id: cron.sessionId || cron.session_id || '',
      interval: cron.interval,
      prompt: cron.prompt,
      chain: cron.chain || null,
      created_at: cron.createdAt || Date.now(),
      last_run_at: null,
      is_active: 1
    })
    await this._write('crons.json', crons)
  }

  override async removeCron (cronId: string): Promise<void> {
    const crons = await this._read<CronRecord[]>('crons.json') || []
    const filtered = crons.filter(c => c.id !== cronId)
    await this._write('crons.json', filtered)
  }

  override async updateCronLastRun (cronId: string, timestamp: number): Promise<void> {
    const crons = await this._read<CronRecord[]>('crons.json') || []
    const cron = crons.find(c => c.id === cronId)
    if (cron) {
      cron.last_run_at = timestamp
      await this._write('crons.json', crons)
    }
  }

  // --- Seeds ---

  override async listSeeds (): Promise<SeedRecord[]> {
    const data = await this._read<SeedsFile>('seeds.json') || { seeds: [], activeSeedId: null }
    return data.seeds
  }

  override async getSeed (seedId: string): Promise<SeedRecord | null> {
    const data = await this._read<SeedsFile>('seeds.json') || { seeds: [], activeSeedId: null }
    return data.seeds.find(s => s.id === seedId) || null
  }

  override async addSeed (name: string, mnemonic: string): Promise<SeedRecord> {
    const data = await this._read<SeedsFile>('seeds.json') || { seeds: [], activeSeedId: null }
    const id = randomUUID()
    const seed: SeedRecord = {
      id,
      name,
      mnemonic,
      created_at: Date.now(),
      is_active: data.seeds.length === 0 ? 1 : 0
    }
    data.seeds.push(seed)
    if (data.seeds.length === 1) {
      data.activeSeedId = id
    }
    await this._write('seeds.json', data)
    return seed
  }

  override async removeSeed (seedId: string): Promise<void> {
    const data = await this._read<SeedsFile>('seeds.json') || { seeds: [], activeSeedId: null }
    data.seeds = data.seeds.filter(s => s.id !== seedId)
    if (data.activeSeedId === seedId) {
      data.activeSeedId = data.seeds.length > 0 ? data.seeds[0].id : null
      for (const s of data.seeds) {
        s.is_active = s.id === data.activeSeedId ? 1 : 0
      }
    }
    await this._write('seeds.json', data)
  }

  override async setActiveSeed (seedId: string): Promise<void> {
    const data = await this._read<SeedsFile>('seeds.json') || { seeds: [], activeSeedId: null }
    const seed = data.seeds.find(s => s.id === seedId)
    if (!seed) throw new Error(`Seed not found: ${seedId}`)
    data.activeSeedId = seedId
    for (const s of data.seeds) {
      s.is_active = s.id === seedId ? 1 : 0
    }
    await this._write('seeds.json', data)
  }

  override async getActiveSeed (): Promise<SeedRecord | null> {
    const data = await this._read<SeedsFile>('seeds.json') || { seeds: [], activeSeedId: null }
    if (!data.activeSeedId) return null
    return data.seeds.find(s => s.id === data.activeSeedId) || null
  }

  // --- Execution Journal ---

  override async getJournalEntry (intentId: string): Promise<StoredJournalEntry | null> {
    const journal = await this._read<StoredJournalEntry[]>('journal.json') || []
    return journal.find(j => j.intent_id === intentId) || null
  }

  override async saveJournalEntry (entry: JournalEntry): Promise<void> {
    const journal = await this._read<StoredJournalEntry[]>('journal.json') || []
    journal.push({
      intent_id: entry.intentId || entry.intent_id || '',
      seed_id: entry.seedId || entry.seed_id || '',
      chain: entry.chain,
      target_hash: entry.targetHash || entry.target_hash || '',
      status: entry.status,
      tx_hash: entry.txHash || entry.tx_hash || null,
      created_at: entry.createdAt || Date.now(),
      updated_at: entry.updatedAt || Date.now()
    })
    await this._write('journal.json', journal)
  }

  override async updateJournalStatus (intentId: string, status: string, txHash?: string): Promise<void> {
    const journal = await this._read<StoredJournalEntry[]>('journal.json') || []
    const entry = journal.find(j => j.intent_id === intentId)
    if (entry) {
      entry.status = status
      if (txHash !== undefined) entry.tx_hash = txHash
      entry.updated_at = Date.now()
      await this._write('journal.json', journal)
    }
  }

  override async listJournal (opts: JournalQueryOpts = {}): Promise<StoredJournalEntry[]> {
    const journal = await this._read<StoredJournalEntry[]>('journal.json') || []
    let result = journal
    if (opts.seedId) {
      result = result.filter(j => j.seed_id === opts.seedId)
    }
    if (opts.status) {
      result = result.filter(j => j.status === opts.status)
    }
    if (opts.chain) {
      result = result.filter(j => j.chain === opts.chain)
    }
    if (opts.limit) {
      result = result.slice(-opts.limit)
    }
    return result
  }
}
