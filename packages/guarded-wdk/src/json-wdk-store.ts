import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { chmodSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  WdkStore,
  type PolicyInput,
  type StoredPolicy,
  type ApprovalType,
  type ApprovalRequest,
  type PendingApprovalRequest,
  type HistoryEntry,
  type StoredSigner,
  type JournalStatus,
  type JournalInput,
  type MasterSeed,
  type StoredWallet,
  type StoredJournal,
  type HistoryQueryOpts,
  type JournalQueryOpts,
  type SignedApproval,
  type RejectionEntry,
  type RejectionQueryOpts,
  type PendingApprovalFilter,
  type PolicyVersionEntry,
  type PolicyDiff
} from './wdk-store.js'
import type { Policy, EvaluationContext } from './guarded-middleware.js'
import type { PendingApprovalRow, StoredHistoryEntry, StoredJournalEntry, SignerRow, MasterSeedRow, WalletRow, PolicyRow, RejectionRow, PolicyVersionRow } from './store-types.js'

/**
 * JSON file-backed implementation of WdkStore.
 * Each data domain is stored in a separate JSON file.
 * Atomic writes: write to .tmp then rename.
 */
export class JsonWdkStore extends WdkStore {
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
      'master-seed.json': null,
      'wallets.json': [],
      'journal.json': [],
      'rejection-history.json': [],
      'policy-versions.json': []
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

  // --- Master Seed ---

  override async getMasterSeed (): Promise<MasterSeed | null> {
    const row = await this._read<MasterSeedRow | null>('master-seed.json')
    if (!row) return null
    return {
      mnemonic: row.mnemonic,
      createdAt: row.created_at
    }
  }

  override async setMasterSeed (mnemonic: string): Promise<void> {
    const row: MasterSeedRow = {
      id: 1,
      mnemonic,
      created_at: Date.now()
    }
    await this._write('master-seed.json', row)
  }

  // --- Wallets ---

  override async listWallets (): Promise<StoredWallet[]> {
    const wallets = await this._read<WalletRow[]>('wallets.json') || []
    return wallets.map(row => ({
      accountIndex: row.account_index,
      name: row.name,
      address: row.address,
      createdAt: row.created_at
    }))
  }

  override async getWallet (accountIndex: number): Promise<StoredWallet | null> {
    const wallets = await this._read<WalletRow[]>('wallets.json') || []
    const row = wallets.find(w => w.account_index === accountIndex)
    if (!row) return null
    return {
      accountIndex: row.account_index,
      name: row.name,
      address: row.address,
      createdAt: row.created_at
    }
  }

  override async createWallet (accountIndex: number, name: string, address: string): Promise<StoredWallet> {
    const wallets = await this._read<WalletRow[]>('wallets.json') || []
    const row: WalletRow = {
      account_index: accountIndex,
      name,
      address,
      created_at: Date.now()
    }
    wallets.push(row)
    await this._write('wallets.json', wallets)
    return {
      accountIndex: row.account_index,
      name: row.name,
      address: row.address,
      createdAt: row.created_at
    }
  }

  override async deleteWallet (accountIndex: number): Promise<void> {
    // Remove wallet
    const wallets = await this._read<WalletRow[]>('wallets.json') || []
    const filtered = wallets.filter(w => w.account_index !== accountIndex)
    await this._write('wallets.json', filtered)

    // Remove related policies
    const policies = await this._read<Record<string, PolicyRow>>('policies.json') || {}
    const prefix = `${accountIndex}:`
    for (const key of Object.keys(policies)) {
      if (key.startsWith(prefix)) {
        delete policies[key]
      }
    }
    await this._write('policies.json', policies)

    // Remove related pending approvals
    const pending = await this._read<PendingApprovalRow[]>('pending.json') || []
    const filteredPending = pending.filter(p => p.account_index !== accountIndex)
    await this._write('pending.json', filteredPending)

    // Remove related journal entries (history is preserved)
    const journal = await this._read<StoredJournalEntry[]>('journal.json') || []
    const filteredJournal = journal.filter(j => j.account_index !== accountIndex)
    await this._write('journal.json', filteredJournal)
  }

  // --- Active Policy ---

  override async loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null> {
    const policies = await this._read<Record<string, PolicyRow>>('policies.json') || {}
    const key = `${accountIndex}:${chainId}`
    const row = policies[key]
    if (!row) return null
    return {
      accountIndex: row.account_index,
      chainId: row.chain_id,
      policies: JSON.parse(row.policies_json) as Policy[],
      signature: JSON.parse(row.signature_json) as Record<string, unknown>,
      policyVersion: row.policy_version,
      updatedAt: row.updated_at
    }
  }

