import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Pressable,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { RelayClient } from '../../../core/relay/RelayClient';
import { useWalletStore } from '../../../stores/useWalletStore';
import { useToast } from '../../../shared/ui/ToastProvider';
import { SignedApprovalBuilder } from '../../../core/approval/SignedApprovalBuilder';
import { IdentityKeyManager } from '../../../core/identity/IdentityKeyManager';

/**
 * DashboardScreen — Wallet address display + portfolio overview.
 *
 * v0.5.6: Fetches balances + USD prices from daemon via query channel.
 * v0.5.10: Wallet address display, wallet list/selection, add/delete.
 */

interface TokenBalance {
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  chainId: number;
  address: string;
}

interface PortfolioData {
  balances: TokenBalance[];
  totalUSD: string;
}

interface StoredWallet {
  accountIndex: number;
  name: string;
  createdAt: number;
}

// --- Helpers ---

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Main Screen ---

export function DashboardScreen() {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [totalUSD, setTotalUSD] = useState('0.00');
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [walletActionLoading, setWalletActionLoading] = useState(false);

  const relay = RelayClient.getInstance();
  const { showToast } = useToast();

  const selectedAccountIndex = useWalletStore((s) => s.selectedAccountIndex);
  const wallets = useWalletStore((s) => s.wallets);
  const addresses = useWalletStore((s) => s.addresses);
  const selectWallet = useWalletStore((s) => s.selectWallet);
  const setWallets = useWalletStore((s) => s.setWallets);
  const setAddress = useWalletStore((s) => s.setAddress);

  const currentAddress = addresses[selectedAccountIndex] ?? '';

  // --- Data fetching ---

  const fetchWalletAddress = useCallback(async (accountIndex: number) => {
    try {
      const result = await relay.query<{ address: string }>('getWalletAddress', {
        chain: 'ethereum',
        accountIndex,
      });
      setAddress(accountIndex, result.address);
    } catch (_err: unknown) {
      void _err;
    }
  }, [relay, setAddress]);

  const fetchWalletList = useCallback(async () => {
    try {
      const result = await relay.query<StoredWallet[]>('walletList', {});
      setWallets(result);
    } catch (_err: unknown) {
      void _err;
    }
  }, [relay, setWallets]);

  const fetchPortfolio = useCallback(async () => {
    try {
      const result = await relay.query<PortfolioData>('getPortfolio', { accountIndex: selectedAccountIndex }, 30_000);
      setBalances(result.balances);
      setTotalUSD(result.totalUSD);
    } catch (_err: unknown) {
      void _err;
    } finally {
      setLoading(false);
    }
  }, [relay, selectedAccountIndex]);

  const fetchAll = useCallback(async () => {
    await Promise.all([
      fetchWalletList(),
      fetchWalletAddress(selectedAccountIndex),
      fetchPortfolio(),
    ]);
  }, [fetchWalletList, fetchWalletAddress, fetchPortfolio, selectedAccountIndex]);

  // Fetch on mount + connection
  useEffect(() => {
    const connHandler = (isConnected: boolean) => {
      setConnected(isConnected);
      if (isConnected) {
        fetchAll();
      }
    };
    relay.addConnectionHandler(connHandler);

    if (relay.isConnected()) {
      setConnected(true);
      fetchAll();
    }

    return () => {
      relay.removeConnectionHandler(connHandler);
    };
  }, [relay, fetchAll]);

  // Re-fetch when selected wallet changes
  useEffect(() => {
    if (!connected) return;
    setLoading(true);
    fetchWalletAddress(selectedAccountIndex);
    fetchPortfolio();
  }, [selectedAccountIndex, connected, fetchWalletAddress, fetchPortfolio]);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // --- Wallet actions ---

  const handleCopyAddress = useCallback(async () => {
    if (!currentAddress) return;
    await Clipboard.setStringAsync(currentAddress);
    showToast('Address copied', 'success');
  }, [currentAddress, showToast]);

  const handleSelectWallet = useCallback((accountIndex: number) => {
    selectWallet(accountIndex);
  }, [selectWallet]);

  const handleAddWallet = useCallback(async () => {
    setWalletActionLoading(true);
    try {
      const identity = IdentityKeyManager.getInstance();
      const keyPair = await identity.load();
      if (!keyPair) {
        showToast('Identity key not found', 'error');
        return;
      }

      const nextIndex = wallets.length > 0
        ? Math.max(...wallets.map((w) => w.accountIndex)) + 1
        : 0;

      const builder = new SignedApprovalBuilder(keyPair);
      const signedApproval = builder.forWallet({
        type: 'wallet_create',
        targetHash: `wallet_create_${nextIndex}`,
        chainId: 0,
        requestId: generateId(),
        accountIndex: nextIndex,
        content: `Wallet ${nextIndex}`,
      });

      await relay.sendApproval(signedApproval);
      await fetchWalletList();
      selectWallet(nextIndex);
      await fetchWalletAddress(nextIndex);
      showToast(`Wallet ${nextIndex} created`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Failed: ${msg}`, 'error');
    } finally {
      setWalletActionLoading(false);
    }
  }, [wallets, relay, fetchWalletList, selectWallet, fetchWalletAddress, showToast]);

  const handleDeleteWallet = useCallback((accountIndex: number) => {
    if (wallets.length <= 1) return;

    Alert.alert(
      'Delete Wallet',
      `Delete Wallet ${accountIndex}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setWalletActionLoading(true);
            try {
              const identity = IdentityKeyManager.getInstance();
              const keyPair = await identity.load();
              if (!keyPair) {
                showToast('Identity key not found', 'error');
                return;
              }

              const builder = new SignedApprovalBuilder(keyPair);
              const signedApproval = builder.forWallet({
                type: 'wallet_delete',
                targetHash: `wallet_delete_${accountIndex}`,
                chainId: 0,
                requestId: generateId(),
                accountIndex,
                content: `Delete Wallet ${accountIndex}`,
              });

              await relay.sendApproval(signedApproval);
              await fetchWalletList();

              if (selectedAccountIndex === accountIndex) {
                selectWallet(0);
              }
              showToast(`Wallet ${accountIndex} deleted`, 'success');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              showToast(`Failed: ${msg}`, 'error');
            } finally {
              setWalletActionLoading(false);
            }
          },
        },
      ],
    );
  }, [wallets, selectedAccountIndex, relay, fetchWalletList, selectWallet, showToast]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3b82f6" />
      }
    >
      {/* Wallet Address */}
      <Pressable style={styles.addressSection} onPress={handleCopyAddress}>
        <Text style={styles.addressLabel}>Wallet Address</Text>
        <Text style={styles.addressValue}>
          {currentAddress ? truncateAddress(currentAddress) : 'Loading...'}
        </Text>
        {currentAddress ? (
          <Text style={styles.addressHint}>Tap to copy</Text>
        ) : null}
      </Pressable>

      {/* Total Portfolio Value */}
      <View style={styles.portfolioHeader}>
        <Text style={styles.portfolioLabel}>Total Portfolio Value</Text>
        <Text style={styles.portfolioValue}>${totalUSD}</Text>
        <View style={styles.connectionRow}>
          <View style={[styles.dot, connected ? styles.connectedDot : styles.disconnectedDot]} />
          <Text style={styles.connectionText}>
            {connected ? 'Live' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Wallet List */}
      <View style={styles.walletListHeader}>
        <Text style={styles.sectionHeader}>Wallets</Text>
        <Pressable
          onPress={handleAddWallet}
          disabled={walletActionLoading}
          style={styles.addButton}
        >
          <Text style={[styles.addButtonText, walletActionLoading && styles.disabledText]}>
            + Add
          </Text>
        </Pressable>
      </View>

      {wallets.length === 0 ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>No wallets found. Add one to get started.</Text>
        </View>
      ) : (
        wallets.map((wallet) => (
          <WalletRow
            key={wallet.accountIndex}
            wallet={wallet}
            address={addresses[wallet.accountIndex]}
            isSelected={wallet.accountIndex === selectedAccountIndex}
            canDelete={wallets.length > 1}
            onSelect={() => handleSelectWallet(wallet.accountIndex)}
            onDelete={() => handleDeleteWallet(wallet.accountIndex)}
          />
        ))
      )}

      {/* Balances */}
      <Text style={styles.sectionHeader}>Balances</Text>
      {loading ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Loading portfolio...</Text>
        </View>
      ) : balances.length === 0 ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            No tokens with balance found on Hyperliquid EVM.
          </Text>
        </View>
      ) : (
        balances.map((token) => (
          <BalanceRow key={`${token.chainId}-${token.symbol}-${token.address}`} token={token} />
        ))
      )}
    </ScrollView>
  );
}

