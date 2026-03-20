const nacl = require('tweetnacl')

describe('PairingService', () => {
  test('QR payload parsing', () => {
    const qrPayload = JSON.stringify({
      daemonPubKey: '0x' + Buffer.from(nacl.box.keyPair().publicKey).toString('hex'),
      relayUrl: 'wss://relay.example.com',
      pairingToken: 'abc123'
    })
    const parsed = JSON.parse(qrPayload)
    expect(parsed.daemonPubKey).toMatch(/^0x[0-9a-f]{64}$/)
    expect(parsed.relayUrl).toBe('wss://relay.example.com')
  })

  test('SAS values match for same key pair order', () => {
    const daemonKp = nacl.box.keyPair()
    const appKp = nacl.box.keyPair()
    function computeSAS(pk1, pk2) {
      const combined = new Uint8Array(pk1.length + pk2.length)
      combined.set(pk1, 0)
      combined.set(pk2, pk1.length)
      const hash = nacl.hash(combined)
      return ((hash[0] * 256 * 256 + hash[1] * 256 + hash[2]) % 1000000).toString().padStart(6, '0')
    }
    const sas1 = computeSAS(daemonKp.publicKey, appKp.publicKey)
    const sas2 = computeSAS(daemonKp.publicKey, appKp.publicKey)
    expect(sas1).toBe(sas2)
    expect(sas1.length).toBe(6)
  })

  test('pairing_confirm payload structure', () => {
    const appKp = nacl.sign.keyPair()
    const encKp = nacl.box.keyPair()
    const payload = {
      type: 'pairing_confirm',
      payload: {
        identityPubKey: '0x' + Buffer.from(appKp.publicKey).toString('hex'),
        encryptionPubKey: '0x' + Buffer.from(encKp.publicKey).toString('hex'),
        pairingToken: 'abc123'
      }
    }
    expect(payload.type).toBe('pairing_confirm')
    expect(payload.payload.identityPubKey).toMatch(/^0x[0-9a-f]{64}$/)
  })
})