  override async savePolicy (accountIndex: number, chainId: number, input: PolicyInput, description: string = ''): Promise<void> {
    const policies = await this._read<Record<string, PolicyRow>>('policies.json') || {}
    const key = `${accountIndex}:${chainId}`
    const existing = policies[key]
    const oldPolicies: Policy[] = existing ? JSON.parse(existing.policies_json) as Policy[] : []
    const version = existing ? (existing.policy_version || 0) + 1 : 1
    policies[key] = {
      account_index: accountIndex,
      chain_id: chainId,
      policies_json: JSON.stringify(input.policies),
      signature_json: JSON.stringify(input.signature),
      policy_version: version,
      updated_at: Date.now()
    }
    await this._write('policies.json', policies)

    const diff = version === 1 ? null : computePolicyDiff(oldPolicies, input.policies)
    const versions = await this._read<PolicyVersionRow[]>('policy-versions.json') || []
    versions.push({
      account_index: accountIndex,
      chain_id: chainId,
      version,
      description,
      diff_json: diff !== null ? JSON.stringify(diff) : null,
      changed_at: Date.now()
    })
    await this._write('policy-versions.json', versions)
  }

  override async getPolicyVersion (accountIndex: number, chainId: number): Promise<number> {
    const policy = await this.loadPolicy(accountIndex, chainId)
    return policy ? policy.policyVersion : 0
  }

  override async listPolicyChains (accountIndex: number): Promise<string[]> {
    const policies = await this._read<Record<string, PolicyRow>>('policies.json') || {}
    const prefix = `${accountIndex}:`
    return Object.keys(policies)
      .filter(key => key.startsWith(prefix))
      .map(key => key.slice(prefix.length))
  }

  // --- Pending Requests ---

  override async loadPendingApprovals (filter: PendingApprovalFilter): Promise<PendingApprovalRequest[]> {
    const { accountIndex, type, chainId } = filter
    const pending = await this._read<PendingApprovalRow[]>('pending.json') || []
    return pending
      .filter(p => {
        if (accountIndex !== undefined && p.account_index !== accountIndex) return false
        if (type !== undefined && p.type !== type) return false
        if (chainId !== undefined && p.chain_id !== chainId) return false
        return true
      })
      .map(p => ({
        requestId: p.request_id,
        type: p.type as ApprovalType,
        chainId: p.chain_id,
        targetHash: p.target_hash,
        accountIndex: p.account_index,
        content: p.content,
        walletName: p.wallet_name ?? `Wallet ${p.account_index}`,
        policies: p.policies_json ? JSON.parse(p.policies_json) as Policy[] : [],
        createdAt: p.created_at
      }))
  }

  override async loadPendingByRequestId (requestId: string): Promise<PendingApprovalRequest | null> {
    const pending = await this._read<PendingApprovalRow[]>('pending.json') || []
    const row = pending.find(p => p.request_id === requestId)
    if (!row) return null
    return {
      requestId: row.request_id,
      type: row.type as ApprovalType,
      chainId: row.chain_id,
      targetHash: row.target_hash,
      accountIndex: row.account_index,
      content: row.content,
      walletName: row.wallet_name ?? `Wallet ${row.account_index}`,
      policies: row.policies_json ? JSON.parse(row.policies_json) as Policy[] : [],
      createdAt: row.created_at
    }
  }

  override async savePendingApproval (accountIndex: number, request: ApprovalRequest): Promise<void> {
    const pending = await this._read<PendingApprovalRow[]>('pending.json') || []
    const req = request as PendingApprovalRequest
    const walletName = req.walletName ?? `Wallet ${accountIndex}`
    const policiesJson = req.policies && req.policies.length > 0
      ? JSON.stringify(req.policies)
      : null
    pending.push({
      request_id: request.requestId,
      account_index: accountIndex,
      type: request.type,
      chain_id: request.chainId,
      target_hash: request.targetHash,
      content: request.content,
      wallet_name: walletName,
      policies_json: policiesJson,
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
      account_index: entry.accountIndex,
      request_id: entry.requestId,
      type: entry.type,
      chain_id: entry.chainId,
      target_hash: entry.targetHash,
      approver: entry.approver,
      action: entry.action,
      content: entry.content,
      signed_approval_json: JSON.stringify(entry.signedApproval),
      timestamp: entry.timestamp
    })
    await this._write('history.json', history)
  }

