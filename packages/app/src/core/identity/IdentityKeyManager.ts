import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

const SECURE_STORE_KEY_SECRET = 'wdk_identity_secret_key';
const SECURE_STORE_KEY_PUBLIC = 'wdk_identity_public_key';
const SECURE_STORE_KEY_DEVICE_ID = 'wdk_device_id';

export interface IdentityKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * IdentityKeyManager — Ed25519 keypair lifecycle via expo-secure-store.
 *
 * The identity key is the root of trust for the RN App:
 * - Signs all SignedApproval envelopes (tx, policy, device ops)
 * - Stored in iOS Keychain / Android Keystore via SecureStore
 * - Never leaves the device
 *
 * Singleton — one identity per app install.
 */
export class IdentityKeyManager {
  private static instance: IdentityKeyManager;
  private cachedKeyPair: IdentityKeyPair | null = null;

  private constructor() {}

  static getInstance(): IdentityKeyManager {
    if (!IdentityKeyManager.instance) {
      IdentityKeyManager.instance = new IdentityKeyManager();
    }
    return IdentityKeyManager.instance;
  }

  /**
   * Generate a new Ed25519 keypair and persist to SecureStore.
   * Overwrites any existing key. Returns the new keypair.
   */
  async generate(): Promise<IdentityKeyPair> {
    const keyPair = nacl.sign.keyPair();

    await SecureStore.setItemAsync(
      SECURE_STORE_KEY_SECRET,
      encodeBase64(keyPair.secretKey),
    );
    await SecureStore.setItemAsync(
      SECURE_STORE_KEY_PUBLIC,
      encodeBase64(keyPair.publicKey),
    );

    // Generate a device ID if none exists
    const existingDeviceId = await SecureStore.getItemAsync(SECURE_STORE_KEY_DEVICE_ID);
    if (!existingDeviceId) {
      const deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await SecureStore.setItemAsync(SECURE_STORE_KEY_DEVICE_ID, deviceId);
    }

    this.cachedKeyPair = {
      publicKey: keyPair.publicKey,
      secretKey: keyPair.secretKey,
    };

    return this.cachedKeyPair;
  }

  /**
   * Load existing keypair from SecureStore.
   * Returns null if no key exists (first launch or after delete).
   */
  async load(): Promise<IdentityKeyPair | null> {
    if (this.cachedKeyPair) return this.cachedKeyPair;

    const secretB64 = await SecureStore.getItemAsync(SECURE_STORE_KEY_SECRET);
    const publicB64 = await SecureStore.getItemAsync(SECURE_STORE_KEY_PUBLIC);

    if (!secretB64 || !publicB64) return null;

    this.cachedKeyPair = {
      publicKey: decodeBase64(publicB64),
      secretKey: decodeBase64(secretB64),
    };

    return this.cachedKeyPair;
  }

  /**
   * Delete keypair from SecureStore. Clears cache.
   * Used during device reset.
   */
  async delete(): Promise<void> {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEY_SECRET);
    await SecureStore.deleteItemAsync(SECURE_STORE_KEY_PUBLIC);
    this.cachedKeyPair = null;
  }

  /**
   * Get the cached or loaded keypair.
   * Returns null if no key exists. Alias for load().
   */
  async getKeyPair(): Promise<IdentityKeyPair | null> {
    return this.load();
  }

  /**
   * Get the device ID (persisted in SecureStore).
   */
  async getDeviceId(): Promise<string | null> {
    return SecureStore.getItemAsync(SECURE_STORE_KEY_DEVICE_ID);
  }

  /**
   * Get the public key as hex string (for display / registration).
   */
  async getPublicKeyHex(): Promise<string | null> {
    const kp = await this.load();
    if (!kp) return null;
    return '0x' + Buffer.from(kp.publicKey).toString('hex');
  }

  /**
   * Sign a message with the identity secret key.
   * Returns the detached Ed25519 signature.
   */
  async sign(message: Uint8Array): Promise<Uint8Array> {
    const kp = await this.load();
    if (!kp) throw new Error('Identity key not loaded. Call generate() or load() first.');
    return nacl.sign.detached(message, kp.secretKey);
  }

  /**
   * Sign a UTF-8 string message (convenience).
   * Returns base64-encoded signature.
   */
  async signString(message: string): Promise<string> {
    const messageBytes = new TextEncoder().encode(message);
    const sig = await this.sign(messageBytes);
    return encodeBase64(sig);
  }

  /**
   * Verify a detached signature against a public key.
   */
  static verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): boolean {
    return nacl.sign.detached.verify(message, signature, publicKey);
  }
}
