/**
 * RelayClient — WebSocket + REST connection to Relay server.
 *
 * Responsibilities:
 * - WebSocket connection with exponential backoff reconnect
 * - Send/receive on control_channel (SignedApproval, device ops)
 * - Send/receive on chat_queue (user <-> OpenClaw messages)
 * - REST auth (login, pair)
 * - Last Stream ID tracking for cursor-based sync on reconnect
 *
 * The Relay server is a blind transport — all payloads are E2E encrypted.
 * Only metadata (userId, messageId, timestamp, channel) is plaintext.
 */

export type RelayChannel = 'control' | 'chat';

export interface RelayMessage {
  channel: RelayChannel;
  messageId: string;
  timestamp: number;
  payload: unknown;
  sessionId?: string;
}

export interface ControlEnvelope {
  type: string;
  payload: unknown;
  messageId?: string;
  timestamp?: number;
}

export interface EncryptedPayload {
  nonce: string;
  ciphertext: string;
}

type MessageHandler = (message: RelayMessage) => void;
type ConnectionHandler = (connected: boolean) => void;

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const BACKOFF_MULTIPLIER = 2;
const HEARTBEAT_INTERVAL_MS = 25000;

export class RelayClient {
  private static instance: RelayClient;

  private ws: WebSocket | null = null;
  private relayUrl: string = '';
  private userId: string = '';
  private authToken: string = '';
  private lastStreamId: string = '0';

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;

  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();

  private connected = false;

  /** E2E session key (NaCl secretbox key, 32 bytes). Set after pairing. */
  private sessionKey: Uint8Array | null = null;

  private constructor() {}

  static getInstance(): RelayClient {
    if (!RelayClient.instance) {
      RelayClient.instance = new RelayClient();
    }
    return RelayClient.instance;
  }

  /**
   * Set the E2E session key (shared secret from pairing ECDH).
   * Once set, all payloads are encrypted before sending and decrypted on receive.
   */
  setSessionKey(sessionKey: Uint8Array): void {
    this.sessionKey = sessionKey;
  }

  /**
   * Clear the E2E session key (on disconnect / re-pair).
   */
  clearSessionKey(): void {
    this.sessionKey = null;
  }

  /**
   * Encrypt a plaintext string using the E2E session key (NaCl secretbox).
   */
  private encrypt(plaintext: string): EncryptedPayload {
    if (!this.sessionKey) {
      throw new Error('E2E session key not established');
    }
    // Import nacl dynamically to avoid top-level import issues in RN
    const nacl = require('tweetnacl');
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageBytes = new TextEncoder().encode(plaintext);
    const ciphertext = nacl.secretbox(messageBytes, nonce, this.sessionKey);
    // Use base64 encoding
    const { encodeBase64 } = require('tweetnacl-util');
    return {
      nonce: encodeBase64(nonce),
      ciphertext: encodeBase64(ciphertext),
    };
  }

  /**
   * Decrypt an encrypted payload using the E2E session key.
   */
  private decrypt(encrypted: EncryptedPayload): string {
    if (!this.sessionKey) {
      throw new Error('E2E session key not established');
    }
    const nacl = require('tweetnacl');
    const { decodeBase64, encodeUTF8 } = require('tweetnacl-util');
    const nonce = decodeBase64(encrypted.nonce);
    const ciphertext = decodeBase64(encrypted.ciphertext);
    const plaintext = nacl.secretbox.open(ciphertext, nonce, this.sessionKey);
    if (!plaintext) {
      throw new Error('E2E decryption failed — invalid ciphertext or wrong key');
    }
    return encodeUTF8(plaintext);
  }

  /**
   * Connect to Relay via WebSocket.
   */
  async connect(relayUrl: string, userId: string, authToken?: string): Promise<void> {
    this.relayUrl = relayUrl;
    this.userId = userId;
    if (authToken) this.authToken = authToken;
    this.intentionalClose = false;

    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.relayUrl.replace(/^http/, 'ws') + '/ws/app';
      this.ws = new WebSocket(wsUrl);

      const onOpen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;

        // Authenticate
        this.ws!.send(JSON.stringify({
          type: 'authenticate',
          payload: {
            userId: this.userId,
            token: this.authToken,
            lastStreamId: this.lastStreamId,
          },
        }));

        // Start heartbeat
        this.startHeartbeat();

        this.notifyConnectionHandlers(true);
        resolve();
      };

      const onMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(typeof event.data === 'string' ? event.data : '');

          // Track stream cursor for reconnection
          if (data.messageId || data.id) {
            this.lastStreamId = data.messageId ?? data.id;
          }

          // Relay uses { type } as the channel discriminator
          let payload = data.payload;

          // Decrypt payload if E2E session is established and message is encrypted
          if (this.sessionKey && data.encrypted && payload?.nonce && payload?.ciphertext) {
            try {
              payload = JSON.parse(this.decrypt(payload as EncryptedPayload));
            } catch (e) {
              console.error('[RelayClient] E2E decryption failed:', e);
              return;
            }
          }

          // Dispatch to handlers — map relay's `type` field to our `channel`
          const message: RelayMessage = {
            channel: (data.type as RelayChannel) ?? 'control',
            messageId: data.messageId ?? data.id ?? '',
            timestamp: data.timestamp ?? Date.now(),
            payload,
            sessionId: data.sessionId,
          };

