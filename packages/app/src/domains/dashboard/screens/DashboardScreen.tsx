import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { RelayClient } from '../../../core/relay/RelayClient';

/**
 * DashboardScreen — Portfolio overview with real token balances.
 *
 * v0.5.6: Fetches balances + USD prices from daemon via query channel.
 * Daemon queries 999-chain (Hyperliquid EVM) token balances + Enso pricing.
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

export function DashboardScreen() {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [totalUSD, setTotalUSD] = useState('0.00');
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const relay = RelayClient.getInstance();

  // v0.5.6: Fetch portfolio via query channel
  const fetchPortfolio = useCallback(async () => {
    try {
      const result = await relay.query<PortfolioData>('getPortfolio', { accountIndex: 0 }, 30_000);
      setBalances(result.balances);
      setTotalUSD(result.totalUSD);
    } catch (_err: unknown) {
      // Silently fail — keep existing data
    } finally {
      setLoading(false);
    }
  }, [relay]);

  // Fetch on mount + connection
  useEffect(() => {
    const connHandler = (isConnected: boolean) => {
      setConnected(isConnected);
      if (isConnected) {
        fetchPortfolio();
      }
    };
    relay.addConnectionHandler(connHandler);

    // If already connected, fetch immediately
    if (relay.isConnected()) {
      fetchPortfolio();
    }

    return () => {
      relay.removeConnectionHandler(connHandler);
    };
  }, [relay, fetchPortfolio]);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPortfolio();
    setRefreshing(false);
  }, [fetchPortfolio]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3b82f6" />
      }
    >
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
  portfolioHeader: {
    alignItems: 'center',
    paddingVertical: 32,
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
