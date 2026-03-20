import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { JsonApprovalStore } from '../src/json-approval-store.js'

describe('JsonApprovalStore', () => {
  let store: JsonApprovalStore
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'json-store-'))
    store = new JsonApprovalStore(tmpDir)
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
      await store.appendHistory({ accountIndex: 0, type: 'tx', chainId: 1, targetHash: '0x1', approver: 'a', action: 'approved', timestamp: Date.now() })
      await store.deleteWallet(0)

      const policy = await store.loadPolicy(0, 1)
      expect(policy).toBeNull()
      const pending = await store.loadPendingApprovals(0, null, null)
      expect(pending).toHaveLength(0)
      const crons = await store.listCrons(0)
      expect(crons).toHaveLength(0)
      // history is preserved
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
      expect(loaded!.policies).toEqual([{ maxAmount: '1000' }])
      expect(loaded!.signature).toEqual({ sig: 'abc' })
      expect(loaded!.policyVersion).toBe(1)
    })

    test('savePolicy increments version', async () => {
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

    test('savePolicy with empty policies array round-trips', async () => {
      await store.savePolicy(accountIndex, 1, { policies: [], signature: {} })
      const loaded = await store.loadPolicy(accountIndex, 1)
      expect(loaded!.policies).toEqual([])
      expect(loaded!.signature).toEqual({})
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
    test('appendHistory + getHistory round-trips', async () => {
      await store.appendHistory({
        accountIndex: 0,
        type: 'tx',
        chainId: 1,
        targetHash: '0xabc',
        approver: '0xpub',
        action: 'approved',
        timestamp: 1000
      })
      const history = await store.getHistory({})
      expect(history).toHaveLength(1)
      expect(history[0].action).toBe('approved')
      expect(history[0].accountIndex).toBe(0)
      expect(history[0].targetHash).toBe('0xabc')
      expect(history[0].approver).toBe('0xpub')
    })

    test('getHistory filters by accountIndex, type, chain', async () => {
      await store.appendHistory({ accountIndex: 0, type: 'tx', chainId: 1, targetHash: '0x1', approver: 'a', action: 'approved', timestamp: Date.now() })
      await store.appendHistory({ accountIndex: 0, type: 'policy', chainId: 1, targetHash: '0x2', approver: 'a', action: 'approved', timestamp: Date.now() })
      await store.appendHistory({ accountIndex: 1, type: 'tx', chainId: 900, targetHash: '0x3', approver: 'a', action: 'rejected', timestamp: Date.now() })

      const a0Tx = await store.getHistory({ accountIndex: 0, type: 'tx' })
      expect(a0Tx).toHaveLength(1)
    })

    test('getHistory respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await store.appendHistory({ accountIndex: 0, type: 'tx', chainId: 1, targetHash: `0x${i}`, approver: 'a', action: 'approved', timestamp: Date.now() })
      }
      const limited = await store.getHistory({ limit: 2 })
      expect(limited).toHaveLength(2)
    })
  })

  // --- Signers ---

  describe('signers', () => {
    test('saveSigner + getSigner round-trips', async () => {
      await store.saveSigner('0xpubkey123')
      const dev = await store.getSigner('0xpubkey123')
      expect(dev!.publicKey).toBe('0xpubkey123')
      expect(dev!.revokedAt).toBeNull()
    })

    test('getSigner returns null for unknown signer', async () => {
      const dev = await store.getSigner('nonexistent')
      expect(dev).toBeNull()
    })

    test('listSigners returns all signers', async () => {
      await store.saveSigner('pk1')
      await store.saveSigner('pk2')
      const signers = await store.listSigners()
      expect(signers).toHaveLength(2)
    })

    test('revokeSigner sets revoked_at', async () => {
      await store.saveSigner('pk1')
      await store.revokeSigner('pk1')
      const dev = await store.getSigner('pk1')
      expect(dev!.revokedAt).toBeTruthy()
    })

    test('isSignerRevoked returns false for active signer', async () => {
      await store.saveSigner('pk1')
      expect(await store.isSignerRevoked('pk1')).toBe(false)
    })

    test('isSignerRevoked returns true for revoked signer', async () => {
      await store.saveSigner('pk1')
      await store.revokeSigner('pk1')
      expect(await store.isSignerRevoked('pk1')).toBe(true)
    })

    test('isSignerRevoked returns false for unknown signer', async () => {
      expect(await store.isSignerRevoked('nonexistent')).toBe(false)
    })
  })

  // --- Nonces ---

  describe('nonces', () => {
    test('getLastNonce returns 0 by default', async () => {
      const nonce = await store.getLastNonce('0xapprover')
      expect(nonce).toBe(0)
    })

    test('updateNonce + getLastNonce round-trips', async () => {
      await store.updateNonce('0xapprover', 5)
      const nonce = await store.getLastNonce('0xapprover')
      expect(nonce).toBe(5)
    })

    test('nonce is scoped per approver', async () => {
      await store.updateNonce('a1', 10)
      await store.updateNonce('a2', 20)
      expect(await store.getLastNonce('a1')).toBe(10)
      expect(await store.getLastNonce('a2')).toBe(20)
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
    })

    test('saveCron with chainId null round-trips', async () => {
      await store.saveCron(accountIndex, {
        sessionId: 'sess-1',
        interval: '*/5 * * * *',
        prompt: 'check all',
        chainId: null
      })
      const crons = await store.listCrons(accountIndex)
      expect(crons).toHaveLength(1)
      expect(crons[0].chainId).toBeNull()
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
  })

  // --- Rejection History ---

  describe('rejection history', () => {
    test('saveRejection + listRejections round-trips', async () => {
      await store.saveRejection({
        intentHash: 'int-1',
        accountIndex: 0,
        chainId: 1,
        targetHash: '0xabc',
        reason: 'no matching permission',
        context: { target: '0xdead' },
        policyVersion: 1,
        rejectedAt: 1000
      })
      const rejections = await store.listRejections({ accountIndex: 0, chainId: 1 })
      expect(rejections).toHaveLength(1)
      expect(rejections[0].intentHash).toBe('int-1')
      expect(rejections[0].reason).toBe('no matching permission')
      expect(rejections[0].context).toEqual({ target: '0xdead' })
      expect(rejections[0].policyVersion).toBe(1)
    })

    test('listRejections filters by accountIndex and chainId', async () => {
      await store.saveRejection({ intentHash: 'r1', accountIndex: 0, chainId: 1, targetHash: '0x1', reason: 'r1', context: null, policyVersion: 1, rejectedAt: 1000 })
      await store.saveRejection({ intentHash: 'r2', accountIndex: 1, chainId: 1, targetHash: '0x2', reason: 'r2', context: null, policyVersion: 1, rejectedAt: 1001 })
      const result = await store.listRejections({ accountIndex: 0 })
      expect(result).toHaveLength(1)
      expect(result[0].intentHash).toBe('r1')
    })

    test('listRejections respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await store.saveRejection({ intentHash: `r${i}`, accountIndex: 0, chainId: 1, targetHash: `0x${i}`, reason: 'test', context: null, policyVersion: 1, rejectedAt: 1000 + i })
      }
      const result = await store.listRejections({ limit: 2 })
      expect(result).toHaveLength(2)
    })
  })

  // --- Policy Versions ---

  describe('policy versions', () => {
    const accountIndex = 0

    beforeEach(async () => {
      await store.setMasterSeed('mnemonic')
      await store.createWallet(accountIndex, 'test-wallet', '0xaddr0')
    })

    test('E3: first policy creates version=1 with diff=null', async () => {
      await store.savePolicy(accountIndex, 1, { policies: [{ type: 'call' }], signature: {} }, 'initial policy')
      const versions = await store.listPolicyVersions(accountIndex, 1)
      expect(versions).toHaveLength(1)
      expect(versions[0].version).toBe(1)
      expect(versions[0].description).toBe('initial policy')
      expect(versions[0].diff).toBeNull()
    })

    test('E4: second policy creates version=2 with non-null diff', async () => {
      await store.savePolicy(accountIndex, 1, { policies: [{ type: 'call', v: 1 }], signature: {} }, 'v1')
      await store.savePolicy(accountIndex, 1, { policies: [{ type: 'call', v: 2 }], signature: {} }, 'v2')
      const versions = await store.listPolicyVersions(accountIndex, 1)
      expect(versions).toHaveLength(2)
      expect(versions[1].version).toBe(2)
      expect(versions[1].description).toBe('v2')
      expect(versions[1].diff).not.toBeNull()
      expect(versions[1].diff).toHaveProperty('modified')
    })
  })

  // --- Execution Journal ---

  describe('execution journal', () => {
    test('saveJournalEntry + getJournalEntry round-trips', async () => {
      await store.saveJournalEntry({
        intentHash: 'int-1',
        accountIndex: 0,
        chainId: 1,
        targetHash: '0xabc',
        status: 'received'
      })
      const entry = await store.getJournalEntry('int-1')
      expect(entry!.intentHash).toBe('int-1')
      expect(entry!.status).toBe('received')
    })

    test('getJournalEntry returns null for unknown id', async () => {
      const entry = await store.getJournalEntry('nonexistent')
      expect(entry).toBeNull()
    })

    test('updateJournalStatus updates status and txHash', async () => {
      await store.saveJournalEntry({
        intentHash: 'int-1',
        accountIndex: 0,
        chainId: 1,
        targetHash: '0xabc',
        status: 'received'
      })
      await store.updateJournalStatus('int-1', 'signed', '0xtx123')
      const entry = await store.getJournalEntry('int-1')
      expect(entry!.status).toBe('signed')
      expect(entry!.txHash).toBe('0xtx123')
    })

    test('listJournal returns all entries', async () => {
      await store.saveJournalEntry({ intentHash: 'i1', accountIndex: 0, chainId: 1, targetHash: '0x1', status: 'received' })
      await store.saveJournalEntry({ intentHash: 'i2', accountIndex: 0, chainId: 1, targetHash: '0x2', status: 'settled' })
      const all = await store.listJournal({})
      expect(all).toHaveLength(2)
    })

    test('listJournal filters by accountIndex, status, chain', async () => {
      await store.saveJournalEntry({ intentHash: 'i1', accountIndex: 0, chainId: 1, targetHash: '0x1', status: 'received' })
      await store.saveJournalEntry({ intentHash: 'i2', accountIndex: 0, chainId: 1, targetHash: '0x2', status: 'settled' })
      await store.saveJournalEntry({ intentHash: 'i3', accountIndex: 1, chainId: 900, targetHash: '0x3', status: 'received' })

      const a0Received = await store.listJournal({ accountIndex: 0, status: 'received' })
      expect(a0Received).toHaveLength(1)
      expect(a0Received[0].intentHash).toBe('i1')
    })

    test('listJournal respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await store.saveJournalEntry({ intentHash: `i${i}`, accountIndex: 0, chainId: 1, targetHash: `0x${i}`, status: 'received' })
      }
      const limited = await store.listJournal({ limit: 3 })
      expect(limited).toHaveLength(3)
    })
  })
})
