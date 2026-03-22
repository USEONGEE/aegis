import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useAuthStore } from '../../../stores/useAuthStore';

const RELAY_BASE_URL = process.env.EXPO_PUBLIC_RELAY_URL || 'http://localhost:3000';

/**
 * F26: Google OAuth login screen.
 *
 * In production, this uses @react-native-google-signin/google-signin to get
 * an idToken, then exchanges it with the relay for app JWT + refresh token.
 *
 * For development, a simple userId/password form is also available.
 */
export function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore(s => s.setAuth);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual Google Sign-In when @react-native-google-signin is installed
      // const { idToken } = await GoogleSignin.signIn();
      // For now, use a development placeholder
      Alert.alert(
        'Google Sign-In',
        'Google Sign-In SDK not yet installed. Use development login instead.',
      );
    } catch (err: unknown) {
      Alert.alert('Sign-In Error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async () => {
    setLoading(true);
    try {
      // Development: register + login with test credentials
      const userId = `dev-user-${Date.now()}`;
      const password = 'devpassword123';

      // Register
      await fetch(`${RELAY_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });

      // Login
      const loginRes = await fetch(`${RELAY_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });

      if (!loginRes.ok) throw new Error('Login failed');

      const data = await loginRes.json() as { userId: string; token: string; refreshToken: string };
      await setAuth(data.userId, data.token, data.refreshToken);
    } catch (err: unknown) {
      Alert.alert('Login Error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>WDK</Text>
      <Text style={styles.subtitle}>AI DeFi Agent</Text>

      <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.googleText}>Sign in with Google</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.devButton} onPress={handleDevLogin} disabled={loading}>
        <Text style={styles.devText}>Development Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', padding: 20 },
  title: { fontSize: 48, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#888', marginBottom: 60 },
  googleButton: { backgroundColor: '#4285F4', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 8, width: '100%', alignItems: 'center', marginBottom: 16 },
  googleText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  devButton: { borderColor: '#333', borderWidth: 1, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 8, width: '100%', alignItems: 'center' },
  devText: { color: '#666', fontSize: 14 },
});