// --- Wallet Row ---

function WalletRow({ wallet, address, isSelected, canDelete, onSelect, onDelete }: {
  wallet: StoredWallet;
  address: string | undefined;
  isSelected: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable
      style={[styles.row, isSelected && styles.selectedRow]}
      onPress={onSelect}
      onLongPress={canDelete ? onDelete : undefined}
    >
      <View style={styles.tokenInfo}>
        <Text style={styles.tokenSymbol}>
          {wallet.name || `Wallet ${wallet.accountIndex}`}
        </Text>
        <Text style={styles.tokenChain}>
          {address ? truncateAddress(address) : `Account #${wallet.accountIndex}`}
        </Text>
      </View>
      {isSelected ? (
        <View style={styles.selectedBadge}>
          <Text style={styles.selectedBadgeText}>Active</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// --- Balance Row ---

function BalanceRow({ token }: { token: TokenBalance }) {
  return (
    <View style={styles.row}>
      <View style={styles.tokenInfo}>
        <Text style={styles.tokenSymbol}>{token.symbol}</Text>
        <Text style={styles.tokenChain}>{token.name}</Text>
      </View>
      <View style={styles.tokenValues}>
        <Text style={styles.tokenBalance}>{token.balance}</Text>
        <Text style={styles.tokenUSD}>${token.usdValue}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  addressSection: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  addressLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  addressValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    fontFamily: 'monospace',
  },
  addressHint: {
    fontSize: 11,
    color: '#4b5563',
    marginTop: 4,
  },
  portfolioHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  portfolioLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  portfolioValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
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
  connectionText: {
    fontSize: 12,
    color: '#6b7280',
  },
  walletListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 16,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  addButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginTop: 16,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3b82f6',
  },
  disabledText: {
    opacity: 0.4,
  },
  placeholder: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  placeholderText: {
    fontSize: 13,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  selectedRow: {
    backgroundColor: '#111827',
  },
  selectedBadge: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  selectedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
  },
  tokenInfo: {
    flex: 1,
  },
  tokenSymbol: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  tokenChain: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  tokenValues: {
    alignItems: 'flex-end',
  },
  tokenBalance: {
    fontSize: 14,
    color: '#ffffff',
  },
  tokenUSD: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
});
