import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useAuthStore } from '../../../stores/useAuthStore';

const RELAY_BASE_URL = process.env.EXPO_PUBLIC_RELAY_URL || 'http://localhost:3000';

/**
 * F30: Enrollment code input screen.
 *
 * User enters the code displayed on the daemon terminal (or scans QR)
 * to bind their account to a daemon.
 */
export function EnrollmentScreen({ onEnrolled, onSkip }: { onEnrolled: () => void, onSkip: () => void }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const token = useAuthStore(s => s.token);

  const handleConfirm = async () => {
    if (!code.trim()) return;
    setLoading(true);

    try {
      const res = await fetch(`${RELAY_BASE_URL}/api/auth/enroll/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ enrollmentCode: code.trim().toUpperCase() }),
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json() as { daemonId: string; userId: string; bound: boolean };
      Alert.alert('Connected', `Linked to daemon: ${data.daemonId}`, [
        { text: 'OK', onPress: onEnrolled },
      ]);
    } catch (err: any) {
      Alert.alert('Enrollment Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect to Daemon</Text>
      <Text style={styles.subtitle}>Enter the code shown on your daemon terminal</Text>

      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder="XXXX-XXXX"
        placeholderTextColor="#555"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={9}
      />

      <TouchableOpacity style={styles.button} onPress={handleConfirm} disabled={loading || !code.trim()}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Confirm</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 40, textAlign: 'center' },
  input: { backgroundColor: '#111', color: '#fff', fontSize: 24, fontFamily: 'monospace', textAlign: 'center', paddingVertical: 16, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: '#333', width: '100%', marginBottom: 24, letterSpacing: 4 },
  button: { backgroundColor: '#4285F4', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 8, width: '100%', alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  skipButton: { paddingVertical: 10 },
  skipText: { color: '#555', fontSize: 14 },
});
