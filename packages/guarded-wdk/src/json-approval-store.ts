import { randomUUID } from 'node:crypto'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { chmodSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  ApprovalStore,
  type PolicyInput,
  type StoredPolicy,
  type ApprovalType,
  type ApprovalRequest,
  type PendingApprovalRequest,
  type HistoryEntry,
  type StoredSigner,
  type JournalInput,
  type CronInput,
  type StoredCron,
  type StoredSeed,
  type StoredJournal,
  type HistoryQueryOpts,
  type JournalQueryOpts,
  type SignedApproval
} from './approval-store.js'
import type { PendingApprovalRow, StoredHistoryEntry, CronRow, StoredJournalEntry, SignerRow, SeedRow, PolicyRow } from './store-types.js'

interface SeedsFile {
  seeds: SeedRow[]
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
    chmodSync(this._dir, 0o700)
    // Ensure all files exist with defaults
    const defaults: Record<string, unknown> = {
      'policies.json': {},
      'pending.json': [],
      'history.json': [],
      'signers.json': {},
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

  override async loadPolicy (seedId: string, chainId: number): Promise<StoredPolicy | null> {
    const policies = await this._read<Record<string, PolicyRow>>('policies.json') || {}
    const key = `${seedId}:${chainId}`
    const row = policies[key]
    if (!row) return null
    return {
      seedId: row.seed_id,
      chainId: row.chain_id,
      policiesJson: row.policies_json,
      signatureJson: row.signature_json,
      policyVersion: row.policy_version,
      updatedAt: row.updated_at
    }
  }

  override async savePolicy (seedId: string, chainId: number, input: PolicyInput): Promise<void> {
    const policies = await this._read<Record<string, PolicyRow>>('policies.json') || {}
    const key = `${seedId}:${chainId}`
    const existing = policies[key]
    const version = existing ? (existing.policy_version || 0) + 1 : 1
    policies[key] = {
      seed_id: seedId,
      chain_id: chainId,
      policies_json: JSON.stringify(input.policies),
      signature_json: JSON.stringify(input.signature),
      policy_version: version,
      updated_at: Date.now()
    }
    await this._write('policies.json', policies)
  }

  override async getPolicyVersion (seedId: string, chainId: number): Promise<number> {
    const policy = await this.loadPolicy(seedId, chainId)
    return policy ? policy.policyVersion : 0
  }

  override async listPolicyChains (seedId: string): Promise<string[]> {
    const policies = await this._read<Record<string, PolicyRow>>('policies.json') || {}
    const prefix = `${seedId}:`
    return Object.keys(policies)
      .filter(key => key.startsWith(prefix))
      .map(key => key.slice(prefix.length))
  }

  // --- Pending Requests ---

  override async loadPendingApprovals (seedId: string | null, type: string | null, chainId: number | null): Promise<PendingApprovalRequest[]> {
    const pending = await this._read<PendingApprovalRow[]>('pending.json') || []
    return pending
      .filter(p => {
        if (seedId && p.seed_id !== seedId) return false
        if (type && p.type !== type) return false
        if (chainId !== null && chainId !== undefined && p.chain_id !== chainId) return false
        return true
      })
      .map(p => ({
        requestId: p.request_id,
        seedId: p.seed_id,
        type: p.type as ApprovalType,
        chainId: p.chain_id,
        targetHash: p.target_hash,
        metadata: p.metadata_json ? JSON.parse(p.metadata_json) as Record<string, unknown> : undefined,
        createdAt: p.created_at
      }))
  }

  override async loadPendingByRequestId (requestId: string): Promise<PendingApprovalRequest | null> {
    const pending = await this._read<PendingApprovalRow[]>('pending.json') || []
    const row = pending.find(p => p.request_id === requestId)
    if (!row) return null
    return {
      requestId: row.request_id,
      seedId: row.seed_id,
      type: row.type as ApprovalType,
      chainId: row.chain_id,
      targetHash: row.target_hash,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : undefined,
      createdAt: row.created_at
    }
  }

  override async savePendingApproval (seedId: string, request: ApprovalRequest): Promise<void> {
    const pending = await this._read<PendingApprovalRow[]>('pending.json') || []
    pending.push({
      request_id: request.requestId,
      seed_id: seedId,
      type: request.type,
      chain_id: request.chainId,
      target_hash: request.targetHash,
      metadata_json: request.metadata ? JSON.stringify(request.metadata) : null,
      created_at: request.createdAt || Date.now()
    })
    await this._write('pending.json', pending)
  }

  override async removePendingApproval (requestId: string): Promise<void> {
    const pending = await this._read<PendingApprovalRow[]>('pending.json') || []
    const filtered = pending.filter(p => p.request_id !== requestId)
    await this._write('pending.json', filtered)
  }

  // --- History ---

  override async appendHistory (entry: HistoryEntry): Promise<void> {
    const history = await this._read<StoredHistoryEntry[]>('history.json') || []
    history.push({
      seed_id: entry.seedId,
      type: entry.type,
      chain_id: entry.chainId ?? null,
      target_hash: entry.targetHash,
      approver: entry.approver,
      signer_id: entry.signerId,
      action: entry.action,
      signed_approval_json: entry.signedApproval ? JSON.stringify(entry.signedApproval) : null,
      timestamp: entry.timestamp
    })
    await this._write('history.json', history)
  }

  override async getHistory (opts: HistoryQueryOpts = {}): Promise<HistoryEntry[]> {
    const history = await this._read<StoredHistoryEntry[]>('history.json') || []
    let result = history
    if (opts.seedId) {
      result = result.filter(h => h.seed_id === opts.seedId)
    }
    if (opts.type) {
      result = result.filter(h => h.type === opts.type)
    }
    if (opts.chainId !== undefined) {
      result = result.filter(h => h.chain_id === opts.chainId)
    }
    if (opts.limit) {
      result = result.slice(-opts.limit)
    }
    return result.map(h => ({
      seedId: h.seed_id,
      type: h.type,
      chainId: h.chain_id,
      targetHash: h.target_hash,
      approver: h.approver,
      signerId: h.signer_id,
      action: h.action,
      signedApproval: h.signed_approval_json ? JSON.parse(h.signed_approval_json) as SignedApproval : undefined,
      timestamp: h.timestamp
    }))
  }

  // --- Signers ---

  override async saveSigner (signerId: string, publicKey: string): Promise<void> {
    const signers = await this._read<Record<string, SignerRow>>('signers.json') || {}
    signers[signerId] = {
      signer_id: signerId,
      public_key: publicKey,
      name: null,
      registered_at: Date.now(),
      revoked_at: null
    }
    await this._write('signers.json', signers)
  }

  override async getSigner (signerId: string): Promise<StoredSigner | null> {
    const signers = await this._read<Record<string, SignerRow>>('signers.json') || {}
    const row = signers[signerId]
    if (!row) return null
    return {
      signerId: row.signer_id,
      publicKey: row.public_key,
      name: row.name,
      registeredAt: row.registered_at,
      revokedAt: row.revoked_at
    }
  }

  override async listSigners (): Promise<StoredSigner[]> {
    const signers = await this._read<Record<string, SignerRow>>('signers.json') || {}
    return Object.values(signers).map(row => ({
      signerId: row.signer_id,
      publicKey: row.public_key,
      name: row.name,
      registeredAt: row.registered_at,
      revokedAt: row.revoked_at
    }))
  }

  override async revokeSigner (signerId: string): Promise<void> {
    const signers = await this._read<Record<string, SignerRow>>('signers.json') || {}
    if (signers[signerId]) {
      signers[signerId].revoked_at = Date.now()
      await this._write('signers.json', signers)
    }
  }

  override async isSignerRevoked (signerId: string): Promise<boolean> {
    const signers = await this._read<Record<string, SignerRow>>('signers.json') || {}
    const row = signers[signerId]
    if (!row) return false
    return row.revoked_at !== null
  }

  // --- Nonce ---

  override async getLastNonce (approver: string, signerId: string): Promise<number> {
    const nonces = await this._read<Record<string, number>>('nonces.json') || {}
    const key = `${approver}:${signerId}`
    return nonces[key] || 0
  }

  override async updateNonce (approver: string, signerId: string, nonce: number): Promise<void> {
    const nonces = await this._read<Record<string, number>>('nonces.json') || {}
    const key = `${approver}:${signerId}`
    nonces[key] = nonce
    await this._write('nonces.json', nonces)
  }

  // --- Cron ---

  override async listCrons (seedId?: string): Promise<StoredCron[]> {
    const crons = await this._read<CronRow[]>('crons.json') || []
    const filtered = seedId ? crons.filter(c => c.seed_id === seedId) : crons
    return filtered.map(c => ({
      id: c.id,
      seedId: c.seed_id,
      sessionId: c.session_id,
      interval: c.interval,
      prompt: c.prompt,
      chainId: c.chain_id,
      createdAt: c.created_at,
      lastRunAt: c.last_run_at,
      isActive: c.is_active === 1
    }))
  }

  override async saveCron (seedId: string, cron: CronInput): Promise<string> {
    const crons = await this._read<CronRow[]>('crons.json') || []
    const id = randomUUID()
    crons.push({
      id,
      seed_id: seedId,
      session_id: cron.sessionId,
      interval: cron.interval,
      prompt: cron.prompt,
      chain_id: cron.chainId,
      created_at: Date.now(),
      last_run_at: null,
      is_active: 1
    })
    await this._write('crons.json', crons)
    return id
  }

  override async removeCron (cronId: string): Promise<void> {
    const crons = await this._read<CronRow[]>('crons.json') || []
    const filtered = crons.filter(c => c.id !== cronId)
    await this._write('crons.json', filtered)
  }

  override async updateCronLastRun (cronId: string, timestamp: number): Promise<void> {
    const crons = await this._read<CronRow[]>('crons.json') || []
    const cron = crons.find(c => c.id === cronId)
    if (cron) {
      cron.last_run_at = timestamp
      await this._write('crons.json', crons)
    }
  }

  // --- Seeds ---

  override async listSeeds (): Promise<StoredSeed[]> {
    const data = await this._read<SeedsFile>('seeds.json') || { seeds: [], activeSeedId: null }
    return data.seeds.map(row => ({
      id: row.id,
      name: row.name,
      mnemonic: row.mnemonic,
      createdAt: row.created_at,
      isActive: row.is_active === 1
    }))
  }

  override async getSeed (seedId: string): Promise<StoredSeed | null> {
    const data = await this._read<SeedsFile>('seeds.json') || { seeds: [], activeSeedId: null }
    const row = data.seeds.find(s => s.id === seedId)
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      mnemonic: row.mnemonic,
      createdAt: row.created_at,
      isActive: row.is_active === 1
    }
  }

