import nacl from 'tweetnacl'

interface KeyPair {
  publicKey: string
  secretKey: string
}

/**
 * Verify an Ed25519 signature.
 */
export function verify (message: Buffer | Uint8Array, signatureHex: string, publicKeyHex: string): boolean {
  const sig = hexToBytes(signatureHex)
  const pk = hexToBytes(publicKeyHex)
  const msg = message instanceof Uint8Array ? message : new Uint8Array(message)
  return nacl.sign.detached.verify(msg, sig, pk)
}

/**
 * Sign a message with Ed25519.
 */
function sign (message: Buffer | Uint8Array, secretKeyHex: string): string {
  const sk = hexToBytes(secretKeyHex)
  const msg = message instanceof Uint8Array ? message : new Uint8Array(message)
  const sig = nacl.sign.detached(msg, sk)
  return '0x' + bytesToHex(sig)
}

/**
 * Generate an Ed25519 keypair.
 */
function generateKeyPair (): KeyPair {
  const kp = nacl.sign.keyPair()
  return {
    publicKey: '0x' + bytesToHex(kp.publicKey),
    secretKey: '0x' + bytesToHex(kp.secretKey)
  }
}

function hexToBytes (hex: string): Uint8Array {
  const h = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex
  const bytes = new Uint8Array(h.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.substr(i * 2, 2), 16)
  }
  return bytes
}

function bytesToHex (bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
