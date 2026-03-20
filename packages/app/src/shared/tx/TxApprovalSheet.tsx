import React from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTxApproval, useTxApprovalInternal } from './TxApprovalContext';
import type { ApprovalRequest } from '../../core/approval/types';

/**
 * TxApprovalSheet — Modal-based approval UI.
 *
 * States:
 * - pending: shows tx details + approve/reject buttons
 * - signing: shows spinner ("Signing...")
 * - success: shows checkmark + tx hash, auto-advances to next
 * - error: shows error message + retry/skip buttons
 *
 * Uses a simple Modal instead of @gorhom/bottom-sheet to minimize dependencies.
 * Pattern follows HypurrQuant's TxApprovalSheet.
 */
export function TxApprovalSheet() {
  const { state, reject } = useTxApproval();
  const { approve, dismiss, retry, skip, sheetVisible, queueLength } = useTxApprovalInternal();

  return (
    <Modal
      visible={sheetVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={dismiss}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Transaction Approval</Text>
            {queueLength > 1 && (
              <Text style={styles.queueBadge}>{queueLength} pending</Text>
            )}
          </View>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {state.status === 'pending' && (
            <PendingContent
              request={state.request}
              onApprove={approve}
              onReject={reject}
            />
          )}
          {state.status === 'signing' && <SigningContent />}
          {state.status === 'success' && <SuccessContent txHash={state.txHash} />}
          {state.status === 'error' && (
            <ErrorContent message={state.message} onRetry={retry} onSkip={skip} />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// --- Pending ---

function PendingContent({
  request,
  onApprove,
  onReject,
}: {
  request: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Review Transaction</Text>

      <InfoRow label="Type" value={request.type} />
      <InfoRow label="Chain" value={String(request.chainId)} />
      <InfoRow label="Wallet" value={`Account #${request.accountIndex}`} />
      <InfoRow label="Request ID" value={request.requestId} />

      {request.content !== '' && (
        <View style={styles.dataSection}>
          <Text style={styles.dataLabel}>Reason</Text>
          <ScrollView style={styles.dataBox} nestedScrollEnabled>
            <Text style={styles.dataText} selectable>
              {request.content}
            </Text>
          </ScrollView>
        </View>
      )}

      <InfoRow label="Expires" value={new Date(request.expiresAt * 1000).toLocaleTimeString()} />

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <Pressable style={[styles.button, styles.rejectButton]} onPress={onReject}>
          <Text style={styles.rejectButtonText}>Reject</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.approveButton]} onPress={onApprove}>
          <Text style={styles.approveButtonText}>Approve</Text>
        </Pressable>
      </View>
    </View>
  );
}

// --- Signing ---

function SigningContent() {
  return (
    <View style={styles.centeredSection}>
      <ActivityIndicator size="large" color="#3b82f6" />
      <Text style={styles.statusText}>Signing transaction...</Text>
      <Text style={styles.subText}>Please wait</Text>
    </View>
  );
}

// --- Success ---

function SuccessContent({ txHash }: { txHash: string }) {
  return (
    <View style={styles.centeredSection}>
      <View style={styles.successIcon}>
        <Text style={styles.successIconText}>OK</Text>
      </View>
      <Text style={[styles.statusText, { color: '#22c55e' }]}>Success</Text>
      <Text style={styles.hashText}>
        {txHash.slice(0, 18)}...{txHash.slice(-8)}
      </Text>
      <Text style={styles.subText}>Processing next...</Text>
    </View>
  );
}

// --- Error ---

function ErrorContent({
  message,
  onRetry,
  onSkip,
}: {
  message: string;
  onRetry: () => void;
  onSkip: () => void;
}) {
  return (
    <View style={styles.centeredSection}>
      <View style={styles.errorIcon}>
        <Text style={styles.errorIconText}>X</Text>
      </View>
      <Text style={[styles.statusText, { color: '#ef4444' }]}>Error</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <View style={styles.buttonRow}>
        <Pressable style={[styles.button, styles.rejectButton]} onPress={onSkip}>
          <Text style={styles.rejectButtonText}>Skip</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.approveButton]} onPress={onRetry}>
          <Text style={styles.approveButtonText}>Retry</Text>
        </Pressable>
      </View>
    </View>
  );
}

// --- Shared Components ---

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.monoText]}>{value}</Text>
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4b5563',
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  queueBadge: {
    fontSize: 12,
    color: '#3b82f6',
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  contentContainer: {
    flexGrow: 1,
    paddingTop: 16,
    paddingBottom: 40,
  },
  section: {
    flex: 1,
  },
  centeredSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    maxWidth: '60%',
    textAlign: 'right',
  },
  monoText: {
    fontFamily: 'Menlo',
    fontSize: 12,
  },
  dataSection: {
    marginTop: 16,
  },
  dataLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  dataBox: {
    backgroundColor: '#111111',
    borderRadius: 8,
    padding: 12,
    maxHeight: 120,
  },
  dataText: {
    fontFamily: 'Menlo',
    fontSize: 11,
    color: '#9ca3af',
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#374151',
  },
  approveButton: {
    backgroundColor: '#3b82f6',
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  statusText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 16,
  },
  subText: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 8,
  },
  hashText: {
    fontFamily: 'Menlo',
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#14532d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#22c55e',
  },
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#450a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIconText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ef4444',
  },
});