  override async addSeed (name: string, mnemonic: string): Promise<StoredSeed> {
    const data = await this._read<SeedsFile>('seeds.json') || { seeds: [], activeSeedId: null }
    const id = randomUUID()
    const isActiveNum = data.seeds.length === 0 ? 1 : 0
    const row: SeedRow = {
      id,
      name,
      mnemonic,
      created_at: Date.now(),
      is_active: isActiveNum
    }
    data.seeds.push(row)
    if (data.seeds.length === 1) {
      data.activeSeedId = id
    }
    await this._write('seeds.json', data)
    return {
      id: row.id,
      name: row.name,
      mnemonic: row.mnemonic,
      createdAt: row.created_at,
      isActive: row.is_active === 1
    }
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

  override async getActiveSeed (): Promise<StoredSeed | null> {
    const data = await this._read<SeedsFile>('seeds.json') || { seeds: [], activeSeedId: null }
    if (!data.activeSeedId) return null
    const row = data.seeds.find(s => s.id === data.activeSeedId)
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      mnemonic: row.mnemonic,
      createdAt: row.created_at,
      isActive: row.is_active === 1
    }
  }

  // --- Execution Journal ---

  override async getJournalEntry (intentId: string): Promise<StoredJournal | null> {
    const journal = await this._read<StoredJournalEntry[]>('journal.json') || []
    const found = journal.find(j => j.intent_id === intentId)
    if (!found) return null
    return {
      intentId: found.intent_id,
      seedId: found.seed_id,
      chainId: found.chain_id,
      targetHash: found.target_hash,
      status: found.status,
      txHash: found.tx_hash,
      createdAt: found.created_at,
      updatedAt: found.updated_at
    }
  }

