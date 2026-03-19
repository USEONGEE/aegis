import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useApprovalStore } from '../../../stores/useApprovalStore';
import { useTxApproval } from '../../../shared/tx/TxApprovalContext';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { ApprovalRequest } from '../../../core/approval/types';

/**
 * ApprovalScreen — Pending transaction approvals.
 *
 * Shows REQUIRE_APPROVAL decisions from daemon's policy evaluation.
 * Owner can approve (sign with identity key) or reject each tx.
 * Tapping a card opens TxApprovalSheet via the state machine.
 */
export function ApprovalScreen() {
  const { pendingApprovals } = useApprovalStore();
  const { requestApproval } = useTxApproval();
  const { showToast } = useToast();

  const handleApprove = useCallback(
    async (approval: ApprovalRequest) => {
      try {
        const result = await requestApproval(approval);
        showToast(`Approved: ${result.txHash.slice(0, 16)}...`, 'success');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== 'User rejected' && msg !== 'User skipped') {
          showToast(`Failed: ${msg}`, 'error');
        }
      }
    },
    [requestApproval, showToast],
  );

  if (pendingApprovals.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Pending Approvals</Text>
        <Text style={styles.emptySubtitle}>
          When AI tries to execute transactions that require your approval,
          they will appear here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>
        Pending Approvals ({pendingApprovals.length})
      </Text>
      <FlatList
        data={pendingApprovals}
        keyExtractor={(item) => item.requestId}
        renderItem={({ item }) => (
          <ApprovalCard approval={item} onPress={() => handleApprove(item)} />
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

// --- Approval Card ---

function ApprovalCard({
  approval,
  onPress,
}: {
  approval: ApprovalRequest;
  onPress: () => void;
}) {
  const isExpired = approval.expiresAt * 1000 < Date.now();
  const timeLeft = Math.max(0, approval.expiresAt - Math.floor(Date.now() / 1000));
  const truncateAddr = (addr: string) =>
    addr ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : '-';

  return (
    <Pressable
      style={[styles.card, isExpired && styles.expiredCard]}
      onPress={onPress}
      disabled={isExpired}
    >
      <View style={styles.cardHeader}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{approval.type.toUpperCase()}</Text>
        </View>
        <Text style={styles.chainText}>{approval.chainId}</Text>
        {!isExpired && (
          <Text style={styles.timerText}>{formatTimeLeft(timeLeft)}</Text>
        )}
      </View>

      {approval.metadata.to && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>To</Text>
          <Text style={styles.detailValueMono}>{truncateAddr(approval.metadata.to)}</Text>
        </View>
      )}

      {approval.metadata.value && approval.metadata.value !== '0' && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Value</Text>
          <Text style={styles.detailValue}>{approval.metadata.value} wei</Text>
        </View>
      )}

      {approval.metadata.description && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Description</Text>
          <Text style={styles.detailValue} numberOfLines={2}>
            {approval.metadata.description}
          </Text>
        </View>
      )}

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Request ID</Text>
        <Text style={styles.detailValueMono}>
          {approval.requestId.slice(0, 16)}...
        </Text>
      </View>

      {isExpired ? (
        <Text style={styles.expiredText}>Expired</Text>
      ) : (
        <View style={styles.tapHint}>
          <Text style={styles.tapHintText}>Tap to review and approve</Text>
        </View>
      )}
    </Pressable>
  );
}

// --- Helpers ---

function formatTimeLeft(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  if (seconds < 60) return `${seconds}s left`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}m ${sec}s left`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#111111',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  expiredCard: {
    opacity: 0.5,
    borderLeftColor: '#4b5563',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  typeBadge: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
  },
  chainText: {
    fontSize: 12,
    color: '#6b7280',
  },
  timerText: {
    fontSize: 11,
    color: '#f59e0b',
    marginLeft: 'auto',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 13,
    color: '#ffffff',
    maxWidth: '60%',
    textAlign: 'right',
  },
  detailValueMono: {
    fontSize: 12,
    fontFamily: 'Menlo',
    color: '#9ca3af',
    maxWidth: '60%',
    textAlign: 'right',
  },
  expiredText: {
    fontSize: 13,
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 12,
  },
  tapHint: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    alignItems: 'center',
  },
  tapHintText: {
    fontSize: 13,
    color: '#3b82f6',
  },
});
