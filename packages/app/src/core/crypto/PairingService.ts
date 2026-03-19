import { E2ECrypto } from './E2ECrypto';
import { IdentityKeyManager } from '../identity/IdentityKeyManager';
import { RelayClient } from '../relay/RelayClient';

/**
 * PairingService — QR code generation + SAS verification flow.
 *
 * Pairing flow:
 * 1. Daemon displays QR code containing: { relayUrl, userId, pairingToken, daemonPubKey }
 * 2. App scans QR → connects to Relay → sends own publicKey + identity Ed25519 pubkey
 * 3. Both sides compute SAS from the two Curve25519 public keys
 * 4. User verifies SAS matches on both screens
 * 5. Upon confirmation, daemon registers app's identity key as trustedApprover
 * 6. E2E session established
 */

export interface PairingQRPayload {
  relayUrl: string;
  userId: string;
  pairingToken: string;
  daemonPubKey: string; // base64 Curve25519
}

export interface PairingResult {
  success: boolean;
  deviceId: string;
  sas: string;
  relayUrl: string;
  userId: string;
}

export type PairingStatus =
  | 'idle'
  | 'scanning'
  | 'exchanging_keys'
  | 'awaiting_sas_confirm'
  | 'confirming'
  | 'complete'
  | 'error';

export class PairingService {
  private e2eCrypto: E2ECrypto;
  private identityManager: IdentityKeyManager;
  private status: PairingStatus = 'idle';
  private sas: string | null = null;
  private qrPayload: PairingQRPayload | null = null;

  constructor() {
    this.e2eCrypto = new E2ECrypto();
    this.identityManager = IdentityKeyManager.getInstance();
  }

  getStatus(): PairingStatus {
    return this.status;
  }

  getSAS(): string | null {
    return this.sas;
  }

  /**
   * Parse QR code data scanned by the camera.
   */
  parseQRCode(qrData: string): PairingQRPayload {
    try {
      const payload: PairingQRPayload = JSON.parse(qrData);
      if (!payload.relayUrl || !payload.userId || !payload.pairingToken || !payload.daemonPubKey) {
        throw new Error('Invalid QR code: missing required fields');
      }
      return payload;
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error('Invalid QR code: not valid JSON');
      }
      throw e;
    }
  }

  /**
   * Execute the full pairing flow after scanning QR.
   *
   * Steps:
   * 1. Generate identity key if not exists
   * 2. Set daemon's Curve25519 public key for ECDH
   * 3. Compute SAS for visual verification
   * 4. Send pairing request to Relay with our keys
   * 5. Wait for daemon to confirm SAS match
   */
  async initiatePairing(qrPayload: PairingQRPayload): Promise<{
    sas: string;
    confirmPairing: () => Promise<PairingResult>;
    cancelPairing: () => void;
  }> {
    this.status = 'exchanging_keys';
    this.qrPayload = qrPayload;

    // Ensure identity key exists
    let keyPair = await this.identityManager.load();
    if (!keyPair) {
      keyPair = await this.identityManager.generate();
    }

    // Set daemon's public key for ECDH
    this.e2eCrypto.setRemotePublicKeyBase64(qrPayload.daemonPubKey);

    // Compute SAS
    const ourPubKey = this.e2eCrypto.getPublicKey();
    const { decodeBase64 } = await import('tweetnacl-util');
    const daemonPubKey = decodeBase64(qrPayload.daemonPubKey);
    this.sas = E2ECrypto.computeSAS(ourPubKey, daemonPubKey);
    this.status = 'awaiting_sas_confirm';

    const confirmPairing = async (): Promise<PairingResult> => {
      this.status = 'confirming';

      const relay = RelayClient.getInstance();
      const deviceId = await this.identityManager.getDeviceId();
      const identityPubKeyHex = await this.identityManager.getPublicKeyHex();

      // Connect to Relay and send pairing confirmation
      await relay.connect(qrPayload.relayUrl, qrPayload.userId);

      await relay.sendControl({
        type: 'pairing_confirm',
        payload: {
          pairingToken: qrPayload.pairingToken,
          signerId: deviceId,
          identityPubKey: identityPubKeyHex,
          encryptionPubKey: this.e2eCrypto.getPublicKeyBase64(),
          sas: this.sas,
        },
      });

      // Step 05 / Gap 11: Establish E2E session key via ECDH shared secret
      // The ECDH shared key was already computed when we called setRemotePublicKeyBase64
      // (which calls nacl.box.before internally). Use it as the session key.
      if (this.e2eCrypto.isEstablished()) {
        // nacl.box.before() produces a precomputed shared key (32 bytes)
        // which we use as the symmetric session key for NaCl secretbox.
        // Both sides compute the same shared key from the ECDH exchange.
        const sharedKey = this.e2eCrypto.getSharedKey();
        if (sharedKey) {
          relay.setSessionKey(sharedKey);
        }
      }

      this.status = 'complete';

      return {
        success: true,
        deviceId: deviceId!,
        sas: this.sas!,
        relayUrl: qrPayload.relayUrl,
        userId: qrPayload.userId,
      };
    };

    const cancelPairing = () => {
      this.status = 'idle';
      this.sas = null;
      this.qrPayload = null;
      this.e2eCrypto.reset();
    };

    return { sas: this.sas, confirmPairing, cancelPairing };
  }

  /**
   * Get the E2ECrypto instance (for encrypting messages after pairing).
   */
  getE2ECrypto(): E2ECrypto {
    return this.e2eCrypto;
  }

  /**
   * Reset pairing state (for re-pair).
   */
  reset(): void {
    this.status = 'idle';
    this.sas = null;
    this.qrPayload = null;
    this.e2eCrypto.reset();
  }
}
