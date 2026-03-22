import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useAuthStore } from '../../../stores/useAuthStore';

const RELAY_BASE_URL = process.env.EXPO_PUBLIC_RELAY_URL || 'http://localhost:3000';
const CODE_LENGTH = 8;

/**
 * F30: Enrollment code input screen.
 *
 * 8-character PIN-style input with auto-dash between 4th and 5th characters.
 * User enters the code displayed on the daemon terminal to bind their account.
 */
export function EnrollmentScreen({ onEnrolled, onSkip }: { onEnrolled: () => void, onSkip?: (() => void) | undefined }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const token = useAuthStore(s => s.token);
  const hiddenInputRef = useRef<TextInput>(null);

  const handleChangeText = (text: string) => {
    const cleaned = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, CODE_LENGTH);
    setCode(cleaned);
  };

  const formattedCode = code.length > 4
    ? code.slice(0, 4) + '-' + code.slice(4)
    : code;

  const handleConfirm = async () => {
    if (code.length !== CODE_LENGTH) return;
    setLoading(true);

    try {
      const res = await fetch(`${RELAY_BASE_URL}/api/auth/enroll/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ enrollmentCode: code.slice(0, 4) + '-' + code.slice(4) }),
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      await res.json();
      onEnrolled();
    } catch (err: unknown) {
      Alert.alert('Enrollment Failed', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const chars = code.split('');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect to Daemon</Text>
      <Text style={styles.subtitle}>Enter the code shown on your daemon terminal</Text>

      <TouchableOpacity
        style={styles.codeRow}
        activeOpacity={1}
        onPress={() => hiddenInputRef.current?.focus()}
      >
        {Array.from({ length: CODE_LENGTH }).map((_, i) => (
          <React.Fragment key={i}>
            {i === 4 && <Text style={styles.dash}>-</Text>}
            <View style={[
              styles.cell,
              i === code.length && styles.cellFocused,
              chars[i] && styles.cellFilled,
            ]}>
              <Text style={styles.cellText}>{chars[i] ?? ''}</Text>
            </View>
          </React.Fragment>
        ))}
      </TouchableOpacity>

      <TextInput
        ref={hiddenInputRef}
        style={styles.hiddenInput}
        value={code}
        onChangeText={handleChangeText}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        maxLength={CODE_LENGTH}
        caretHidden
      />

      <TouchableOpacity
        style={[styles.button, code.length !== CODE_LENGTH && styles.buttonDisabled]}
        onPress={handleConfirm}
        disabled={loading || code.length !== CODE_LENGTH}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Confirm</Text>
        )}
      </TouchableOpacity>

      {onSkip && (
        <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, fontWeight: '400', color: '#6b7280', marginBottom: 48, textAlign: 'center' },
  codeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  cell: {
    width: 40, height: 52,
    borderRadius: 12,
    borderWidth: 1, borderColor: '#1f1f1f',
    backgroundColor: '#111',
    justifyContent: 'center', alignItems: 'center',
    marginHorizontal: 3,
  },
  cellFocused: { borderColor: '#3b82f6' },
  cellFilled: { borderColor: '#333', backgroundColor: '#1a1a1a' },
  cellText: { fontSize: 22, fontWeight: '700', color: '#fff', fontFamily: 'Menlo' },
  dash: { fontSize: 20, color: '#333', marginHorizontal: 6 },
  hiddenInput: { position: 'absolute', opacity: 0, height: 0, width: 0 },
  button: { backgroundColor: '#3b82f6', paddingVertical: 16, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12 },
  buttonDisabled: { opacity: 0.35 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  skipButton: { paddingVertical: 12 },
  skipText: { color: '#6b7280', fontSize: 14 },
});
