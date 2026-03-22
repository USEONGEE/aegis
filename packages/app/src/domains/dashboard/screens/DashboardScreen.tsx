import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { RelayClient } from '../../../core/relay/RelayClient';

/**
 * DashboardScreen — Balances and positions overview.
 *
 * Data comes from daemon via Relay:
 * - Balances: native + ERC20 token balances per chain
 * - Positions: DeFi positions placeholder (Aave, Uniswap, etc.)
 *
 * In Phase 1 this is read-only. AI manages positions via tool_calls.
 */

interface TokenBalance {
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  chainId: number;
  contractAddress?: string;
}

interface DeFiPosition {
  protocol: string;
  type: string;           // 'lending', 'lp', 'perp', etc.
  chainId: number;
  description: string;
  valueUSD: string;
  healthFactor?: string;
}

export function DashboardScreen() {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [positions, setPositions] = useState<DeFiPosition[]>([]);
  const [totalUSD, setTotalUSD] = useState('0.00');
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);

  const relay = RelayClient.getInstance();

  // Step 09: Subscribe to event_stream events for real-time balance/position updates
  useEffect(() => {
    const handler = (message: { channel: string; payload: unknown }) => {
      if (message.channel !== 'control') return;
      const data = message.payload as {
        type?: string;
        eventName?: string;
        event?: Record<string, unknown>;
        balances?: TokenBalance[];
        positions?: DeFiPosition[];
      };

      // Handle event_stream from daemon (ExecutionSettled / ExecutionBroadcasted carry balance updates)
      if (data.type === 'event_stream') {
        if (
          (data.eventName === 'ExecutionSettled' || data.eventName === 'ExecutionBroadcasted') &&
          data.event
        ) {
          // Extract balances/positions from event payload if available
          const eventBalances = data.event.balances as TokenBalance[] | undefined;
          const eventPositions = data.event.positions as DeFiPosition[] | undefined;
          if (eventBalances) {
            setBalances(eventBalances);
            const total = eventBalances.reduce(
              (sum, b) => sum + parseFloat(b.usdValue || '0'),
              0,
            );
            setTotalUSD(total.toFixed(2));
          }
          if (eventPositions) {
            setPositions(eventPositions);
          }
        }
        return;
      }

      // Also handle direct balance_update / position_update for backward compat
      if (data.type === 'balance_update' && data.balances) {
        setBalances(data.balances);
        const total = data.balances.reduce(
          (sum, b) => sum + parseFloat(b.usdValue || '0'),
          0,
        );
        setTotalUSD(total.toFixed(2));
      }

      if (data.type === 'position_update' && data.positions) {
        setPositions(data.positions);
      }
    };

    relay.addMessageHandler(handler);

    const connHandler = (isConnected: boolean) => setConnected(isConnected);
    relay.addConnectionHandler(connHandler);

    return () => {
      relay.removeMessageHandler(handler);
      relay.removeConnectionHandler(connHandler);
    };
  }, [relay]);

  // Step 09: Manual refresh via chat — ask AI to fetch balances
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const sessionId = `dashboard_refresh_${Date.now()}`;
      await relay.sendChat(sessionId, {
        role: 'user',
        content: 'Show my current wallet balances and DeFi positions.',
      });

      // Listen for the chat response with balance data
      const responseHandler = (message: { channel: string; payload: unknown; sessionId: string | null }) => {
        if (message.channel !== 'chat' || message.sessionId !== sessionId) return;
        const data = message.payload as {
          role?: string;
          content?: string;
          toolResults?: Array<{
            name?: string;
            result?: { balances?: TokenBalance[]; positions?: DeFiPosition[] };
          }>;
        };
        if (data.role === 'assistant' && data.toolResults) {
          for (const tr of data.toolResults) {
            if (tr.result?.balances) {
              setBalances(tr.result.balances);
              const total = tr.result.balances.reduce(
                (sum, b) => sum + parseFloat(b.usdValue || '0'),
                0,
              );
              setTotalUSD(total.toFixed(2));
            }
            if (tr.result?.positions) {
              setPositions(tr.result.positions);
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
    setTimeout(() => setRefreshing(false), 1000);
  }, [relay]);

  return (
    <View style={styles.container}>
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
      {balances.length === 0 ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            No balance data yet. Connect to your daemon to see wallet balances.
          </Text>
        </View>
      ) : (
        <FlatList
          data={balances}
          keyExtractor={(item) => `${item.chainId}-${item.symbol}-${item.contractAddress ?? 'native'}`}
          renderItem={({ item }) => <BalanceRow token={item} />}
          scrollEnabled={false}
          style={styles.list}
        />
      )}

      {/* Positions */}
      <Text style={styles.sectionHeader}>DeFi Positions</Text>
      {positions.length === 0 ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            No positions yet. Ask your AI agent to deploy capital on DeFi protocols.
          </Text>
        </View>
      ) : (
        <FlatList
          data={positions}
          keyExtractor={(item, i) => `${item.protocol}-${item.type}-${i}`}
          renderItem={({ item }) => <PositionRow position={item} />}
          scrollEnabled={false}
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3b82f6" />
          }
        />
      )}
    </View>
  );
}

// --- Balance Row ---

function BalanceRow({ token }: { token: TokenBalance }) {
  return (
    <View style={styles.row}>
      <View style={styles.tokenInfo}>
        <Text style={styles.tokenSymbol}>{token.symbol}</Text>
        <Text style={styles.tokenChain}>{token.chainId}</Text>
      </View>
      <View style={styles.tokenValues}>
        <Text style={styles.tokenBalance}>{token.balance}</Text>
        <Text style={styles.tokenUSD}>${token.usdValue}</Text>
      </View>
    </View>
  );
}

// --- Position Row ---

function PositionRow({ position }: { position: DeFiPosition }) {
  return (
    <View style={styles.row}>
      <View style={styles.tokenInfo}>
        <Text style={styles.tokenSymbol}>{position.protocol}</Text>
        <Text style={styles.tokenChain}>
          {position.type} on {position.chainId}
        </Text>
      </View>
      <View style={styles.tokenValues}>
        <Text style={styles.tokenBalance}>{position.description}</Text>
        <Text style={styles.tokenUSD}>${position.valueUSD}</Text>
        {position.healthFactor && (
          <Text
            style={[
              styles.healthFactor,
              parseFloat(position.healthFactor) < 1.5 ? styles.healthDanger : styles.healthSafe,
            ]}
          >
            HF: {position.healthFactor}
          </Text>
        )}
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
    width: 6,
    height: 6,
    borderRadius: 3,
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
    fontSize: 15,
    fontWeight: '600',
    color: '#9ca3af',
    paddingHorizontal: 16,
    paddingVertical: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  list: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
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
  healthFactor: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  healthSafe: {
    color: '#22c55e',
  },
  healthDanger: {
    color: '#ef4444',
  },
});
