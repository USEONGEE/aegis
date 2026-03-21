import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { IdentityKeyManager } from '../../../core/identity/IdentityKeyManager';
import { RelayClient, type RelayMessage } from '../../../core/relay/RelayClient';
import { SignedApprovalBuilder } from '../../../core/approval/SignedApprovalBuilder';
import { useToast } from '../../../shared/ui/ToastProvider';

/**
 * SettingsScreen — Signer management.
 *
 * Features:
 * - Identity key info (public key hex)
 * - Paired signers list with revoke option
 * - Connection status
 */

interface PairedSigner {
  publicKey: string;
  name?: string;
  type: 'app' | 'daemon';
  registeredAt: number;
  isRevoked: boolean;
}

export function SettingsScreen() {
  const [publicKeyHex, setPublicKeyHex] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [signers, setSigners] = useState<PairedSigner[]>([]);
  const [connected, setConnected] = useState(false);
  const { showToast } = useToast();

  // Singletons — stable references, safe in dependency arrays
  const identity = React.useMemo(() => IdentityKeyManager.getInstance(), []);
  const relay = React.useMemo(() => RelayClient.getInstance(), []);

  // Load identity on mount
  useEffect(() => {
    (async () => {
      const pubKey = await identity.getPublicKeyHex();
      const devId = await identity.getDeviceId();
      setPublicKeyHex(pubKey);
      setDeviceId(devId);
    })();
  }, [identity]);

  // Step 09: Listen for event_stream signer events + fetch signer list via chat
  useEffect(() => {
    const handler = (message: RelayMessage) => {
      if (message.channel !== 'control') return;
      const data = message.payload as {
        type?: string;
        eventName?: string;
        event?: Record<string, unknown>;
        signers?: PairedSigner[];
      };

      // Handle event_stream SignerRevoked events
      if (data.type === 'event_stream' && data.eventName === 'SignerRevoked') {
        // Refresh signer list via chat on signer revocation
        fetchSignerListViaChat();
        return;
      }

      // Backward compat: direct signer_list control messages
      if (data.type === 'signer_list' && data.signers) {
        setSigners(data.signers);
      }
    };

    relay.addMessageHandler(handler);

    const connHandler = (isConnected: boolean) => {
      setConnected(isConnected);
      // Fetch signer list on connect
      if (isConnected) fetchSignerListViaChat();
    };
    relay.addConnectionHandler(connHandler);

    return () => {
      relay.removeMessageHandler(handler);
      relay.removeConnectionHandler(connHandler);
    };
  }, [relay]);

  // Fetch signer list via chat (Step 09: no dedicated control message)
  const fetchSignerListViaChat = useCallback(async () => {
    try {
      const sessionId = `signer_list_${Date.now()}`;
      await relay.sendChat(sessionId, {
        role: 'user',
        content: 'List my paired signers.',
      });

      const responseHandler = (message: RelayMessage) => {
        if (message.channel !== 'chat' || message.sessionId !== sessionId) return;
        const data = message.payload as {
          role?: string;
          toolResults?: Array<{
            name?: string;
            result?: { signers?: PairedSigner[] };
          }>;
        };
        if (data.role === 'assistant' && data.toolResults) {
          for (const tr of data.toolResults) {
            if (tr.result?.signers) {
              setSigners(tr.result.signers);
            }
          }
          relay.removeMessageHandler(responseHandler);
        }
      };
      relay.addMessageHandler(responseHandler);

      // Auto-cleanup after timeout
      setTimeout(() => relay.removeMessageHandler(responseHandler), 30_000);
    } catch {
      // Will retry on reconnect
    }
  }, [relay]);

  // Generate identity key
  const handleGenerateKey = useCallback(async () => {
    Alert.alert(
      'Generate New Identity Key',
      'This will replace your existing identity key. You will need to re-enroll with your daemon. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          style: 'destructive',
          onPress: async () => {
            await identity.generate();
            const pubKey = await identity.getPublicKeyHex();
            const devId = await identity.getDeviceId();
            setPublicKeyHex(pubKey);
            setDeviceId(devId);
            showToast('Identity key generated', 'success');
          },
        },
      ],
    );
  }, [identity, showToast]);

  // Revoke a signer — builds a proper SignedApproval via SignedApprovalBuilder
  const handleRevoke = useCallback(
    (signer: PairedSigner) => {
      const displayName = signer.name ?? `${signer.publicKey.slice(0, 8)}...${signer.publicKey.slice(-4)}`;
      Alert.alert(
        'Revoke Signer',
        `Revoke "${displayName}"? This signer will no longer be able to sign approvals.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Revoke',
            style: 'destructive',
            onPress: async () => {
              try {
                const keyPair = await identity.getKeyPair();
                if (!keyPair) {
                  showToast('No identity key — cannot sign revocation', 'error');
                  return;
                }
                const builder = new SignedApprovalBuilder(keyPair);
                const signedApproval = builder.forDeviceRevoke({
                  targetPublicKey: signer.publicKey,
                  chainId: 1, // ethereum mainnet
                  accountIndex: 0,
                  content: `Revoke signer ${signer.publicKey.slice(0, 16)}`,
                });
                await relay.sendApproval(signedApproval);
                showToast('Signer revoke request sent', 'info');
              } catch (e) {
                showToast('Failed to revoke signer', 'error');
              }
            },
          },
        ],
      );
    },
    [relay, identity, showToast],
  );

  // Delete identity key
  const handleDeleteKey = useCallback(async () => {
    Alert.alert(
      'Delete Identity Key',
      'This will delete your identity key. You will need to generate a new one and re-enroll. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await identity.delete();
            setPublicKeyHex(null);
            setDeviceId(null);
            showToast('Identity key deleted', 'info');
          },
        },
      ],
    );
  }, [identity, showToast]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Identity Section */}
      <Text style={styles.sectionHeader}>Identity</Text>
      <View style={styles.card}>
        {publicKeyHex ? (
          <>
            <View style={styles.row}>
              <Text style={styles.label}>Public Key</Text>
              <Text style={styles.monoValue} numberOfLines={1}>
                {publicKeyHex.slice(0, 18)}...{publicKeyHex.slice(-8)}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Device ID</Text>
              <Text style={styles.monoValue}>{deviceId ?? '-'}</Text>
            </View>
            <View style={styles.buttonGroup}>
              <Pressable style={styles.secondaryButton} onPress={handleGenerateKey}>
                <Text style={styles.secondaryButtonText}>Regenerate Key</Text>
              </Pressable>
              <Pressable style={styles.dangerButton} onPress={handleDeleteKey}>
                <Text style={styles.dangerButtonText}>Delete Key</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.noKeyState}>
            <Text style={styles.noKeyText}>No identity key found</Text>
            <Pressable style={styles.primaryButton} onPress={handleGenerateKey}>
              <Text style={styles.primaryButtonText}>Generate Identity Key</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Connection Status */}
      <Text style={styles.sectionHeader}>Connection</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, connected ? styles.connectedDot : styles.disconnectedDot]} />
            <Text style={styles.value}>{connected ? 'Connected' : 'Disconnected'}</Text>
          </View>
        </View>
      </View>

      {/* Signers Section */}
      <Text style={styles.sectionHeader}>Paired Signers</Text>
      <View style={styles.card}>
        {signers.length === 0 ? (
          <Text style={styles.emptyText}>No paired signers</Text>
        ) : (
          signers.map((signer) => (
            <View key={signer.publicKey} style={styles.deviceRow}>
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>
                  {signer.name ?? `${signer.publicKey.slice(0, 8)}...${signer.publicKey.slice(-4)}`}
                </Text>
                <Text style={styles.deviceMeta}>
                  {signer.type} | {new Date(signer.registeredAt).toLocaleDateString()}
                </Text>
                {signer.isRevoked && (
                  <Text style={styles.revokedBadge}>REVOKED</Text>
                )}
              </View>
              {!signer.isRevoked && signer.publicKey !== publicKeyHex && (
                <Pressable
                  style={styles.revokeButton}
                  onPress={() => handleRevoke(signer)}
                >
                  <Text style={styles.revokeButtonText}>Revoke</Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </View>

      {/* App Info */}
      <Text style={styles.sectionHeader}>About</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>App</Text>
          <Text style={styles.value}>WDK-APP v0.1.0</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Crypto</Text>
          <Text style={styles.value}>Ed25519 + Curve25519 (tweetnacl)</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Storage</Text>
          <Text style={styles.value}>Expo SecureStore</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9ca3af',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#111111',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    color: '#6b7280',
  },
  value: {
    fontSize: 14,
    color: '#ffffff',
  },
  monoValue: {
    fontSize: 12,
    fontFamily: 'Menlo',
    color: '#9ca3af',
    maxWidth: '60%',
    textAlign: 'right',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  connectedDot: {
    backgroundColor: '#22c55e',
  },
  disconnectedDot: {
    backgroundColor: '#ef4444',
  },
  noKeyState: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  noKeyText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 13,
    color: '#4b5563',
    textAlign: 'center',
    paddingVertical: 16,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  dangerButton: {
    flex: 1,
    backgroundColor: '#450a0a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  dangerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  deviceMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  revokedBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ef4444',
    marginTop: 2,
  },
  revokeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#450a0a',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  revokeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef4444',
  },
});
