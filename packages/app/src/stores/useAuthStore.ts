import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'wdk_auth_token';
const REFRESH_KEY = 'wdk_refresh_token';
const USER_ID_KEY = 'wdk_user_id';

interface AuthState {
  userId: string | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  /** F26: Store tokens after Google OAuth success */
  setAuth: (userId: string, token: string, refreshToken: string) => Promise<void>;

  /** F27: Auto-refresh access token. Returns new token or null on failure. */
  refreshAccessToken: (relayBaseUrl: string) => Promise<string | null>;

  /** Load persisted auth from SecureStore on app start */
  loadPersistedAuth: () => Promise<void>;

  /** Clear auth (logout) */
  clearAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: async (userId, token, refreshToken) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
    await SecureStore.setItemAsync(USER_ID_KEY, userId);
    set({ userId, token, refreshToken, isAuthenticated: true });
  },

  refreshAccessToken: async (relayBaseUrl) => {
    const { refreshToken } = get();
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${relayBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        // Refresh failed — clear auth, user must re-login
        await get().clearAuth();
        return null;
      }

      const data = await res.json() as { token: string; refreshToken: string };
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);
      await SecureStore.setItemAsync(REFRESH_KEY, data.refreshToken);
      set({ token: data.token, refreshToken: data.refreshToken });
      return data.token;
    } catch {
      await get().clearAuth();
      return null;
    }
  },

  loadPersistedAuth: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
      const userId = await SecureStore.getItemAsync(USER_ID_KEY);

      if (token && refreshToken && userId) {
        set({ userId, token, refreshToken, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(USER_ID_KEY);
    set({ userId: null, token: null, refreshToken: null, isAuthenticated: false });
  },
}));
