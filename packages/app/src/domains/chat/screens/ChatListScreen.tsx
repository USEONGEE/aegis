import React from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { useChatStore, type ChatSession } from '../../../stores/useChatStore';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '../../../app/RootNavigator';

type Props = {
  navigation: NativeStackNavigationProp<ChatStackParamList, 'ChatList'>;
};

export function ChatListScreen({ navigation }: Props) {
  const { sessionList, createSession, switchSession } = useChatStore();

  const sorted = [...sessionList].sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  const handleNewChat = () => {
    const id = createSession('user');
    navigation.navigate('ChatDetail', { sessionId: id });
  };

  const handleSelectSession = (session: ChatSession) => {
    switchSession(session.id);
    navigation.navigate('ChatDetail', { sessionId: session.id });
  };

  const renderSession = ({ item }: { item: ChatSession }) => (
    <Pressable style={styles.sessionCard} onPress={() => handleSelectSession(item)}>
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {item.source === 'cron' && (
          <Text style={styles.cronLabel}>자동 실행</Text>
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
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Pressable style={styles.newChatButton} onPress={handleNewChat}>
        <Text style={styles.newChatText}>+ 새 대화</Text>
      </Pressable>

      {sorted.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>대화 없음</Text>
          <Text style={styles.emptySubtitle}>
            "새 대화"를 눌러 AI agent와 대화를 시작하세요.
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  newChatButton: {
    margin: 16,
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
  list: {
    paddingHorizontal: 16,
  },
  sessionCard: {
    backgroundColor: '#111111',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
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
});