  override async saveJournalEntry (entry: JournalInput): Promise<void> {
    const journal = await this._read<StoredJournalEntry[]>('journal.json') || []
    const now = Date.now()
    journal.push({
      intent_id: entry.intentId,
      seed_id: entry.seedId,
      chain_id: entry.chainId,
      target_hash: entry.targetHash,
      status: entry.status,
      tx_hash: null,
      created_at: now,
      updated_at: now
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

  override async listJournal (opts: JournalQueryOpts = {}): Promise<StoredJournal[]> {
    const journal = await this._read<StoredJournalEntry[]>('journal.json') || []
    let result = journal
    if (opts.seedId) {
      result = result.filter(j => j.seed_id === opts.seedId)
    }
    if (opts.status) {
      result = result.filter(j => j.status === opts.status)
    }
    if (opts.chainId !== undefined) {
      result = result.filter(j => j.chain_id === opts.chainId)
    }
    if (opts.limit) {
      result = result.slice(-opts.limit)
    }
    return result.map(j => ({
      intentId: j.intent_id,
      seedId: j.seed_id,
      chainId: j.chain_id,
      targetHash: j.target_hash,
      status: j.status,
      txHash: j.tx_hash,
      createdAt: j.created_at,
      updatedAt: j.updated_at
    }))
  }
}
