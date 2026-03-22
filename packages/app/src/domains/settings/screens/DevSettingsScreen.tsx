import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Alert, StyleSheet } from 'react-native';
import { useAuthStore } from '../../../stores/useAuthStore';
import { RelayClient } from '../../../core/relay/RelayClient';
import { IdentityKeyManager } from '../../../core/identity/IdentityKeyManager';

/**
 * DevScreen — Developer tools and account management.
 *
 * - Logout
 * - Connection status
 * - Identity key info
 * - Relay URL
 */
export function DevSettingsScreen() {
  const logout = useAuthStore(s => s.logout);
  const userId = useAuthStore(s => s.userId);
  const [connected, setConnected] = useState(false);
  const [publicKeyHex, setPublicKeyHex] = useState<string | null>(null);

  const relay = React.useMemo(() => RelayClient.getInstance(), []);
  const identity = React.useMemo(() => IdentityKeyManager.getInstance(), []);

  useEffect(() => {
    setConnected(relay.isConnected());
    const handler = (isConnected: boolean) => setConnected(isConnected);
    relay.addConnectionHandler(handler);
    return () => relay.removeConnectionHandler(handler);
  }, [relay]);

  useEffect(() => {
    identity.getPublicKeyHex().then(setPublicKeyHex);
  }, [identity]);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          relay.disconnect();
          await logout();
        },
      },
    ]);
  };

  const handleClearEnrollment = () => {
    Alert.alert('Clear Enrollment', 'This will require re-enrollment on next login.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          const SecureStore = await import('expo-secure-store');
          await SecureStore.deleteItemAsync('wdk_enrollment_done');
        },
      },
    ]);
  };

  const relayUrl = process.env.EXPO_PUBLIC_RELAY_URL || 'http://localhost:3000';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Connection */}
      <Text style={styles.sectionHeader}>STATUS</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Relay</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, connected ? styles.dotOn : styles.dotOff]} />
            <Text style={styles.value}>{connected ? 'Connected' : 'Disconnected'}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>URL</Text>
          <Text style={styles.mono} numberOfLines={1}>{relayUrl}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>User</Text>
          <Text style={styles.value}>{userId ?? '-'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Public Key</Text>
          <Text style={styles.mono} numberOfLines={1}>
            {publicKeyHex ? `${publicKeyHex.slice(0, 12)}...${publicKeyHex.slice(-6)}` : '-'}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <Text style={styles.sectionHeader}>ACTIONS</Text>
      <View style={styles.card}>
        <Pressable style={styles.actionRow} onPress={handleClearEnrollment}>
          <Text style={styles.actionText}>Clear Enrollment</Text>
        </Pressable>
        <Pressable style={[styles.actionRow, styles.actionRowLast]} onPress={handleLogout}>
          <Text style={styles.dangerText}>Logout</Text>
        </Pressable>
      </View>

      {/* Info */}
      <Text style={styles.sectionHeader}>APP</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>0.1.0</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>SDK</Text>
          <Text style={styles.value}>Expo 54</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingBottom: 40 },
  sectionHeader: {
    fontSize: 12, fontWeight: '600', color: '#6b7280',
    paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#111', marginHorizontal: 16, borderRadius: 12, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  label: { fontSize: 14, color: '#6b7280' },
  value: { fontSize: 14, color: '#fff' },
  mono: { fontSize: 12, fontFamily: 'Menlo', color: '#9ca3af', maxWidth: '55%', textAlign: 'right' },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  dotOn: { backgroundColor: '#22c55e' },
  dotOff: { backgroundColor: '#ef4444' },
  actionRow: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  actionRowLast: { borderBottomWidth: 0 },
  actionText: { fontSize: 14, color: '#3b82f6' },
  dangerText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
});