  override async getHistory (opts: HistoryQueryOpts = {}): Promise<HistoryEntry[]> {
    const history = await this._read<StoredHistoryEntry[]>('history.json') || []
    let filtered = history
    if (opts.accountIndex !== undefined) {
      filtered = filtered.filter(h => h.account_index === opts.accountIndex)
    }
    if (opts.type) {
      filtered = filtered.filter(h => h.type === opts.type)
    }
    if (opts.chainId !== undefined) {
      filtered = filtered.filter(h => h.chain_id === opts.chainId)
    }
    if (opts.limit) {
      filtered = filtered.slice(-opts.limit)
    }
    const result: HistoryEntry[] = []
    for (const h of filtered) {
      // Legacy: skip rows with null signed_approval_json
      if (h.signed_approval_json === null) continue
      const signedApproval = JSON.parse(h.signed_approval_json) as SignedApproval
      // Legacy: skip rows with null chain_id (try to recover from signedApproval)
      const chainId = h.chain_id ?? signedApproval.chainId
      if (chainId === undefined || chainId === null) continue
      result.push({
        accountIndex: h.account_index,
        requestId: h.request_id ?? '',
        type: h.type,
        chainId,
        targetHash: h.target_hash,
        approver: h.approver,
        action: h.action,
        content: h.content ?? '',
        signedApproval,
        timestamp: h.timestamp
      })
    }
    return result
  }

  // --- Signers ---

  override async saveSigner (publicKey: string, name: string): Promise<void> {
    const signers = await this._read<Record<string, SignerRow>>('signers.json') || {}
    signers[publicKey] = {
      public_key: publicKey,
      name: name ?? null,
      registered_at: Date.now(),
      revoked_at: null
    }
    await this._write('signers.json', signers)
  }

  override async getSigner (publicKey: string): Promise<StoredSigner | null> {
    const signers = await this._read<Record<string, SignerRow>>('signers.json') || {}
    const row = signers[publicKey]
    if (!row) return null
    return {
      publicKey: row.public_key,
      name: row.name ?? row.public_key.slice(0, 8),
      registeredAt: row.registered_at,
      status: row.revoked_at !== null ? { kind: 'revoked', revokedAt: row.revoked_at } : { kind: 'active' }
    }
  }

  override async listSigners (): Promise<StoredSigner[]> {
    const signers = await this._read<Record<string, SignerRow>>('signers.json') || {}
    return Object.values(signers).map(row => ({
      publicKey: row.public_key,
      name: row.name ?? row.public_key.slice(0, 8),
      registeredAt: row.registered_at,
      status: row.revoked_at !== null ? { kind: 'revoked', revokedAt: row.revoked_at } : { kind: 'active' }
    }))
  }

  override async revokeSigner (publicKey: string): Promise<void> {
    const signers = await this._read<Record<string, SignerRow>>('signers.json') || {}
    if (signers[publicKey]) {
      signers[publicKey].revoked_at = Date.now()
      await this._write('signers.json', signers)
    }
  }

  override async isSignerRevoked (publicKey: string): Promise<boolean> {
    const signers = await this._read<Record<string, SignerRow>>('signers.json') || {}
    const row = signers[publicKey]
    if (!row) return false
    return row.revoked_at !== null
  }

  // --- Nonce ---

  override async getLastNonce (approver: string): Promise<number> {
    const nonces = await this._read<Record<string, number>>('nonces.json') || {}
    return nonces[approver] || 0
  }

  override async updateNonce (approver: string, nonce: number): Promise<void> {
    const nonces = await this._read<Record<string, number>>('nonces.json') || {}
    nonces[approver] = nonce
    await this._write('nonces.json', nonces)
  }

  // --- Execution Journal ---