          this.messageHandlers.forEach(handler => {
            try {
              handler(message);
            } catch (e) {
              console.error('[RelayClient] Handler error:', e);
            }
          });
        } catch (e) {
          console.error('[RelayClient] Parse error:', e);
        }
      };

      const onClose = () => {
        this.connected = false;
        this.stopHeartbeat();
        this.notifyConnectionHandlers(false);

        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

      const onError = (error: Event) => {
        console.error('[RelayClient] WebSocket error:', error);
        if (!this.connected) {
          reject(new Error('WebSocket connection failed'));
        }
      };

      this.ws.onopen = onOpen;
      this.ws.onmessage = onMessage;
      this.ws.onclose = onClose;
      this.ws.onerror = onError;
    });
  }

  /**
   * Exponential backoff reconnect.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const backoff = Math.min(
      INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, this.reconnectAttempts),
      MAX_BACKOFF_MS,
    );

    console.log(`[RelayClient] Reconnecting in ${backoff}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      try {
        await this.doConnect();
      } catch {
        // doConnect failure will trigger onClose → scheduleReconnect
      }
    }, backoff);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Build a relay-compatible message envelope.
   * Uses { type } as the top-level discriminator (matching relay protocol).
   * Encrypts payload if E2E session key is set.
   */
  private buildEnvelope(
    type: 'control' | 'chat',
    innerPayload: unknown,
    extras: Record<string, unknown> = {},
  ): string {
    const envelope: Record<string, unknown> = {
      type,
      messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      ...extras,
    };

    if (this.sessionKey) {
      envelope.payload = this.encrypt(JSON.stringify(innerPayload));
      envelope.encrypted = true;
    } else {
      envelope.payload = innerPayload;
    }

    return JSON.stringify(envelope);
  }

  /**
   * Send a message on the control channel (SignedApproval, device ops).
   */
  async sendControl(envelope: ControlEnvelope): Promise<void> {
    this.ensureConnected();
    const innerPayload = { type: envelope.type, ...((envelope.payload ?? {}) as Record<string, unknown>) };
    this.ws!.send(this.buildEnvelope('control', innerPayload, {
      messageId: envelope.messageId,
      timestamp: envelope.timestamp,
    }));
  }

  /**
   * Send a chat message (user -> OpenClaw via Relay -> daemon).
   */
  async sendChat(sessionId: string, payload: unknown): Promise<void> {
    this.ensureConnected();
    this.ws!.send(this.buildEnvelope('chat', payload, { sessionId }));
  }

  /**
   * Send a SignedApproval (tx or policy) via control channel.
   * Sends the specific approval type (tx_approval, policy_approval, etc.)
   * that the daemon's control-handler expects, rather than generic 'signed_approval'.
   * Returns when daemon acknowledges.
   */
  async sendApproval(signedApproval: unknown): Promise<{ txHash: string }> {
    return new Promise((resolve, reject) => {
      const approval = signedApproval as { type?: string; requestId?: string };
      const requestId = approval?.requestId ?? '';

      // Map SignedApproval.type to daemon control message types
      const approvalTypeMap: Record<string, string> = {
        tx: 'tx_approval',
        policy: 'policy_approval',
        policy_reject: 'policy_reject',
        device_revoke: 'device_revoke',
      };
      const controlType = approvalTypeMap[approval?.type ?? ''] ?? 'tx_approval';

      // Listen for response
      const handler = (message: RelayMessage) => {
        if (message.channel !== 'control') return;
        const data = message.payload as { type?: string; requestId?: string; txHash?: string; hash?: string; error?: string };
        if (data.requestId !== requestId) return;

        this.removeMessageHandler(handler);

        if (data.type === 'approval_result' && (data.txHash || data.hash)) {
          resolve({ txHash: (data.txHash ?? data.hash)! });
        } else if (data.type === 'approval_error') {
          reject(new Error(data.error ?? 'Approval failed'));
        }
      };

      this.addMessageHandler(handler);

      // Send the approval using the specific type the daemon expects
      this.sendControl({
        type: controlType,
        payload: signedApproval,
      }).catch(reject);

      // Timeout after 60s
      setTimeout(() => {
        this.removeMessageHandler(handler);
        reject(new Error('Approval timed out (60s)'));
      }, 60_000);
    });
  }

  /**
   * REST: authenticate with Relay.
   */
  async restAuth(relayUrl: string, userId: string, password: string): Promise<string> {
    const response = await fetch(`${relayUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password }),
    });

    if (!response.ok) {
      throw new Error(`Auth failed: ${response.status}`);
    }

    const data = await response.json();
    this.authToken = data.token;
    return data.token;
  }

  /**
   * Subscribe to all incoming messages.
   */
  addMessageHandler(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  removeMessageHandler(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * Subscribe to connection state changes.
   */
  addConnectionHandler(handler: ConnectionHandler): void {
    this.connectionHandlers.add(handler);
  }

  removeConnectionHandler(handler: ConnectionHandler): void {
    this.connectionHandlers.delete(handler);
  }

  private notifyConnectionHandlers(connected: boolean): void {
    this.connectionHandlers.forEach(h => h(connected));
  }

  /**
   * Disconnect from Relay.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private ensureConnected(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Relay');
    }
  }
}
