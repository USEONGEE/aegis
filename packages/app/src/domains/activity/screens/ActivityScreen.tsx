import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {
  useActivityStore,
  type ActivityEvent,
  type ActivityFilter,
  type ActivityEventType,
} from '../../../stores/useActivityStore';

/**
 * ActivityScreen — Event timeline with type filters.
 *
 * Events come from daemon's Guarded WDK via Relay in real-time:
 * - IntentProposed, PolicyEvaluated, ApprovalRequested, ...
 * - ExecutionBroadcasted, ExecutionSettled, ExecutionFailed, ...
 * - PendingPolicyRequested, PolicyApplied, SignerRevoked
 */

const FILTER_OPTIONS: { label: string; value: ActivityFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Intent', value: 'IntentProposed' },
  { label: 'Policy', value: 'PolicyEvaluated' },
  { label: 'Approval', value: 'ApprovalVerified' },
  { label: 'Executed', value: 'ExecutionBroadcasted' },
  { label: 'Settled', value: 'ExecutionSettled' },
  { label: 'Failed', value: 'ExecutionFailed' },
  { label: 'Signer', value: 'SignerRevoked' },
];

export function ActivityScreen() {
  const { filter, setFilter, getFilteredEvents } = useActivityStore();
  const events = getFilteredEvents();

  return (
    <View style={styles.container}>
      {/* Filter bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {FILTER_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.filterChip, filter === opt.value && styles.filterChipActive]}
            onPress={() => setFilter(opt.value)}
          >
            <Text
              style={[styles.filterChipText, filter === opt.value && styles.filterChipTextActive]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Event list */}
      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Activity</Text>
          <Text style={styles.emptySubtitle}>
            Events from the WDK daemon will appear here in real-time as
            transactions are proposed, evaluated, and executed.
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EventCard event={item} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

// --- Event Card ---

function EventCard({ event }: { event: ActivityEvent }) {
  const icon = getEventIcon(event.type);
  const color = getEventColor(event.type);

  return (
    <View style={styles.eventCard}>
      {/* Timeline dot */}
      <View style={styles.timeline}>
        <View style={[styles.timelineDot, { backgroundColor: color }]} />
        <View style={styles.timelineLine} />
      </View>

      {/* Content */}
      <View style={styles.eventContent}>
        <View style={styles.eventHeader}>
          <Text style={[styles.eventType, { color }]}>{icon} {event.type}</Text>
          {event.chainId && (
            <Text style={styles.eventChain}>{event.chainId}</Text>
          )}
        </View>
        <Text style={styles.eventSummary}>{event.summary}</Text>
        <Text style={styles.eventTime}>
          {new Date(event.timestamp).toLocaleString()}
        </Text>

        {/* Details */}
        {event.details && Object.keys(event.details).length > 0 && (
          <View style={styles.detailsContainer}>
            {Object.entries(event.details).map(([key, value]) => (
              <View key={key} style={styles.detailRow}>
                <Text style={styles.detailKey}>{key}</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {typeof value === 'string' ? value : JSON.stringify(value)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// --- Helpers ---

function getEventIcon(type: ActivityEventType): string {
  switch (type) {
    case 'IntentProposed': return '>';
    case 'PolicyEvaluated': return '#';
    case 'ApprovalRequested': return '?';
    case 'ApprovalVerified': return '+';
    case 'ApprovalRejected': return '-';
    case 'ExecutionBroadcasted': return '~';
    case 'ExecutionSettled': return '*';
    case 'ExecutionFailed': return '!';
    case 'PendingPolicyRequested': return '@';
    case 'PolicyApplied': return '=';
    case 'SignerRevoked': return 'x';
    default: return '.';
  }
}

function getEventColor(type: ActivityEventType): string {
  switch (type) {
    case 'IntentProposed': return '#3b82f6';
    case 'PolicyEvaluated': return '#8b5cf6';
    case 'ApprovalRequested': return '#f59e0b';
    case 'ApprovalVerified': return '#22c55e';
    case 'ApprovalRejected': return '#ef4444';
    case 'ExecutionBroadcasted': return '#06b6d4';
    case 'ExecutionSettled': return '#22c55e';
    case 'ExecutionFailed': return '#ef4444';
    case 'PendingPolicyRequested': return '#f59e0b';
    case 'PolicyApplied': return '#22c55e';
    case 'SignerRevoked': return '#ef4444';
    default: return '#6b7280';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  filterBar: {
    maxHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  filterBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
  },
  filterChipActive: {
    backgroundColor: '#1e3a5f',
  },
  filterChipText: {
    fontSize: 12,
    color: '#6b7280',
  },
  filterChipTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
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
    paddingVertical: 12,
  },
  eventCard: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  timeline: {
    alignItems: 'center',
    width: 24,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: '#1a1a1a',
    marginVertical: 2,
  },
  eventContent: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 16,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  eventType: {
    fontSize: 12,
    fontWeight: '600',
  },
  eventChain: {
    fontSize: 10,
    color: '#4b5563',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  eventSummary: {
    fontSize: 13,
    color: '#ffffff',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 11,
    color: '#4b5563',
  },
  detailsContainer: {
    marginTop: 8,
    backgroundColor: '#111111',
    borderRadius: 8,
    padding: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  detailKey: {
    fontSize: 11,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 11,
    color: '#9ca3af',
    fontFamily: 'Menlo',
    maxWidth: '60%',
    textAlign: 'right',
  },
});