  override async getJournalEntry (intentHash: string): Promise<StoredJournal | null> {
    const journal = await this._read<StoredJournalEntry[]>('journal.json') || []
    const found = journal.find(j => j.intent_hash === intentHash)
    if (!found) return null
    return {
      intentHash: found.intent_hash,
      accountIndex: found.account_index,
      chainId: found.chain_id,
      dedupKey: found.dedup_key,
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
      intent_hash: entry.intentHash,
      account_index: entry.accountIndex,
      chain_id: entry.chainId,
      dedup_key: entry.dedupKey,
      status: entry.status,
      tx_hash: null,
      created_at: now,
      updated_at: now
    })
    await this._write('journal.json', journal)
  }

  override async updateJournalStatus (intentHash: string, status: JournalStatus, txHash: string | null): Promise<void> {
    const journal = await this._read<StoredJournalEntry[]>('journal.json') || []
    const entry = journal.find(j => j.intent_hash === intentHash)
    if (entry) {
      entry.status = status
      if (txHash !== null) entry.tx_hash = txHash
      entry.updated_at = Date.now()
      await this._write('journal.json', journal)
    }
  }

  override async listJournal (opts: JournalQueryOpts = {}): Promise<StoredJournal[]> {
    const journal = await this._read<StoredJournalEntry[]>('journal.json') || []
    let result = journal
    if (opts.accountIndex !== undefined) {
      result = result.filter(j => j.account_index === opts.accountIndex)
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
      intentHash: j.intent_hash,
      accountIndex: j.account_index,
      chainId: j.chain_id,
      dedupKey: j.dedup_key,
      status: j.status,
      txHash: j.tx_hash,
      createdAt: j.created_at,
      updatedAt: j.updated_at
    }))
  }

  // --- Rejection History ---

  override async saveRejection (entry: RejectionEntry): Promise<void> {
    const rejections = await this._read<RejectionRow[]>('rejection-history.json') || []
    rejections.push({
      intent_hash: entry.intentHash,
      account_index: entry.accountIndex,
      chain_id: entry.chainId,
      dedup_key: entry.dedupKey,
      reason: entry.reason,
      context_json: entry.context !== null && entry.context !== undefined ? JSON.stringify(entry.context) : null,
      policy_version: entry.policyVersion,
      rejected_at: entry.rejectedAt
    })
    await this._write('rejection-history.json', rejections)
  }

  override async listRejections (opts: RejectionQueryOpts = {}): Promise<RejectionEntry[]> {
    const rejections = await this._read<RejectionRow[]>('rejection-history.json') || []
    let result = rejections
    if (opts.accountIndex !== undefined) {
      result = result.filter(r => r.account_index === opts.accountIndex)
    }
    if (opts.chainId !== undefined) {
      result = result.filter(r => r.chain_id === opts.chainId)
    }
    if (opts.limit) {
      result = result.slice(-opts.limit)
    }
    return result.map(r => ({
      intentHash: r.intent_hash,
      accountIndex: r.account_index,
      chainId: r.chain_id,
      dedupKey: r.dedup_key,
      reason: r.reason,
      context: r.context_json ? JSON.parse(r.context_json) as EvaluationContext : null,
      policyVersion: r.policy_version,
      rejectedAt: r.rejected_at
    }))
  }

  // --- Policy Versions ---

  override async listPolicyVersions (accountIndex: number, chainId: number): Promise<PolicyVersionEntry[]> {
    const versions = await this._read<PolicyVersionRow[]>('policy-versions.json') || []
    return versions
      .filter(v => v.account_index === accountIndex && v.chain_id === chainId)
      .map(v => ({
        accountIndex: v.account_index,
        chainId: v.chain_id,
        version: v.version,
        description: v.description,
        diff: v.diff_json ? JSON.parse(v.diff_json) as PolicyDiff : null,
        changedAt: v.changed_at
      }))
  }
}

function computePolicyDiff (oldPolicies: Policy[], newPolicies: Policy[]): PolicyDiff {
  const oldJSON = oldPolicies.map(p => JSON.stringify(p))
  const newJSON = newPolicies.map(p => JSON.stringify(p))

  const added: Policy[] = []
  const removed: Policy[] = []
  const modified: Array<{ before: Policy; after: Policy }> = []

  const matchedNew = new Set<number>()

  for (let i = 0; i < oldPolicies.length; i++) {
    const exactIdx = newJSON.indexOf(oldJSON[i])
    if (exactIdx !== -1 && !matchedNew.has(exactIdx)) {
      matchedNew.add(exactIdx)
    } else if (i < newPolicies.length && !matchedNew.has(i)) {
      modified.push({ before: oldPolicies[i], after: newPolicies[i] })
      matchedNew.add(i)
    } else {
      removed.push(oldPolicies[i])
    }
  }

  for (let j = 0; j < newPolicies.length; j++) {
    if (!matchedNew.has(j)) {
      added.push(newPolicies[j])
    }
  }

  return { added, removed, modified }
}
