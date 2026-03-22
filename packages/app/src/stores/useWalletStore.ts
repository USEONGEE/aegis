import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Wallet store — tracks selected wallet and wallet list.
 *
 * v0.5.10: Multi-wallet support.
 * - selectedAccountIndex is persisted (survives app restart).
 * - wallets and addresses are transient (re-fetched on connect).
 */

interface StoredWallet {
  accountIndex: number;
  name: string;
  createdAt: number;
}

interface WalletState {
  // Persisted
  selectedAccountIndex: number;

  // Transient (not persisted)
  wallets: StoredWallet[];
  addresses: Record<number, string>;
  isLoading: boolean;

  // Actions
  selectWallet: (accountIndex: number) => void;
  setWallets: (wallets: StoredWallet[]) => void;
  setAddress: (accountIndex: number, address: string) => void;
  reset: () => void;
}

export const useWalletStore = create(
  persist<WalletState>(
    (set) => ({
      selectedAccountIndex: 0,
      wallets: [],
      addresses: {},
      isLoading: false,

      selectWallet: (accountIndex) => set({ selectedAccountIndex: accountIndex }),

      setWallets: (wallets) => set({ wallets }),

      setAddress: (accountIndex, address) =>
        set((state) => ({
          addresses: { ...state.addresses, [accountIndex]: address },
        })),

      reset: () => set({ wallets: [], addresses: {}, isLoading: false }),
    }),
    {
      name: 'wdk-wallet-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) =>
        ({
          selectedAccountIndex: state.selectedAccountIndex,
        }) as unknown as WalletState,
    },
  ),
);
