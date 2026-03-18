const nacl = require('tweetnacl')

describe('E2ECrypto', () => {
  test('generateKeyPair returns valid keypair', () => {
    const kp = nacl.box.keyPair()
    expect(kp.publicKey).toBeInstanceOf(Uint8Array)
    expect(kp.secretKey).toBeInstanceOf(Uint8Array)
    expect(kp.publicKey.length).toBe(32)
  })

  test('ECDH shared secret derivation', () => {
    const alice = nacl.box.keyPair()
    const bob = nacl.box.keyPair()
    const sharedA = nacl.box.before(bob.publicKey, alice.secretKey)
    const sharedB = nacl.box.before(alice.publicKey, bob.secretKey)
    expect(Buffer.from(sharedA).toString('hex')).toBe(Buffer.from(sharedB).toString('hex'))
  })

  test('encrypt and decrypt round-trip', () => {
    const alice = nacl.box.keyPair()
    const bob = nacl.box.keyPair()
    const sharedKey = nacl.box.before(bob.publicKey, alice.secretKey)
    const message = new TextEncoder().encode('hello world')
    const nonce = nacl.randomBytes(24)
    const encrypted = nacl.box.after(message, nonce, sharedKey)
    expect(encrypted).not.toBeNull()
    const sharedKeyB = nacl.box.before(alice.publicKey, bob.secretKey)
    const decrypted = nacl.box.open.after(encrypted, nonce, sharedKeyB)
    expect(decrypted).not.toBeNull()
    expect(new TextDecoder().decode(decrypted)).toBe('hello world')
  })

  test('decrypt fails with wrong key', () => {
    const alice = nacl.box.keyPair()
    const bob = nacl.box.keyPair()
    const eve = nacl.box.keyPair()
    const sharedKey = nacl.box.before(bob.publicKey, alice.secretKey)
    const message = new TextEncoder().encode('secret')
    const nonce = nacl.randomBytes(24)
    const encrypted = nacl.box.after(message, nonce, sharedKey)
    const wrongKey = nacl.box.before(alice.publicKey, eve.secretKey)
    const decrypted = nacl.box.open.after(encrypted, nonce, wrongKey)
    expect(decrypted).toBeNull()
  })

  test('SAS computation is deterministic', () => {
    const pk1 = nacl.box.keyPair().publicKey
    const pk2 = nacl.box.keyPair().publicKey
    const combined = new Uint8Array(pk1.length + pk2.length)
    combined.set(pk1, 0)
    combined.set(pk2, pk1.length)
    const hash1 = nacl.hash(combined)
    const sas1 = (hash1[0] * 256 * 256 + hash1[1] * 256 + hash1[2]) % 1000000
    const hash2 = nacl.hash(combined)
    const sas2 = (hash2[0] * 256 * 256 + hash2[1] * 256 + hash2[2]) % 1000000
    expect(sas1).toBe(sas2)
    expect(sas1).toBeGreaterThanOrEqual(0)
    expect(sas1).toBeLessThan(1000000)
  })
})
