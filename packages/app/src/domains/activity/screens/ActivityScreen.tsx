import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { RelayClient } from '../../../core/relay/RelayClient';
import { useWalletStore } from '../../../stores/useWalletStore';
import { useTxApproval } from '../../../shared/tx/TxApprovalContext';
import type { ApprovalRequest } from '../../../core/approval/types';

// --- Types ---

const DEMO_CHAIN_ID = 999;

interface DisplayPolicy {
  target: string;
  selector: string;
  decision: string;
}

interface PendingItem {
  requestId: string;
  chainId: number;
  reason: string;
  policies: DisplayPolicy[];
  createdAt: number;
  raw: ApprovalRequest;
}

type FetchStatus = 'idle' | 'loading' | 'error' | 'loaded';

// --- Helpers ---

interface DaemonCallPolicy {
  type: 'call';
  permissions: Record<string, Record<string, Array<{ decision: string }>>>;
}

function flattenCallPolicies(rawPolicies: unknown[]): DisplayPolicy[] {
  const result: DisplayPolicy[] = [];
  for (const raw of rawPolicies) {
    const p = raw as DaemonCallPolicy;
    if (p.type !== 'call' || !p.permissions) continue;
    for (const [target, selectors] of Object.entries(p.permissions)) {
      for (const [selector, rules] of Object.entries(selectors)) {
        result.push({
          target,
          selector,
          decision: rules[0]?.decision ?? 'ALLOW',
        });
      }
    }
  }
  return result;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * ActivityScreen — Policy view for current wallet.
 *
 * Shows active policies + pending policy requests for the selected accountIndex.
 * Queries daemon via relay.query() (non-persistent WS channel).
 * Refetches on: mount, accountIndex change, relay reconnect.
 */
export function ActivityScreen() {
  const relay = RelayClient.getInstance();
  const selectedAccountIndex = useWalletStore((s) => s.selectedAccountIndex);
  const addresses = useWalletStore((s) => s.addresses);
  const setAddress = useWalletStore((s) => s.setAddress);

  const [activePolicies, setActivePolicies] = useState<DisplayPolicy[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const { requestApproval } = useTxApproval();

  // Resolve wallet address (from store or query fallback)
  const fetchWalletAddress = useCallback(async () => {
    const cached = addresses[selectedAccountIndex];
    if (cached) {
      setWalletAddress(cached);
      return;
    }
    if (!relay.isConnected()) return;
    try {
      const result = await relay.query<{ address: string }>('getWalletAddress', {
        chain: '999',
        accountIndex: selectedAccountIndex,
      });
      setWalletAddress(result.address);
      setAddress(selectedAccountIndex, result.address);
    } catch (err: unknown) {
      console.warn('[Activity] getWalletAddress failed:', err instanceof Error ? err.message : String(err));
      setWalletAddress(null);
    }
  }, [selectedAccountIndex, addresses, relay, setAddress]);

  // Sync address from store (clear immediately on account switch)
  useEffect(() => {
    setWalletAddress(addresses[selectedAccountIndex] ?? null);
  }, [selectedAccountIndex, addresses]);

  const fetchPolicies = useCallback(async () => {
    setStatus('loading');
    try {
      const [policyData, approvalData] = await Promise.all([
        relay.query<unknown[]>('policyList', {
          accountIndex: selectedAccountIndex,
          chainId: DEMO_CHAIN_ID,
        }),
        relay.query<Array<{
          requestId: string;
          type: string;
          chainId: number;
          accountIndex: number;
          content: string;
          createdAt: number;
          policies: unknown[];
        }>>('pendingApprovals', { accountIndex: selectedAccountIndex }),
      ]);

      // Active policies: flatten call policies
      setActivePolicies(flattenCallPolicies(policyData));

      // Pending: filter policy type only
      const policyApprovals = approvalData.filter(a => a.type === 'policy');
      setPendingItems(policyApprovals.map(a => ({
        requestId: a.requestId,
        chainId: a.chainId,
        reason: a.content,
        policies: flattenCallPolicies(a.policies),
        createdAt: a.createdAt,
        raw: a as unknown as ApprovalRequest,
      })));

      setStatus('loaded');
    } catch (err: unknown) {
      console.warn('[Activity] fetchPolicies failed:', err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [relay, selectedAccountIndex]);

  const fetchAll = useCallback(() => {
    fetchPolicies();
    fetchWalletAddress();
  }, [fetchPolicies, fetchWalletAddress]);

  const handleApprove = useCallback((item: PendingItem) => {
    requestApproval(item.raw).then(() => fetchAll()).catch(() => {});
  }, [requestApproval, fetchAll]);

  const handleReject = useCallback((item: PendingItem) => {
    const rejectRequest: ApprovalRequest = { ...item.raw, type: 'policy_reject' };
    requestApproval(rejectRequest).then(() => fetchAll()).catch(() => {});
  }, [requestApproval, fetchAll]);

  // Refetch on mount + relay reconnect
  useEffect(() => {
    const connHandler = (isConnected: boolean) => {
      if (isConnected) fetchAll();
    };
    relay.addConnectionHandler(connHandler);
    if (relay.isConnected()) fetchAll();
    return () => relay.removeConnectionHandler(connHandler);
  }, [relay, fetchAll]);

  // Refetch on accountIndex change
  useEffect(() => {
    if (relay.isConnected()) fetchAll();
  }, [selectedAccountIndex, fetchAll]);

  // --- Render ---

  return (
    <View style={styles.container}>
      {/* Header: wallet address */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Wallet #{selectedAccountIndex}</Text>
        <Text style={styles.headerAddress}>
          {walletAddress ? shortenAddress(walletAddress) : 'Loading...'}
        </Text>
        <Text style={styles.headerChain}>Chain {DEMO_CHAIN_ID}</Text>
      </View>

      {/* Content */}
      {(status === 'idle' || status === 'loading') && (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.stateText}>Loading policies...</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>Failed to load policies</Text>
          <Text style={styles.stateSubtext}>Connection may be unavailable</Text>
          <Pressable style={styles.retryButton} onPress={fetchAll}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {status === 'loaded' && (
        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
          {/* Active Policies */}
          <Text style={styles.sectionTitle}>
            Active Policies ({activePolicies.length})
          </Text>
          {activePolicies.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptyText}>No active policies</Text>
            </View>
          ) : (
            activePolicies.map((p, i) => (
              <View key={`active_${i}`} style={styles.policyCard}>
                <View style={styles.policyHeader}>
                  <View style={[styles.badge, p.decision === 'ALLOW' ? styles.badgeAllow : styles.badgeReject]}>
                    <Text style={styles.badgeText}>{p.decision}</Text>
                  </View>
                </View>
                <Text style={styles.policyTarget} numberOfLines={1}>
                  {shortenAddress(p.target)}
                </Text>
                <Text style={styles.policySelector}>{p.selector}</Text>
              </View>
            ))
          )}

          {/* Pending Policies */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
            Pending Requests ({pendingItems.length})
          </Text>
          {pendingItems.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptyText}>No pending requests</Text>
            </View>
          ) : (
            pendingItems.map((item) => (
              <View key={item.requestId} style={styles.pendingCard}>
                <Text style={styles.pendingReason}>{item.reason}</Text>
                <Text style={styles.pendingMeta}>
                  Chain {item.chainId} | {new Date(item.createdAt).toLocaleString()}
                </Text>
                {item.policies.map((p, i) => (
                  <View key={`pending_${item.requestId}_${i}`} style={styles.pendingPolicy}>
                    <Text style={styles.pendingPolicyText}>
                      {shortenAddress(p.target)} :: {p.selector} [{p.decision}]
                    </Text>
                  </View>
                ))}
                <View style={styles.pendingActions}>
                  <Pressable style={styles.approveButton} onPress={() => handleApprove(item)}>
                    <Text style={styles.approveButtonText}>Approve</Text>
                  </Pressable>
                  <Pressable style={styles.rejectButton} onPress={() => handleReject(item)}>
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  headerAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    fontFamily: 'Menlo',
    marginBottom: 2,
  },
  headerChain: {
    fontSize: 11,
    color: '#4b5563',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  stateText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 12,
  },
  stateSubtext: {
    fontSize: 12,
    color: '#4b5563',
    marginTop: 4,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1e3a5f',
  },
  retryText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 8,
  },
  emptySection: {
    padding: 16,
    backgroundColor: '#111111',
    borderRadius: 8,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#4b5563',
  },
  policyCard: {
    backgroundColor: '#111111',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  policyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeAllow: {
    backgroundColor: '#052e16',
  },
  badgeReject: {
    backgroundColor: '#450a0a',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  policyTarget: {
    fontSize: 12,
    color: '#ffffff',
    fontFamily: 'Menlo',
    marginBottom: 2,
  },
  policySelector: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: 'Menlo',
  },
  pendingCard: {
    backgroundColor: '#1a1200',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  pendingReason: {
    fontSize: 13,
    color: '#ffffff',
    marginBottom: 4,
  },
  pendingMeta: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 8,
  },
  pendingPolicy: {
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#2a2200',
  },
  pendingPolicyText: {
    fontSize: 11,
    color: '#d4d4d8',
    fontFamily: 'Menlo',
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  approveButton: {
    flex: 1,
    backgroundColor: '#052e16',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22c55e',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#450a0a',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
});
