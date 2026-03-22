import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { useChatStore, type ChatSession } from '../../../stores/useChatStore';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '../../../app/RootNavigator';

type Props = {
  navigation: NativeStackNavigationProp<ChatStackParamList, 'ChatList'>;
};

export function ChatListScreen({ navigation }: Props) {
  const { sessionList, createSession, switchSession, deleteSessions } = useChatStore();
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sorted = [...sessionList].sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    setSelected(new Set());
  }, []);

  const handleNewChat = () => {
    const id = createSession('user');
    navigation.navigate('ChatDetail', { sessionId: id });
  };

  const handleSelectSession = (session: ChatSession) => {
    if (editMode) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(session.id)) {
          next.delete(session.id);
        } else {
          next.add(session.id);
        }
        return next;
      });
      return;
    }
    switchSession(session.id);
    navigation.navigate('ChatDetail', { sessionId: session.id });
  };

  const handleSelectAll = () => {
    if (selected.size === sorted.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map((s) => s.id)));
    }
  };

  const handleDelete = () => {
    if (selected.size === 0) return;
    Alert.alert(
      'Delete Chats',
      `Delete ${selected.size} chat(s)?\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSessions([...selected]);
            exitEditMode();
          },
        },
      ],
    );
  };

  const renderSession = ({ item }: { item: ChatSession }) => (
    <Pressable
      style={[styles.sessionCard, editMode && selected.has(item.id) && styles.sessionCardSelected]}
      onPress={() => handleSelectSession(item)}
    >
      <View style={styles.sessionRow}>
        {editMode && (
          <View style={[styles.checkbox, selected.has(item.id) && styles.checkboxChecked]}>
            {selected.has(item.id) && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}
        <View style={styles.sessionContent}>
          <View style={styles.sessionHeader}>
            <Text style={styles.sessionTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {item.source === 'cron' && (
              <Text style={styles.cronLabel}>Auto</Text>
            )}
          </View>
          <View style={styles.sessionMeta}>
            <Text style={styles.sessionDate}>
              {new Date(item.lastMessageAt).toLocaleDateString()}
            </Text>
            <Text style={styles.sessionCount}>
              {item.messageCount} messages
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        {editMode ? (
          <Pressable style={styles.editButton} onPress={exitEditMode}>
            <Text style={styles.editButtonText}>Done</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.newChatButton} onPress={handleNewChat}>
            <Text style={styles.newChatText}>+ New Chat</Text>
          </Pressable>
        )}
        {sorted.length > 0 && !editMode && (
          <Pressable style={styles.editButton} onPress={() => setEditMode(true)}>
            <Text style={styles.editButtonText}>Edit</Text>
          </Pressable>
        )}
      </View>

      {sorted.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Chats</Text>
          <Text style={styles.emptySubtitle}>
            Tap "+ New Chat" to start a conversation with your AI agent.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          renderItem={renderSession}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}

      {editMode && (
        <View style={styles.bottomBar}>
          <Pressable style={styles.selectAllButton} onPress={handleSelectAll}>
            <Text style={styles.selectAllText}>
              {selected.size === sorted.length ? 'Deselect All' : 'Select All'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.deleteButton, selected.size === 0 && styles.deleteButtonDisabled]}
            onPress={handleDelete}
            disabled={selected.size === 0}
          >
            <Text style={[styles.deleteText, selected.size === 0 && styles.deleteTextDisabled]}>
              {selected.size > 0 ? `Delete ${selected.size}` : 'Delete'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    gap: 12,
  },
  newChatButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#1e3a5f',
    alignItems: 'center',
  },
  newChatText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  editButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#3b82f6',
  },
  list: {
    paddingHorizontal: 16,
  },
  sessionCard: {
    backgroundColor: '#111111',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  sessionCardSelected: {
    backgroundColor: '#1a1a2e',
    borderColor: '#3b82f6',
    borderWidth: 1,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#4b5563',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  sessionContent: {
    flex: 1,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sessionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#ffffff',
  },
  cronLabel: {
    fontSize: 11,
    color: '#f59e0b',
    backgroundColor: '#1a1200',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  sessionMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sessionDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  sessionCount: {
    fontSize: 12,
    color: '#4b5563',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f1f1f',
    backgroundColor: '#0a0a0a',
  },
  selectAllButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  selectAllText: {
    fontSize: 15,
    color: '#3b82f6',
    fontWeight: '500',
  },
  deleteButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#7f1d1d',
  },
  deleteButtonDisabled: {
    backgroundColor: '#1f1f1f',
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ef4444',
  },
  deleteTextDisabled: {
    color: '#4b5563',
  },
});
