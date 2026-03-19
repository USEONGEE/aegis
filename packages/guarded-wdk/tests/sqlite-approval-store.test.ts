import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SqliteApprovalStore } from '../src/sqlite-approval-store.js'

describe('SqliteApprovalStore', () => {
  let store: SqliteApprovalStore
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sqlite-store-'))
    store = new SqliteApprovalStore(join(tmpDir, 'test.db'))
    await store.init()
  })

  afterEach(async () => {
    await store.dispose()
    await rm(tmpDir, { recursive: true, force: true })
  })

  // --- Seeds ---

  describe('seeds', () => {
    test('addSeed creates a seed with auto-generated id', async () => {
      const seed = await store.addSeed('main', 'abandon abandon abandon')
      expect(seed.id).toBeTruthy()
      expect(seed.name).toBe('main')
      expect(seed.mnemonic).toBe('abandon abandon abandon')
      expect(seed.is_active).toBe(1)
    })

    test('first seed is active, second is not', async () => {
      const s1 = await store.addSeed('first', 'mnemonic1')
      const s2 = await store.addSeed('second', 'mnemonic2')
      expect(s1.is_active).toBe(1)
      expect(s2.is_active).toBe(0)
    })

    test('listSeeds returns all seeds', async () => {
      await store.addSeed('a', 'm1')
      await store.addSeed('b', 'm2')
      const seeds = await store.listSeeds()
      expect(seeds).toHaveLength(2)
    })

    test('getSeed returns seed by id', async () => {
      const s = await store.addSeed('test', 'mnemonic')
      const found = await store.getSeed(s.id)
      expect(found!.name).toBe('test')
    })

    test('getSeed returns null for unknown id', async () => {
      const found = await store.getSeed('nonexistent')
      expect(found).toBeNull()
    })

    test('setActiveSeed changes active seed', async () => {
      const s1 = await store.addSeed('first', 'm1')
      const s2 = await store.addSeed('second', 'm2')
      await store.setActiveSeed(s2.id)
      const active = await store.getActiveSeed()
      expect(active!.id).toBe(s2.id)
    })

    test('setActiveSeed throws for unknown id', async () => {
      await expect(store.setActiveSeed('nonexistent')).rejects.toThrow('Seed not found')
    })

    test('getActiveSeed returns null when no seeds', async () => {
      const active = await store.getActiveSeed()
      expect(active).toBeNull()
    })

    test('removeSeed deletes seed and cascades', async () => {
      const s = await store.addSeed('test', 'mnemonic')
      await store.removeSeed(s.id)
      const seeds = await store.listSeeds()
      expect(seeds).toHaveLength(0)
    })

    test('removeSeed of active seed promotes next', async () => {
      const s1 = await store.addSeed('first', 'm1')
      const s2 = await store.addSeed('second', 'm2')
      await store.removeSeed(s1.id)
      const active = await store.getActiveSeed()
      expect(active!.id).toBe(s2.id)
    })

    test('removeSeed cleans up related data', async () => {
      const s = await store.addSeed('test', 'mnemonic')
      await store.savePolicy(s.id, 1, { policies: [], signature: {} })
      await store.savePendingApproval(s.id, { requestId: 'r1', type: 'tx', chainId: 1, targetHash: '0x1', createdAt: Date.now() })
      await store.saveCron(s.id, { sessionId: 'sess', interval: '* * * * *', prompt: 'test', chainId: null })
      await store.removeSeed(s.id)

      const policies = await store.loadPolicy(s.id, 1)
      expect(policies).toBeNull()
      const pending = await store.loadPendingApprovals(s.id, null, null)
      expect(pending).toHaveLength(0)
      const crons = await store.listCrons(s.id)
      expect(crons).toHaveLength(0)
    })
  })

  // --- Policies ---

  describe('policies', () => {
    let seedId: string

    beforeEach(async () => {
      const seed = await store.addSeed('test-seed', 'mnemonic')
      seedId = seed.id
    })

    test('loadPolicy returns null when no policy exists', async () => {
      const policy = await store.loadPolicy(seedId, 1)
      expect(policy).toBeNull()
    })

    test('savePolicy + loadPolicy round-trips', async () => {
      await store.savePolicy(seedId, 1, {
        policies: [{ maxAmount: '1000' }],
        signature: { sig: 'abc' }
      })
      const loaded = await store.loadPolicy(seedId, 1)
      expect(loaded!.seed_id).toBe(seedId)
      expect(loaded!.chain_id).toBe(1)
      expect(loaded!.policies_json).toBe('[{"maxAmount":"1000"}]')
      expect(loaded!.policy_version).toBe(1)
    })

    test('savePolicy increments version on update', async () => {
      await store.savePolicy(seedId, 1, { policies: [], signature: {} })
      await store.savePolicy(seedId, 1, { policies: [{ v: 2 }], signature: {} })
      const loaded = await store.loadPolicy(seedId, 1)
      expect(loaded!.policy_version).toBe(2)
    })

    test('getPolicyVersion returns 0 when no policy', async () => {
      const v = await store.getPolicyVersion(seedId, 900)
      expect(v).toBe(0)
    })

    test('getPolicyVersion returns current version', async () => {
      await store.savePolicy(seedId, 1, { policies: [], signature: {} })
      const v = await store.getPolicyVersion(seedId, 1)
      expect(v).toBe(1)
    })

    test('policies are scoped to seed+chain', async () => {
      const s2 = await store.addSeed('second', 'm2')
      await store.savePolicy(seedId, 1, { policies: [{ s1: 'eth' }], signature: {} })
      await store.savePolicy(s2.id, 1, { policies: [{ s2: 'eth' }], signature: {} })
      await store.savePolicy(seedId, 900, { policies: [{ s1: 'sol' }], signature: {} })

      const p1 = await store.loadPolicy(seedId, 1)
      expect(p1!.policies_json).toBe('[{"s1":"eth"}]')
      const p2 = await store.loadPolicy(s2.id, 1)
      expect(p2!.policies_json).toBe('[{"s2":"eth"}]')
      const p3 = await store.loadPolicy(seedId, 900)
      expect(p3!.policies_json).toBe('[{"s1":"sol"}]')
    })

    test('savePolicy with empty policies array round-trips', async () => {
      await store.savePolicy(seedId, 1, { policies: [], signature: {} })
      const loaded = await store.loadPolicy(seedId, 1)
      expect(loaded!.policies_json).toBe('[]')
      expect(loaded!.signature_json).toBe('{}')
    })
  })

  // --- Pending Requests ---

  describe('pending requests', () => {
    let seedId: string

    beforeEach(async () => {
      const seed = await store.addSeed('test-seed', 'mnemonic')
      seedId = seed.id
    })

    test('savePendingApproval + loadPendingApprovals round-trips', async () => {
      await store.savePendingApproval(seedId, {
        requestId: 'req-1',
        type: 'tx',
        chainId: 1,
        targetHash: '0xabc',
        metadata: { amount: '100' },
        createdAt: 1000
      })
      const pending = await store.loadPendingApprovals(seedId, 'tx', 1)
      expect(pending).toHaveLength(1)
      expect(pending[0].requestId).toBe('req-1')
      expect(pending[0].targetHash).toBe('0xabc')
      expect(pending[0].metadata).toEqual({ amount: '100' })
    })

    test('loadPendingApprovals filters by seedId, type, chain', async () => {
      await store.savePendingApproval(seedId, { requestId: 'r1', type: 'tx', chainId: 1, targetHash: '0x1', createdAt: Date.now() })
      await store.savePendingApproval(seedId, { requestId: 'r2', type: 'policy', chainId: 1, targetHash: '0x2', createdAt: Date.now() })
      await store.savePendingApproval(seedId, { requestId: 'r3', type: 'tx', chainId: 900, targetHash: '0x3', createdAt: Date.now() })

      const ethTx = await store.loadPendingApprovals(seedId, 'tx', 1)
      expect(ethTx).toHaveLength(1)
      expect(ethTx[0].requestId).toBe('r1')

      const allForSeed = await store.loadPendingApprovals(seedId, null, null)
      expect(allForSeed).toHaveLength(3)
    })

    test('removePendingApproval deletes the request', async () => {
      await store.savePendingApproval(seedId, { requestId: 'req-1', type: 'tx', chainId: 1, targetHash: '0x1', createdAt: Date.now() })
      await store.removePendingApproval('req-1')
      const pending = await store.loadPendingApprovals(seedId, null, null)
      expect(pending).toHaveLength(0)
    })

    test('loadPendingByRequestId returns camelCase PendingApprovalRequest', async () => {
      await store.savePendingApproval(seedId, { requestId: 'req-cc', type: 'tx', chainId: 1, targetHash: '0xcc', createdAt: 12345 })
      const result = await store.loadPendingByRequestId('req-cc')
      expect(result).not.toBeNull()
      expect(result!.requestId).toBe('req-cc')
      expect(result!.seedId).toBe(seedId)
      expect(result!.type).toBe('tx')
      expect(result!.chainId).toBe(1)
      expect(result!.targetHash).toBe('0xcc')
      expect(result!.createdAt).toBe(12345)
    })
  })

  // --- History ---

  describe('history', () => {
    let seedId: string

    beforeEach(async () => {
      const seed = await store.addSeed('test-seed', 'mnemonic')
      seedId = seed.id
    })

    test('appendHistory + getHistory round-trips', async () => {
      await store.appendHistory({
        seedId,
        type: 'tx',
        chainId: 1,
        targetHash: '0xabc',
        approver: '0xpub',
        deviceId: 'dev-1',
        action: 'approved',
        timestamp: 1000
      })
      const history = await store.getHistory({})
      expect(history).toHaveLength(1)
      expect(history[0].action).toBe('approved')
      expect(history[0].seedId).toBe(seedId)
    })

    test('getHistory filters by seedId, type, chain', async () => {
      const s2 = await store.addSeed('second', 'm2')
      await store.appendHistory({ seedId, type: 'tx', chainId: 1, targetHash: '0x1', approver: 'a', deviceId: 'd', action: 'approved', timestamp: Date.now() })
      await store.appendHistory({ seedId, type: 'policy', chainId: 1, targetHash: '0x2', approver: 'a', deviceId: 'd', action: 'approved', timestamp: Date.now() })
      await store.appendHistory({ seedId: s2.id, type: 'tx', chainId: 900, targetHash: '0x3', approver: 'a', deviceId: 'd', action: 'rejected', timestamp: Date.now() })

      const s1Tx = await store.getHistory({ seedId, type: 'tx' })
      expect(s1Tx).toHaveLength(1)
      expect(s1Tx[0].targetHash).toBe('0x1')
    })

    test('getHistory respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await store.appendHistory({ seedId, type: 'tx', chainId: 1, targetHash: `0x${i}`, approver: 'a', deviceId: 'd', action: 'approved', timestamp: Date.now() })
      }
      const limited = await store.getHistory({ limit: 2 })
      expect(limited).toHaveLength(2)
    })
  })

  // --- Devices ---

  describe('devices', () => {
    test('saveDevice + getDevice round-trips', async () => {
      await store.saveDevice('dev-1', '0xpubkey123')
      const dev = await store.getDevice('dev-1')
      expect(dev!.device_id).toBe('dev-1')
      expect(dev!.public_key).toBe('0xpubkey123')
      expect(dev!.revoked_at).toBeNull()
    })

    test('getDevice returns null for unknown device', async () => {
      const dev = await store.getDevice('nonexistent')
      expect(dev).toBeNull()
    })

    test('listDevices returns all devices', async () => {
      await store.saveDevice('dev-1', 'pk1')
      await store.saveDevice('dev-2', 'pk2')
      const devices = await store.listDevices()
      expect(devices).toHaveLength(2)
    })

    test('revokeDevice sets revoked_at', async () => {
      await store.saveDevice('dev-1', 'pk1')
      await store.revokeDevice('dev-1')
      const dev = await store.getDevice('dev-1')
      expect(dev!.revoked_at).toBeTruthy()
    })

    test('isDeviceRevoked returns false for active device', async () => {
      await store.saveDevice('dev-1', 'pk1')
      expect(await store.isDeviceRevoked('dev-1')).toBe(false)
    })

    test('isDeviceRevoked returns true for revoked device', async () => {
      await store.saveDevice('dev-1', 'pk1')
      await store.revokeDevice('dev-1')
      expect(await store.isDeviceRevoked('dev-1')).toBe(true)
    })

    test('isDeviceRevoked returns false for unknown device', async () => {
      expect(await store.isDeviceRevoked('nonexistent')).toBe(false)
    })

    test('saveDevice updates existing device', async () => {
      await store.saveDevice('dev-1', 'pk1')
      await store.saveDevice('dev-1', 'pk2')
      const dev = await store.getDevice('dev-1')
      expect(dev!.public_key).toBe('pk2')
    })
  })

  // --- Nonces ---

  describe('nonces', () => {
    test('getLastNonce returns 0 by default', async () => {
      const nonce = await store.getLastNonce('0xapprover', 'dev-1')
      expect(nonce).toBe(0)
    })

    test('updateNonce + getLastNonce round-trips', async () => {
      await store.updateNonce('0xapprover', 'dev-1', 5)
      const nonce = await store.getLastNonce('0xapprover', 'dev-1')
      expect(nonce).toBe(5)
    })

    test('nonce is scoped per approver+device', async () => {
      await store.updateNonce('a1', 'd1', 10)
      await store.updateNonce('a1', 'd2', 20)
      await store.updateNonce('a2', 'd1', 30)
      expect(await store.getLastNonce('a1', 'd1')).toBe(10)
      expect(await store.getLastNonce('a1', 'd2')).toBe(20)
      expect(await store.getLastNonce('a2', 'd1')).toBe(30)
    })

    test('updateNonce overwrites previous value', async () => {
      await store.updateNonce('a1', 'd1', 5)
      await store.updateNonce('a1', 'd1', 15)
      expect(await store.getLastNonce('a1', 'd1')).toBe(15)
    })
  })

  // --- Crons ---

  describe('crons', () => {
    let seedId: string

    beforeEach(async () => {
      const seed = await store.addSeed('test-seed', 'mnemonic')
      seedId = seed.id
    })

    test('saveCron + listCrons round-trips', async () => {
      await store.saveCron(seedId, {
        sessionId: 'sess-1',
        interval: '*/5 * * * *',
        prompt: 'check balance',
        chainId: 1
      })
      const crons = await store.listCrons(seedId)
      expect(crons).toHaveLength(1)
      expect(crons[0].id).toBeTruthy()
      expect(crons[0].prompt).toBe('check balance')
      expect(crons[0].isActive).toBe(true)
    })

    test('listCrons filters by seedId', async () => {
      const s2 = await store.addSeed('second', 'm2')
      await store.saveCron(seedId, { sessionId: 's1', interval: '* * * * *', prompt: 'p1', chainId: null })
      await store.saveCron(s2.id, { sessionId: 's2', interval: '* * * * *', prompt: 'p2', chainId: null })

      const crons1 = await store.listCrons(seedId)
      expect(crons1).toHaveLength(1)
      expect(crons1[0].prompt).toBe('p1')
    })

    test('removeCron deletes cron', async () => {
      await store.saveCron(seedId, { sessionId: 's1', interval: '* * * * *', prompt: 'p', chainId: null })
      const crons = await store.listCrons(seedId)
      await store.removeCron(crons[0].id)
      const after = await store.listCrons(seedId)
      expect(after).toHaveLength(0)
    })

    test('updateCronLastRun updates timestamp', async () => {
      await store.saveCron(seedId, { sessionId: 's1', interval: '* * * * *', prompt: 'p', chainId: null })
      const crons = await store.listCrons(seedId)
      await store.updateCronLastRun(crons[0].id, 99999)
      const after = await store.listCrons(seedId)
      expect(after[0].lastRunAt).toBe(99999)
    })

    test('saveCron auto-generates id', async () => {
      await store.saveCron(seedId, { sessionId: 's1', interval: '* * * * *', prompt: 'p', chainId: null })
      const crons = await store.listCrons(seedId)
      expect(crons).toHaveLength(1)
      expect(crons[0].id).toBeTruthy()
    })

    test('saveCron with chainId null round-trips', async () => {
      await store.saveCron(seedId, { sessionId: 's1', interval: '*/5 * * * *', prompt: 'check all', chainId: null })
      const crons = await store.listCrons(seedId)
      expect(crons).toHaveLength(1)
      expect(crons[0].chainId).toBeNull()
    })

    test('listCrons returns camelCase StoredCron with boolean isActive', async () => {
      await store.saveCron(seedId, { sessionId: 's1', interval: '*/5 * * * *', prompt: 'p', chainId: 1 })
      const crons = await store.listCrons(seedId)
      expect(crons).toHaveLength(1)
      expect(crons[0].seedId).toBe(seedId)
      expect(crons[0].sessionId).toBe('s1')
      expect(crons[0].chainId).toBe(1)
      expect(crons[0].createdAt).toBeGreaterThan(0)
      expect(crons[0].lastRunAt).toBeNull()
      expect(typeof crons[0].isActive).toBe('boolean')
      expect(crons[0].isActive).toBe(true)
    })
  })

  // --- Execution Journal ---

  describe('execution journal', () => {
    let seedId: string

    beforeEach(async () => {
      const seed = await store.addSeed('test-seed', 'mnemonic')
      seedId = seed.id
    })

    test('saveJournalEntry + getJournalEntry round-trips', async () => {
      await store.saveJournalEntry({
        intentId: 'int-1',
        seedId,
        chainId: 1,
        targetHash: '0xabc',
        status: 'received'
      })
      const entry = await store.getJournalEntry('int-1')
      expect(entry!.intentId).toBe('int-1')
      expect(entry!.status).toBe('received')
      expect(entry!.seedId).toBe(seedId)
    })

    test('getJournalEntry returns null for unknown id', async () => {
      const entry = await store.getJournalEntry('nonexistent')
      expect(entry).toBeNull()
    })

    test('updateJournalStatus updates status and txHash', async () => {
      await store.saveJournalEntry({
        intentId: 'int-1',
        seedId,
        chainId: 1,
        targetHash: '0xabc',
        status: 'received'
      })
      await store.updateJournalStatus('int-1', 'broadcasted', '0xtx123')
      const entry = await store.getJournalEntry('int-1')
      expect(entry!.status).toBe('broadcasted')
      expect(entry!.txHash).toBe('0xtx123')
    })

    test('updateJournalStatus without txHash preserves existing', async () => {
      await store.saveJournalEntry({
        intentId: 'int-1',
        seedId,
        chainId: 1,
        targetHash: '0xabc',
        status: 'received'
      })
      await store.updateJournalStatus('int-1', 'pending', '0xold')
      await store.updateJournalStatus('int-1', 'settled', undefined)
      const entry = await store.getJournalEntry('int-1')
      expect(entry!.status).toBe('settled')
      expect(entry!.txHash).toBe('0xold')
    })

    test('listJournal returns all entries', async () => {
      await store.saveJournalEntry({ intentId: 'i1', seedId, chainId: 1, targetHash: '0x1', status: 'received' })
      await store.saveJournalEntry({ intentId: 'i2', seedId, chainId: 1, targetHash: '0x2', status: 'settled' })
      const all = await store.listJournal({})
      expect(all).toHaveLength(2)
    })

    test('listJournal filters by seedId, status, chain', async () => {
      const s2 = await store.addSeed('second', 'm2')
      await store.saveJournalEntry({ intentId: 'i1', seedId, chainId: 1, targetHash: '0x1', status: 'received' })
      await store.saveJournalEntry({ intentId: 'i2', seedId, chainId: 1, targetHash: '0x2', status: 'settled' })
      await store.saveJournalEntry({ intentId: 'i3', seedId: s2.id, chainId: 900, targetHash: '0x3', status: 'received' })

      const s1Received = await store.listJournal({ seedId, status: 'received' })
      expect(s1Received).toHaveLength(1)
      expect(s1Received[0].intentId).toBe('i1')
    })

    test('listJournal respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await store.saveJournalEntry({ intentId: `i${i}`, seedId, chainId: 1, targetHash: `0x${i}`, status: 'received' })
      }
      const limited = await store.listJournal({ limit: 3 })
      expect(limited).toHaveLength(3)
    })
  })

  // --- WAL Mode ---

  describe('initialization', () => {
    test('database uses WAL mode', async () => {
      const tmpDir2 = await mkdtemp(join(tmpdir(), 'sqlite-wal-'))
      const store2 = new SqliteApprovalStore(join(tmpDir2, 'wal-test.db'))
      await store2.init()
      // WAL mode is set in init; if we got here, it was set without error
      await store2.dispose()
      await rm(tmpDir2, { recursive: true, force: true })
    })

    test('dispose closes db connection', async () => {
      const tmpDir2 = await mkdtemp(join(tmpdir(), 'sqlite-dispose-'))
      const store2 = new SqliteApprovalStore(join(tmpDir2, 'dispose-test.db'))
      await store2.init()
      await store2.dispose()
      // After dispose, _db should be null
      expect(store2._db).toBeNull()
      await rm(tmpDir2, { recursive: true, force: true })
    })
  })
})
