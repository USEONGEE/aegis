import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

/**
 * E2ECrypto — ECDH key exchange + NaCl box encrypt/decrypt.
 *
 * Uses Curve25519 for key exchange and XSalsa20-Poly1305 for authenticated encryption.
 * Relay server cannot decrypt messages — only metadata (userId, messageId, timestamp) is plaintext.
 *
 * Flow:
 * 1. App generates ephemeral Curve25519 keypair (or derives from Ed25519 identity)
 * 2. App and daemon exchange public keys via authenticated channel
 * 3. Shared secret derived via ECDH → used for nacl.box
 */

export interface E2EKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface EncryptedMessage {
  nonce: string;      // base64
  ciphertext: string; // base64
  ephemeralPubKey?: string; // base64, for initial key exchange
}

export class E2ECrypto {
  private keyPair: E2EKeyPair;
  private sharedKey: Uint8Array | null = null;

  constructor(keyPair?: E2EKeyPair) {
    this.keyPair = keyPair ?? E2ECrypto.generateKeyPair();
  }

  /**
   * Generate a Curve25519 keypair for box encryption.
   */
  static generateKeyPair(): E2EKeyPair {
    return nacl.box.keyPair();
  }

  /**
   * Convert an Ed25519 signing keypair to a Curve25519 box keypair.
   * Used so that the identity key can double as encryption key.
   */
  static ed25519ToCurve25519(ed25519SecretKey: Uint8Array): E2EKeyPair {
    // tweetnacl doesn't expose this directly; use the first 32 bytes of ed25519 secret key
    // as seed for Curve25519. This is a standard conversion.
    const seed = ed25519SecretKey.slice(0, 32);
    // For proper conversion, use nacl.box.keyPair.fromSecretKey with the clamped seed
    // tweetnacl clamps internally
    return nacl.box.keyPair.fromSecretKey(seed);
  }

  /**
   * Get our public key (to share with the peer during key exchange).
   */
  getPublicKey(): Uint8Array {
    return this.keyPair.publicKey;
  }

  getPublicKeyBase64(): string {
    return encodeBase64(this.keyPair.publicKey);
  }

  /**
   * Establish shared key from peer's public key (ECDH).
   * Call this after key exchange is complete.
   */
  setRemotePublicKey(peerPublicKey: Uint8Array): void {
    this.sharedKey = nacl.box.before(peerPublicKey, this.keyPair.secretKey);
  }

  setRemotePublicKeyBase64(peerPublicKeyB64: string): void {
    this.setRemotePublicKey(decodeBase64(peerPublicKeyB64));
  }

  /**
   * Encrypt a plaintext string for the peer.
   * Requires setRemotePublicKey() to have been called.
   */
  encrypt(plaintext: string): EncryptedMessage {
    if (!this.sharedKey) {
      throw new Error('Shared key not established. Call setRemotePublicKey() first.');
    }

    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const messageBytes = decodeUTF8(plaintext);
    const ciphertext = nacl.box.after(messageBytes, nonce, this.sharedKey);

    return {
      nonce: encodeBase64(nonce),
      ciphertext: encodeBase64(ciphertext),
    };
  }

  /**
   * Decrypt a ciphertext from the peer.
   * Requires setRemotePublicKey() to have been called.
   */
  decrypt(encrypted: EncryptedMessage): string {
    if (!this.sharedKey) {
      throw new Error('Shared key not established. Call setRemotePublicKey() first.');
    }

    const nonce = decodeBase64(encrypted.nonce);
    const ciphertext = decodeBase64(encrypted.ciphertext);
    const plaintext = nacl.box.open.after(ciphertext, nonce, this.sharedKey);

    if (!plaintext) {
      throw new Error('Decryption failed — invalid ciphertext or wrong key.');
    }

    return encodeUTF8(plaintext);
  }

  /**
   * Compute Short Authentication String (SAS) for visual verification during key exchange.
   * Both sides compute SAS from both public keys — if Relay is MITM, SAS won't match.
   *
   * Returns 6-digit numeric code.
   */
  static computeSAS(publicKeyA: Uint8Array, publicKeyB: Uint8Array): string {
    // Concatenate both public keys in canonical order (sort by byte value)
    const a = encodeBase64(publicKeyA);
    const b = encodeBase64(publicKeyB);
    const ordered = a < b ? [publicKeyA, publicKeyB] : [publicKeyB, publicKeyA];

    const combined = new Uint8Array(ordered[0].length + ordered[1].length);
    combined.set(ordered[0], 0);
    combined.set(ordered[1], ordered[0].length);

    // Hash to produce SAS (use nacl.hash = SHA-512)
    const hash = nacl.hash(combined);

    // Take first 4 bytes, mod 1000000 for 6-digit code
    const num = ((hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3]) >>> 0;
    return String(num % 1000000).padStart(6, '0');
  }

  /**
   * Check if E2E session is established (shared key computed).
   */
  isEstablished(): boolean {
    return this.sharedKey !== null;
  }

  /**
   * Get the ECDH shared key (32 bytes, NaCl box.before output).
   * Used as symmetric session key for E2E encryption.
   * Returns null if setRemotePublicKey has not been called.
   */
  getSharedKey(): Uint8Array | null {
    return this.sharedKey;
  }

  /**
   * Clear the shared key (on disconnect).
   */
  reset(): void {
    this.sharedKey = null;
  }
}
