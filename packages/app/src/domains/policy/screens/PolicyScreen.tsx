import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  SectionList,
  StyleSheet,
} from 'react-native';
import { usePolicyStore, type Policy, type PendingPolicyRequest, type PolicyGroup } from '../../../stores/usePolicyStore';
import { useTxApproval } from '../../../shared/tx/TxApprovalContext';
import { useToast } from '../../../shared/ui/ToastProvider';

/**
 * PolicyScreen — Active policies list + pending policy approvals.
 *
 * Active policies: grouped by chain, showing target + selector + decision.
 * Pending policies: from AI's policyRequest tool_call, awaiting owner approval.
 */
export function PolicyScreen() {
  const { activePolicies, pendingPolicies } = usePolicyStore();
  const { requestApproval } = useTxApproval();
  const { showToast } = useToast();

  const handleApprovePending = useCallback(
    async (pending: PendingPolicyRequest) => {
      try {
        await requestApproval({
          requestId: pending.requestId,
          type: 'policy',
          chainId: pending.chainId,
          targetHash: '', // Will be computed from policies
          metadata: {
            reason: pending.reason,
            policies: pending.policies,
          },
          policyVersion: 0,
          createdAt: pending.createdAt,
          expiresAt: pending.expiresAt,
        });
        showToast('Policy approved', 'success');
      } catch {
        showToast('Policy approval failed', 'error');
      }
    },
    [requestApproval, showToast],
  );

  const handleRejectPending = useCallback(
    async (pending: PendingPolicyRequest) => {
      try {
        await requestApproval({
          requestId: pending.requestId,
          type: 'policy_reject',
          chainId: pending.chainId,
          targetHash: '',
          metadata: {
            reason: `Rejected: ${pending.reason}`,
            policies: pending.policies,
          },
          policyVersion: 0,
          createdAt: pending.createdAt,
          expiresAt: pending.expiresAt,
        });
        showToast('Policy rejected', 'info');
      } catch {
        showToast('Policy rejection failed', 'error');
      }
    },
    [requestApproval, showToast],
  );

  return (
    <View style={styles.container}>
      {/* Pending Policies Section */}
      {pendingPolicies.length > 0 && (
        <View style={styles.pendingSection}>
          <Text style={styles.sectionHeader}>
            Pending Requests ({pendingPolicies.length})
          </Text>
          <FlatList
            data={pendingPolicies}
            keyExtractor={(item) => item.requestId}
            renderItem={({ item }) => (
              <PendingPolicyCard
                pending={item}
                onApprove={() => handleApprovePending(item)}
                onReject={() => handleRejectPending(item)}
              />
            )}
            scrollEnabled={false}
          />
        </View>
      )}

      {/* Active Policies Section */}
      <Text style={styles.sectionHeader}>Active Policies</Text>
      {activePolicies.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Active Policies</Text>
          <Text style={styles.emptySubtitle}>
            AI will request policies when it needs to execute transactions.
            You approve or reject each policy request.
          </Text>
        </View>
      ) : (
        <FlatList
          data={activePolicies}
          keyExtractor={(item) => String(item.chainId)}
          renderItem={({ item }) => <PolicyGroupCard group={item} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

// --- Pending Policy Card ---

function PendingPolicyCard({
  pending,
  onApprove,
  onReject,
}: {
  pending: PendingPolicyRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isExpired = pending.expiresAt * 1000 < Date.now();

  return (
    <View style={[styles.card, styles.pendingCard]}>
      <View style={styles.cardHeader}>
        <Text style={styles.chainBadge}>{pending.chainId}</Text>
        <Text style={styles.requestedBy}>
          Requested by: {pending.requestedBy}
        </Text>
      </View>

      <Text style={styles.reason}>{pending.reason}</Text>

      <Text style={styles.policyCount}>
        {pending.policies.length} {pending.policies.length === 1 ? 'policy' : 'policies'}
      </Text>

      {pending.policies.map((p, i) => (
        <View key={i} style={styles.policyItem}>
          <Text style={styles.policyTarget}>
            {p.target ? `${p.target.slice(0, 10)}...` : 'any'}
          </Text>
          <Text style={styles.policySelector}>{p.selector || '*'}</Text>
          <Text style={[styles.decisionBadge, decisionColor(p.decision)]}>
            {p.decision}
          </Text>
        </View>
      ))}

      {isExpired ? (
        <Text style={styles.expiredText}>Expired</Text>
      ) : (
        <View style={styles.buttonRow}>
          <Pressable style={[styles.button, styles.rejectBtn]} onPress={onReject}>
            <Text style={styles.buttonText}>Reject</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.approveBtn]} onPress={onApprove}>
            <Text style={styles.buttonText}>Approve</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// --- Active Policy Group Card ---

function PolicyGroupCard({ group }: { group: PolicyGroup }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.chainBadge}>{group.chainId}</Text>
        <Text style={styles.versionText}>v{group.policyVersion}</Text>
      </View>
      <Text style={styles.updatedAt}>
        Updated: {new Date(group.updatedAt).toLocaleDateString()}
      </Text>

      {group.policies.map((p, i) => (
        <View key={i} style={styles.policyItem}>
          <Text style={styles.policyTarget}>
            {p.target ? `${p.target.slice(0, 10)}...` : 'any'}
          </Text>
          <Text style={styles.policySelector}>{p.selector || '*'}</Text>
          <Text style={[styles.decisionBadge, decisionColor(p.decision)]}>
            {p.decision}
          </Text>
        </View>
      ))}
    </View>
  );
}

// --- Helpers ---

function decisionColor(decision: string) {
  switch (decision) {
    case 'AUTO': return { color: '#22c55e' };
    case 'REQUIRE_APPROVAL': return { color: '#f59e0b' };
    case 'REJECT': return { color: '#ef4444' };
    default: return { color: '#6b7280' };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  pendingSection: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    paddingBottom: 12,
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
  emptyState: {
    flex: 1,
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#111111',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  pendingCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chainBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  versionText: {
    fontSize: 12,
    color: '#6b7280',
  },
  requestedBy: {
    fontSize: 11,
    color: '#6b7280',
  },
  reason: {
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 8,
  },
  policyCount: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  updatedAt: {
    fontSize: 11,
    color: '#4b5563',
    marginBottom: 8,
  },
  policyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  policyTarget: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Menlo',
    color: '#9ca3af',
  },
  policySelector: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Menlo',
    color: '#9ca3af',
  },
  decisionBadge: {
    fontSize: 11,
    fontWeight: '600',
  },
  expiredText: {
    fontSize: 13,
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectBtn: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#374151',
  },
  approveBtn: {
    backgroundColor: '#3b82f6',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});
