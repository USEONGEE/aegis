/**
 * RelayClient — WebSocket + REST connection to Relay server.
 *
 * Responsibilities:
 * - WebSocket connection with exponential backoff reconnect
 * - Send/receive on control_channel (SignedApproval, device ops)
 * - Send/receive on chat_queue (user <-> OpenClaw messages)
 * - REST auth (login, enroll)
 * - Last Stream ID tracking for cursor-based sync on reconnect
 *
 * The Relay server is a blind transport — all payloads are E2E encrypted.
 * Only metadata (userId, messageId, timestamp, channel) is plaintext.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8 } from 'tweetnacl-util';

import type { RelayChannel, ControlEvent, ChatEvent } from '@wdk-app/protocol';
export type { RelayChannel };

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

  /** E2E session key (NaCl secretbox key, 32 bytes). Set after key exchange. */
  private sessionKey: Uint8Array | null = null;

  /** v0.3.0: callback invoked once 'authenticated' response is received */
  private onceAuthenticated: (() => void) | null = null;

  /** Provider for chatCursors (injected to avoid circular dependency with store). */
  private chatCursorsProvider: (() => Record<string, string>) | null = null;

  /** Provider for persisted control cursor (for cold-start offline recovery). */
  private controlCursorProvider: (() => string) | null = null;

  private constructor() {}

  static getInstance(): RelayClient {
    if (!RelayClient.instance) {
      RelayClient.instance = new RelayClient();
    }
    return RelayClient.instance;
  }

  /**
   * Set the E2E session key (shared secret from ECDH key exchange).
   * Once set, all payloads are encrypted before sending and decrypted on receive.
   */
  setSessionKey(sessionKey: Uint8Array): void {
    this.sessionKey = sessionKey;
  }

  /**
   * Clear the E2E session key (on disconnect).
   */
  clearSessionKey(): void {
    this.sessionKey = null;
  }

  /**
   * Set provider for chat stream cursors (for offline cron recovery).
   * Called on reconnect to include per-session cursors in authenticate payload.
   */
  setChatCursorsProvider(provider: () => Record<string, string>): void {
    this.chatCursorsProvider = provider;
  }

  /**
   * Set provider for persisted control cursor (for cold-start recovery).
   */
  setControlCursorProvider(provider: () => string): void {
    this.controlCursorProvider = provider;
  }

  /**
   * Encrypt a plaintext string using the E2E session key (NaCl secretbox).
   */
  private encrypt(plaintext: string): EncryptedPayload {
    if (!this.sessionKey) {
      throw new Error('E2E session key not established');
    }
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageBytes = new TextEncoder().encode(plaintext);
    const ciphertext = nacl.secretbox(messageBytes, nonce, this.sessionKey);
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
        // v0.3.0: Do NOT set connected=true until 'authenticated' response
        this.reconnectAttempts = 0;

        // Authenticate — use persisted cursors for cold-start offline recovery
        const persistedControlCursor = this.controlCursorProvider ? this.controlCursorProvider() : '0';
        const effectiveControlCursor = this.lastStreamId !== '0' ? this.lastStreamId : persistedControlCursor;
        this.ws!.send(JSON.stringify({
          type: 'authenticate',
          payload: {
            userId: this.userId,
            token: this.authToken,
            lastStreamId: effectiveControlCursor,
            chatCursors: this.chatCursorsProvider ? this.chatCursorsProvider() : {},
          },
        }));

        // v0.3.0: Set auth timeout — if no 'authenticated' response in 10s, reconnect
        const authTimeout = setTimeout(() => {
          if (!this.connected) {
            console.warn('[RelayClient] Authentication timeout — reconnecting');
            this.ws?.close(4002, 'Authentication timeout');
          }
        }, 10000);

        // v0.3.0: Wait for 'authenticated' message before resolving
        this.onceAuthenticated = () => {
          clearTimeout(authTimeout);
          this.connected = true;
          this.startHeartbeat();
          this.notifyConnectionHandlers(true);
          resolve();
        };
      };

      const onMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(typeof event.data === 'string' ? event.data : '');

          // v0.3.0: Handle 'authenticated' response
          if (data.type === 'authenticated') {
            if (this.onceAuthenticated) {
              this.onceAuthenticated();
              this.onceAuthenticated = null;
            }
            return;
          }

          // v0.3.0: Handle auth failure — relay closes socket
          if (data.type === 'error' && !this.connected) {
            console.error('[RelayClient] Auth error:', data.message);
            return;
          }

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
  /** F27: Token refresh callback — set by app to auto-refresh before reconnect */
  private tokenRefresher: (() => Promise<string | null>) | null = null;

  setTokenRefresher(refresher: () => Promise<string | null>): void {
    this.tokenRefresher = refresher;
  }

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

      // F27: Auto-refresh token before reconnect
      if (this.tokenRefresher) {
        const newToken = await this.tokenRefresher();
        if (newToken) {
          this.authToken = newToken;
        } else {
          // Refresh failed — stop reconnecting, app should navigate to login
          console.warn('[RelayClient] Token refresh failed — stopping reconnect');
          return;
        }
      }

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
        wallet_create: 'wallet_create',
        wallet_delete: 'wallet_delete',
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
        } else if (data.type === 'wallet_create' || data.type === 'wallet_delete') {
          // Wallet lifecycle responses don't have txHash
          if ((data as any).ok) {
            resolve({ txHash: '' });
          } else {
            reject(new Error((data as any).error ?? 'Wallet operation failed'));
          }
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
   * Request relay to start polling a chat stream for a newly discovered session.
   * Used for offline cron recovery: after control replay reveals cron_session_created,
   * the app requests chat history for that session.
   */
  async subscribeChatStream(sessionId: string): Promise<void> {
    this.ensureConnected();
    this.ws!.send(JSON.stringify({
      type: 'subscribe_chat',
      payload: { sessionId },
    }));
  }

  /**
   * Cancel a queued message (not yet processing) via control channel.
   */
  async cancelQueued(messageId: string): Promise<void> {
    await this.sendControl({
      type: 'cancel_queued',
      payload: { messageId },
    });
  }

  /**
   * Cancel an actively processing message via control channel.
   */
  async cancelActive(messageId: string): Promise<void> {
    await this.sendControl({
      type: 'cancel_active',
      payload: { messageId },
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
