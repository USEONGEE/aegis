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
      await store.savePolicy(s.id, 'ethereum', { policies_json: '{}', signature_json: '{}' })
      await store.savePending(s.id, { requestId: 'r1', type: 'tx', chain: 'ethereum', targetHash: '0x1', createdAt: Date.now() })
      await store.saveCron(s.id, { id: 'c1', sessionId: 'sess', interval: '* * * * *', prompt: 'test' })
      await store.removeSeed(s.id)

      const policies = await store.loadPolicy(s.id, 'ethereum')
      expect(policies).toBeNull()
      const pending = await store.loadPending(s.id, null, null)
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
      const policy = await store.loadPolicy(seedId, 'ethereum')
      expect(policy).toBeNull()
    })

    test('savePolicy + loadPolicy round-trips', async () => {
      await store.savePolicy(seedId, 'ethereum', {
        policies_json: '{"maxAmount":"1000"}',
        signature_json: '{"sig":"abc"}',
        wdk_countersig: 'xyz'
      })
      const loaded = await store.loadPolicy(seedId, 'ethereum')
      expect(loaded!.seed_id).toBe(seedId)
      expect(loaded!.chain).toBe('ethereum')
      expect(loaded!.policies_json).toBe('{"maxAmount":"1000"}')
      expect(loaded!.policy_version).toBe(1)
      expect(loaded!.wdk_countersig).toBe('xyz')
    })

    test('savePolicy increments version on update', async () => {
      await store.savePolicy(seedId, 'ethereum', { policies_json: '{}', signature_json: '{}' })
      await store.savePolicy(seedId, 'ethereum', { policies_json: '{"v":2}', signature_json: '{}' })
      const loaded = await store.loadPolicy(seedId, 'ethereum')
      expect(loaded!.policy_version).toBe(2)
    })

    test('getPolicyVersion returns 0 when no policy', async () => {
      const v = await store.getPolicyVersion(seedId, 'solana')
      expect(v).toBe(0)
    })

    test('getPolicyVersion returns current version', async () => {
      await store.savePolicy(seedId, 'ethereum', { policies_json: '{}', signature_json: '{}' })
      const v = await store.getPolicyVersion(seedId, 'ethereum')
      expect(v).toBe(1)
    })

    test('policies are scoped to seed+chain', async () => {
      const s2 = await store.addSeed('second', 'm2')
      await store.savePolicy(seedId, 'ethereum', { policies_json: '{"s1":"eth"}', signature_json: '{}' })
      await store.savePolicy(s2.id, 'ethereum', { policies_json: '{"s2":"eth"}', signature_json: '{}' })
      await store.savePolicy(seedId, 'solana', { policies_json: '{"s1":"sol"}', signature_json: '{}' })

      const p1 = await store.loadPolicy(seedId, 'ethereum')
      expect(p1!.policies_json).toBe('{"s1":"eth"}')
      const p2 = await store.loadPolicy(s2.id, 'ethereum')
      expect(p2!.policies_json).toBe('{"s2":"eth"}')
      const p3 = await store.loadPolicy(seedId, 'solana')
      expect(p3!.policies_json).toBe('{"s1":"sol"}')
    })
  })

  // --- Pending Requests ---

  describe('pending requests', () => {
    let seedId: string

    beforeEach(async () => {
      const seed = await store.addSeed('test-seed', 'mnemonic')
      seedId = seed.id
    })

    test('savePending + loadPending round-trips', async () => {
      await store.savePending(seedId, {
        requestId: 'req-1',
        type: 'tx',
        chain: 'ethereum',
        targetHash: '0xabc',
        metadata: { amount: '100' },
        createdAt: 1000
      })
      const pending = await store.loadPending(seedId, 'tx', 'ethereum')
      expect(pending).toHaveLength(1)
      expect(pending[0].request_id).toBe('req-1')
      expect(pending[0].target_hash).toBe('0xabc')
      expect(JSON.parse(pending[0].metadata_json!)).toEqual({ amount: '100' })
    })

    test('loadPending filters by seedId, type, chain', async () => {
      await store.savePending(seedId, { requestId: 'r1', type: 'tx', chain: 'ethereum', targetHash: '0x1', createdAt: Date.now() })
      await store.savePending(seedId, { requestId: 'r2', type: 'policy', chain: 'ethereum', targetHash: '0x2', createdAt: Date.now() })
      await store.savePending(seedId, { requestId: 'r3', type: 'tx', chain: 'solana', targetHash: '0x3', createdAt: Date.now() })

      const ethTx = await store.loadPending(seedId, 'tx', 'ethereum')
      expect(ethTx).toHaveLength(1)
      expect(ethTx[0].request_id).toBe('r1')

      const allForSeed = await store.loadPending(seedId, null, null)
      expect(allForSeed).toHaveLength(3)
    })

    test('removePending deletes the request', async () => {
      await store.savePending(seedId, { requestId: 'req-1', type: 'tx', chain: 'ethereum', targetHash: '0x1', createdAt: Date.now() })
      await store.removePending('req-1')
      const pending = await store.loadPending(seedId, null, null)
      expect(pending).toHaveLength(0)
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
        chain: 'ethereum',
        targetHash: '0xabc',
        approver: '0xpub',
        deviceId: 'dev-1',
        action: 'approved',
        timestamp: 1000
      })
      const history = await store.getHistory({})
      expect(history).toHaveLength(1)
      expect(history[0].action).toBe('approved')
      expect(history[0].seed_id).toBe(seedId)
    })

    test('getHistory filters by seedId, type, chain', async () => {
      const s2 = await store.addSeed('second', 'm2')
      await store.appendHistory({ seedId, type: 'tx', chain: 'ethereum', targetHash: '0x1', approver: 'a', deviceId: 'd', action: 'approved' })
      await store.appendHistory({ seedId, type: 'policy', chain: 'ethereum', targetHash: '0x2', approver: 'a', deviceId: 'd', action: 'approved' })
      await store.appendHistory({ seedId: s2.id, type: 'tx', chain: 'solana', targetHash: '0x3', approver: 'a', deviceId: 'd', action: 'rejected' })

      const s1Tx = await store.getHistory({ seedId, type: 'tx' })
      expect(s1Tx).toHaveLength(1)
      expect(s1Tx[0].target_hash).toBe('0x1')
    })

    test('getHistory respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await store.appendHistory({ seedId, type: 'tx', chain: 'eth', targetHash: `0x${i}`, approver: 'a', deviceId: 'd', action: 'approved' })
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
        id: 'cron-1',
        sessionId: 'sess-1',
        interval: '*/5 * * * *',
        prompt: 'check balance',
        chain: 'ethereum'
      })
      const crons = await store.listCrons(seedId)
      expect(crons).toHaveLength(1)
      expect(crons[0].id).toBe('cron-1')
      expect(crons[0].prompt).toBe('check balance')
      expect(crons[0].is_active).toBe(1)
    })

    test('listCrons filters by seedId', async () => {
      const s2 = await store.addSeed('second', 'm2')
      await store.saveCron(seedId, { id: 'c1', sessionId: 's1', interval: '* * * * *', prompt: 'p1' })
      await store.saveCron(s2.id, { id: 'c2', sessionId: 's2', interval: '* * * * *', prompt: 'p2' })

      const crons1 = await store.listCrons(seedId)
      expect(crons1).toHaveLength(1)
      expect(crons1[0].id).toBe('c1')
    })

    test('removeCron deletes cron', async () => {
      await store.saveCron(seedId, { id: 'c1', sessionId: 's1', interval: '* * * * *', prompt: 'p' })
      await store.removeCron('c1')
      const crons = await store.listCrons(seedId)
      expect(crons).toHaveLength(0)
    })

    test('updateCronLastRun updates timestamp', async () => {
      await store.saveCron(seedId, { id: 'c1', sessionId: 's1', interval: '* * * * *', prompt: 'p' })
      await store.updateCronLastRun('c1', 99999)
      const crons = await store.listCrons(seedId)
      expect(crons[0].last_run_at).toBe(99999)
    })

    test('saveCron auto-generates id if not provided', async () => {
      await store.saveCron(seedId, { sessionId: 's1', interval: '* * * * *', prompt: 'p' })
      const crons = await store.listCrons(seedId)
      expect(crons).toHaveLength(1)
      expect(crons[0].id).toBeTruthy()
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
        chain: 'ethereum',
        targetHash: '0xabc',
        status: 'received'
      })
      const entry = await store.getJournalEntry('int-1')
      expect(entry!.intent_id).toBe('int-1')
      expect(entry!.status).toBe('received')
      expect(entry!.seed_id).toBe(seedId)
    })

    test('getJournalEntry returns null for unknown id', async () => {
      const entry = await store.getJournalEntry('nonexistent')
      expect(entry).toBeNull()
    })

    test('updateJournalStatus updates status and txHash', async () => {
      await store.saveJournalEntry({
        intentId: 'int-1',
        seedId,
        chain: 'ethereum',
        targetHash: '0xabc',
        status: 'received'
      })
      await store.updateJournalStatus('int-1', 'broadcasted', '0xtx123')
      const entry = await store.getJournalEntry('int-1')
      expect(entry!.status).toBe('broadcasted')
      expect(entry!.tx_hash).toBe('0xtx123')
    })

    test('updateJournalStatus without txHash preserves existing', async () => {
      await store.saveJournalEntry({
        intentId: 'int-1',
        seedId,
        chain: 'ethereum',
        targetHash: '0xabc',
        status: 'received',
        txHash: '0xold'
      })
      await store.updateJournalStatus('int-1', 'settled', undefined)
      const entry = await store.getJournalEntry('int-1')
      expect(entry!.status).toBe('settled')
      expect(entry!.tx_hash).toBe('0xold')
    })

    test('listJournal returns all entries', async () => {
      await store.saveJournalEntry({ intentId: 'i1', seedId, chain: 'eth', targetHash: '0x1', status: 'received' })
      await store.saveJournalEntry({ intentId: 'i2', seedId, chain: 'eth', targetHash: '0x2', status: 'settled' })
      const all = await store.listJournal({})
      expect(all).toHaveLength(2)
    })

    test('listJournal filters by seedId, status, chain', async () => {
      const s2 = await store.addSeed('second', 'm2')
      await store.saveJournalEntry({ intentId: 'i1', seedId, chain: 'eth', targetHash: '0x1', status: 'received' })
      await store.saveJournalEntry({ intentId: 'i2', seedId, chain: 'eth', targetHash: '0x2', status: 'settled' })
      await store.saveJournalEntry({ intentId: 'i3', seedId: s2.id, chain: 'sol', targetHash: '0x3', status: 'received' })

      const s1Received = await store.listJournal({ seedId, status: 'received' })
      expect(s1Received).toHaveLength(1)
      expect(s1Received[0].intent_id).toBe('i1')
    })

    test('listJournal respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await store.saveJournalEntry({ intentId: `i${i}`, seedId, chain: 'eth', targetHash: `0x${i}`, status: 'received' })
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
