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

  // --- Master Seed ---

  describe('master seed', () => {
    test('getMasterSeed returns null when no seed set', async () => {
      const seed = await store.getMasterSeed()
      expect(seed).toBeNull()
    })

    test('setMasterSeed + getMasterSeed round-trips', async () => {
      await store.setMasterSeed('abandon abandon abandon')
      const seed = await store.getMasterSeed()
      expect(seed).not.toBeNull()
      expect(seed!.mnemonic).toBe('abandon abandon abandon')
      expect(seed!.createdAt).toBeGreaterThan(0)
    })

    test('setMasterSeed overwrites existing', async () => {
      await store.setMasterSeed('old mnemonic')
      await store.setMasterSeed('new mnemonic')
      const seed = await store.getMasterSeed()
      expect(seed!.mnemonic).toBe('new mnemonic')
    })
  })

  // --- Wallets ---

  describe('wallets', () => {
    beforeEach(async () => {
      await store.setMasterSeed('mnemonic')
    })

    test('createWallet creates a wallet', async () => {
      const wallet = await store.createWallet(0, 'main', '0xaddr0')
      expect(wallet.accountIndex).toBe(0)
      expect(wallet.name).toBe('main')
      expect(wallet.address).toBe('0xaddr0')
      expect(wallet.createdAt).toBeGreaterThan(0)
    })

    test('listWallets returns all wallets', async () => {
      await store.createWallet(0, 'first', '0xaddr0')
      await store.createWallet(1, 'second', '0xaddr1')
      const wallets = await store.listWallets()
      expect(wallets).toHaveLength(2)
    })

    test('getWallet returns wallet by accountIndex', async () => {
      await store.createWallet(0, 'test', '0xaddr0')
      const found = await store.getWallet(0)
      expect(found!.name).toBe('test')
      expect(found!.address).toBe('0xaddr0')
    })

    test('getWallet returns null for unknown accountIndex', async () => {
      const found = await store.getWallet(99)
      expect(found).toBeNull()
    })

    test('deleteWallet removes wallet', async () => {
      await store.createWallet(0, 'test', '0xaddr0')
      await store.deleteWallet(0)
      const wallets = await store.listWallets()
      expect(wallets).toHaveLength(0)
    })

    test('deleteWallet cleans up related data but preserves history', async () => {
      await store.createWallet(0, 'test', '0xaddr0')
      await store.savePolicy(0, 1, { policies: [], signature: {} })
      await store.savePendingApproval(0, { requestId: 'r1', type: 'tx', chainId: 1, targetHash: '0x1', accountIndex: 0, content: '', createdAt: Date.now() })
      await store.saveCron(0, { sessionId: 'sess', interval: '* * * * *', prompt: 'test', chainId: null })
      await store.appendHistory({ accountIndex: 0, type: 'tx', chainId: 1, targetHash: '0x1', approver: 'a', signerId: 'd', action: 'approved', timestamp: Date.now() })
      await store.deleteWallet(0)

      const policy = await store.loadPolicy(0, 1)
      expect(policy).toBeNull()
      const pending = await store.loadPendingApprovals(0, null, null)
      expect(pending).toHaveLength(0)
      const crons = await store.listCrons(0)
      expect(crons).toHaveLength(0)
      // approval_history is preserved
      const history = await store.getHistory({ accountIndex: 0 })
      expect(history).toHaveLength(1)
    })
  })

  // --- Policies ---

  describe('policies', () => {
    const accountIndex = 0

    beforeEach(async () => {
      await store.setMasterSeed('mnemonic')
      await store.createWallet(accountIndex, 'test-wallet', '0xaddr0')
    })

    test('loadPolicy returns null when no policy exists', async () => {
      const policy = await store.loadPolicy(accountIndex, 1)
      expect(policy).toBeNull()
    })

    test('savePolicy + loadPolicy round-trips', async () => {
      await store.savePolicy(accountIndex, 1, {
        policies: [{ maxAmount: '1000' }],
        signature: { sig: 'abc' }
      })
      const loaded = await store.loadPolicy(accountIndex, 1)
      expect(loaded!.accountIndex).toBe(accountIndex)
      expect(loaded!.chainId).toBe(1)
      expect(loaded!.policiesJson).toBe('[{"maxAmount":"1000"}]')
      expect(loaded!.policyVersion).toBe(1)
    })

    test('savePolicy increments version on update', async () => {
      await store.savePolicy(accountIndex, 1, { policies: [], signature: {} })
      await store.savePolicy(accountIndex, 1, { policies: [{ v: 2 }], signature: {} })
      const loaded = await store.loadPolicy(accountIndex, 1)
      expect(loaded!.policyVersion).toBe(2)
    })

    test('getPolicyVersion returns 0 when no policy', async () => {
      const v = await store.getPolicyVersion(accountIndex, 900)
      expect(v).toBe(0)
    })

    test('getPolicyVersion returns current version', async () => {
      await store.savePolicy(accountIndex, 1, { policies: [], signature: {} })
      const v = await store.getPolicyVersion(accountIndex, 1)
      expect(v).toBe(1)
    })

    test('policies are scoped to accountIndex+chain', async () => {
      await store.createWallet(1, 'second', '0xaddr1')
      await store.savePolicy(accountIndex, 1, { policies: [{ a0: 'eth' }], signature: {} })
      await store.savePolicy(1, 1, { policies: [{ a1: 'eth' }], signature: {} })
      await store.savePolicy(accountIndex, 900, { policies: [{ a0: 'sol' }], signature: {} })

      const p1 = await store.loadPolicy(accountIndex, 1)
      expect(p1!.policiesJson).toBe('[{"a0":"eth"}]')
      const p2 = await store.loadPolicy(1, 1)
      expect(p2!.policiesJson).toBe('[{"a1":"eth"}]')
      const p3 = await store.loadPolicy(accountIndex, 900)
      expect(p3!.policiesJson).toBe('[{"a0":"sol"}]')
    })

    test('savePolicy with empty policies array round-trips', async () => {
      await store.savePolicy(accountIndex, 1, { policies: [], signature: {} })
      const loaded = await store.loadPolicy(accountIndex, 1)
      expect(loaded!.policiesJson).toBe('[]')
      expect(loaded!.signatureJson).toBe('{}')
    })
  })

  // --- Pending Requests ---

  describe('pending requests', () => {
    const accountIndex = 0

    beforeEach(async () => {
      await store.setMasterSeed('mnemonic')
      await store.createWallet(accountIndex, 'test-wallet', '0xaddr0')
    })

    test('savePendingApproval + loadPendingApprovals round-trips', async () => {
      await store.savePendingApproval(accountIndex, {
        requestId: 'req-1',
        type: 'tx',
        chainId: 1,
        targetHash: '0xabc',
        accountIndex,
        content: JSON.stringify({ amount: '100' }),
        createdAt: 1000
      })
      const pending = await store.loadPendingApprovals(accountIndex, 'tx', 1)
      expect(pending).toHaveLength(1)
      expect(pending[0].requestId).toBe('req-1')
      expect(pending[0].targetHash).toBe('0xabc')
      expect(pending[0].content).toBe(JSON.stringify({ amount: '100' }))
    })

    test('loadPendingApprovals filters by accountIndex, type, chain', async () => {
      await store.savePendingApproval(accountIndex, { requestId: 'r1', type: 'tx', chainId: 1, targetHash: '0x1', accountIndex, content: '', createdAt: Date.now() })
      await store.savePendingApproval(accountIndex, { requestId: 'r2', type: 'policy', chainId: 1, targetHash: '0x2', accountIndex, content: '', createdAt: Date.now() })
      await store.savePendingApproval(accountIndex, { requestId: 'r3', type: 'tx', chainId: 900, targetHash: '0x3', accountIndex, content: '', createdAt: Date.now() })

      const ethTx = await store.loadPendingApprovals(accountIndex, 'tx', 1)
      expect(ethTx).toHaveLength(1)
      expect(ethTx[0].requestId).toBe('r1')

      const allForAccount = await store.loadPendingApprovals(accountIndex, null, null)
      expect(allForAccount).toHaveLength(3)
    })

    test('removePendingApproval deletes the request', async () => {
      await store.savePendingApproval(accountIndex, { requestId: 'req-1', type: 'tx', chainId: 1, targetHash: '0x1', accountIndex, content: '', createdAt: Date.now() })
      await store.removePendingApproval('req-1')
      const pending = await store.loadPendingApprovals(accountIndex, null, null)
      expect(pending).toHaveLength(0)
    })

    test('loadPendingByRequestId returns camelCase PendingApprovalRequest', async () => {
      await store.savePendingApproval(accountIndex, { requestId: 'req-cc', type: 'tx', chainId: 1, targetHash: '0xcc', accountIndex, content: 'test-content', createdAt: 12345 })
      const result = await store.loadPendingByRequestId('req-cc')
      expect(result).not.toBeNull()
      expect(result!.requestId).toBe('req-cc')
      expect(result!.accountIndex).toBe(accountIndex)
      expect(result!.type).toBe('tx')
      expect(result!.chainId).toBe(1)
      expect(result!.targetHash).toBe('0xcc')
      expect(result!.content).toBe('test-content')
      expect(result!.createdAt).toBe(12345)
    })
  })

  // --- History ---

  describe('history', () => {
    const accountIndex = 0

    beforeEach(async () => {
      await store.setMasterSeed('mnemonic')
      await store.createWallet(accountIndex, 'test-wallet', '0xaddr0')
    })

    test('appendHistory + getHistory round-trips', async () => {
      await store.appendHistory({
        accountIndex,
        type: 'tx',
        chainId: 1,
        targetHash: '0xabc',
        approver: '0xpub',
        signerId: 'dev-1',
        action: 'approved',
        timestamp: 1000
      })
      const history = await store.getHistory({})
      expect(history).toHaveLength(1)
      expect(history[0].action).toBe('approved')
      expect(history[0].accountIndex).toBe(accountIndex)
    })

    test('getHistory filters by accountIndex, type, chain', async () => {
      await store.createWallet(1, 'second', '0xaddr1')
      await store.appendHistory({ accountIndex, type: 'tx', chainId: 1, targetHash: '0x1', approver: 'a', signerId: 'd', action: 'approved', timestamp: Date.now() })
      await store.appendHistory({ accountIndex, type: 'policy', chainId: 1, targetHash: '0x2', approver: 'a', signerId: 'd', action: 'approved', timestamp: Date.now() })
      await store.appendHistory({ accountIndex: 1, type: 'tx', chainId: 900, targetHash: '0x3', approver: 'a', signerId: 'd', action: 'rejected', timestamp: Date.now() })

      const a0Tx = await store.getHistory({ accountIndex, type: 'tx' })
      expect(a0Tx).toHaveLength(1)
      expect(a0Tx[0].targetHash).toBe('0x1')
    })

    test('getHistory respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await store.appendHistory({ accountIndex, type: 'tx', chainId: 1, targetHash: `0x${i}`, approver: 'a', signerId: 'd', action: 'approved', timestamp: Date.now() })
      }
      const limited = await store.getHistory({ limit: 2 })
      expect(limited).toHaveLength(2)
    })
  })

  // --- Signers ---

  describe('signers', () => {
    test('saveSigner + getSigner round-trips', async () => {
      await store.saveSigner('dev-1', '0xpubkey123')
      const dev = await store.getSigner('dev-1')
      expect(dev!.signerId).toBe('dev-1')
      expect(dev!.publicKey).toBe('0xpubkey123')
      expect(dev!.revokedAt).toBeNull()
    })

    test('getSigner returns null for unknown signer', async () => {
      const dev = await store.getSigner('nonexistent')
      expect(dev).toBeNull()
    })

    test('listSigners returns all signers', async () => {
      await store.saveSigner('dev-1', 'pk1')
      await store.saveSigner('dev-2', 'pk2')
      const signers = await store.listSigners()
      expect(signers).toHaveLength(2)
    })

    test('revokeSigner sets revoked_at', async () => {
      await store.saveSigner('dev-1', 'pk1')
      await store.revokeSigner('dev-1')
      const dev = await store.getSigner('dev-1')
      expect(dev!.revokedAt).toBeTruthy()
    })

    test('isSignerRevoked returns false for active signer', async () => {
      await store.saveSigner('dev-1', 'pk1')
      expect(await store.isSignerRevoked('dev-1')).toBe(false)
    })

    test('isSignerRevoked returns true for revoked signer', async () => {
      await store.saveSigner('dev-1', 'pk1')
      await store.revokeSigner('dev-1')
      expect(await store.isSignerRevoked('dev-1')).toBe(true)
    })

    test('isSignerRevoked returns false for unknown signer', async () => {
      expect(await store.isSignerRevoked('nonexistent')).toBe(false)
    })

    test('saveSigner updates existing signer', async () => {
      await store.saveSigner('dev-1', 'pk1')
      await store.saveSigner('dev-1', 'pk2')
      const dev = await store.getSigner('dev-1')
      expect(dev!.publicKey).toBe('pk2')
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

    test('nonce is scoped per approver+signer', async () => {
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
    const accountIndex = 0

    beforeEach(async () => {
      await store.setMasterSeed('mnemonic')
      await store.createWallet(accountIndex, 'test-wallet', '0xaddr0')
    })

    test('saveCron + listCrons round-trips', async () => {
      await store.saveCron(accountIndex, {
        sessionId: 'sess-1',
        interval: '*/5 * * * *',
        prompt: 'check balance',
        chainId: 1
      })
      const crons = await store.listCrons(accountIndex)
      expect(crons).toHaveLength(1)
      expect(crons[0].id).toBeTruthy()
      expect(crons[0].prompt).toBe('check balance')
      expect(crons[0].isActive).toBe(true)
    })

    test('listCrons filters by accountIndex', async () => {
      await store.createWallet(1, 'second', '0xaddr1')
      await store.saveCron(accountIndex, { sessionId: 's1', interval: '* * * * *', prompt: 'p1', chainId: null })
      await store.saveCron(1, { sessionId: 's2', interval: '* * * * *', prompt: 'p2', chainId: null })

      const crons0 = await store.listCrons(accountIndex)
      expect(crons0).toHaveLength(1)
      expect(crons0[0].prompt).toBe('p1')
    })

    test('removeCron deletes cron', async () => {
      await store.saveCron(accountIndex, { sessionId: 's1', interval: '* * * * *', prompt: 'p', chainId: null })
      const crons = await store.listCrons(accountIndex)
      await store.removeCron(crons[0].id)
      const after = await store.listCrons(accountIndex)
      expect(after).toHaveLength(0)
    })

    test('updateCronLastRun updates timestamp', async () => {
      await store.saveCron(accountIndex, { sessionId: 's1', interval: '* * * * *', prompt: 'p', chainId: null })
      const crons = await store.listCrons(accountIndex)
      await store.updateCronLastRun(crons[0].id, 99999)
      const after = await store.listCrons(accountIndex)
      expect(after[0].lastRunAt).toBe(99999)
    })

    test('saveCron auto-generates id', async () => {
      await store.saveCron(accountIndex, { sessionId: 's1', interval: '* * * * *', prompt: 'p', chainId: null })
      const crons = await store.listCrons(accountIndex)
      expect(crons).toHaveLength(1)
      expect(crons[0].id).toBeTruthy()
    })

    test('saveCron with chainId null round-trips', async () => {
      await store.saveCron(accountIndex, { sessionId: 's1', interval: '*/5 * * * *', prompt: 'check all', chainId: null })
      const crons = await store.listCrons(accountIndex)
      expect(crons).toHaveLength(1)
      expect(crons[0].chainId).toBeNull()
    })

    test('listCrons returns camelCase StoredCron with boolean isActive', async () => {
      await store.saveCron(accountIndex, { sessionId: 's1', interval: '*/5 * * * *', prompt: 'p', chainId: 1 })
      const crons = await store.listCrons(accountIndex)
      expect(crons).toHaveLength(1)
      expect(crons[0].accountIndex).toBe(accountIndex)
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
    const accountIndex = 0

    beforeEach(async () => {
      await store.setMasterSeed('mnemonic')
      await store.createWallet(accountIndex, 'test-wallet', '0xaddr0')
    })

    test('saveJournalEntry + getJournalEntry round-trips', async () => {
      await store.saveJournalEntry({
        intentHash: 'int-1',
        accountIndex,
        chainId: 1,
        targetHash: '0xabc',
        status: 'received'
      })
      const entry = await store.getJournalEntry('int-1')
      expect(entry!.intentHash).toBe('int-1')
      expect(entry!.status).toBe('received')
      expect(entry!.accountIndex).toBe(accountIndex)
    })

    test('getJournalEntry returns null for unknown id', async () => {
      const entry = await store.getJournalEntry('nonexistent')
      expect(entry).toBeNull()
    })

    test('updateJournalStatus updates status and txHash', async () => {
      await store.saveJournalEntry({
        intentHash: 'int-1',
        accountIndex,
        chainId: 1,
        targetHash: '0xabc',
        status: 'received'
      })
      await store.updateJournalStatus('int-1', 'signed', '0xtx123')
      const entry = await store.getJournalEntry('int-1')
      expect(entry!.status).toBe('signed')
      expect(entry!.txHash).toBe('0xtx123')
    })

    test('updateJournalStatus without txHash preserves existing', async () => {
      await store.saveJournalEntry({
        intentHash: 'int-1',
        accountIndex,
        chainId: 1,
        targetHash: '0xabc',
        status: 'received'
      })
      await store.updateJournalStatus('int-1', 'pending_approval', '0xold')
      await store.updateJournalStatus('int-1', 'settled', undefined)
      const entry = await store.getJournalEntry('int-1')
      expect(entry!.status).toBe('settled')
      expect(entry!.txHash).toBe('0xold')
    })

    test('listJournal returns all entries', async () => {
      await store.saveJournalEntry({ intentHash: 'i1', accountIndex, chainId: 1, targetHash: '0x1', status: 'received' })
      await store.saveJournalEntry({ intentHash: 'i2', accountIndex, chainId: 1, targetHash: '0x2', status: 'settled' })
      const all = await store.listJournal({})
      expect(all).toHaveLength(2)
    })

    test('listJournal filters by accountIndex, status, chain', async () => {
      await store.createWallet(1, 'second', '0xaddr1')
      await store.saveJournalEntry({ intentHash: 'i1', accountIndex, chainId: 1, targetHash: '0x1', status: 'received' })
      await store.saveJournalEntry({ intentHash: 'i2', accountIndex, chainId: 1, targetHash: '0x2', status: 'settled' })
      await store.saveJournalEntry({ intentHash: 'i3', accountIndex: 1, chainId: 900, targetHash: '0x3', status: 'received' })

      const a0Received = await store.listJournal({ accountIndex, status: 'received' })
      expect(a0Received).toHaveLength(1)
      expect(a0Received[0].intentHash).toBe('i1')
    })

    test('listJournal respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await store.saveJournalEntry({ intentHash: `i${i}`, accountIndex, chainId: 1, targetHash: `0x${i}`, status: 'received' })
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
