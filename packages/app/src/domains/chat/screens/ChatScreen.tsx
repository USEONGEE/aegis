import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useChatStore, type ChatMessage } from '../../../stores/useChatStore';
import { RelayClient } from '../../../core/relay/RelayClient';

/**
 * ChatScreen — conversation with OpenClaw AI via Relay.
 *
 * Messages flow:
 * user input -> RelayClient.sendChat() -> Relay -> daemon -> OpenClaw
 * OpenClaw response -> daemon -> Relay -> RelayClient handler -> store -> UI
 */
export function ChatScreen() {
  const { messages, addMessage, isLoading, setLoading, currentSessionId, setSessionId } = useChatStore();
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const relay = RelayClient.getInstance();

  // Initialize session on mount
  useEffect(() => {
    if (!currentSessionId) {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setSessionId(sessionId);
    }
  }, [currentSessionId, setSessionId]);

  // Subscribe to incoming chat messages from Relay
  useEffect(() => {
    const handler = (message: { channel: string; payload: unknown; timestamp: number }) => {
      if (message.channel !== 'chat') return;

      const data = message.payload as {
        role?: string;
        content?: string;
        sessionId?: string;
      };

      if (data.content && data.sessionId === currentSessionId) {
        addMessage({
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: (data.role as 'assistant') ?? 'assistant',
          content: data.content,
          timestamp: message.timestamp,
          sessionId: currentSessionId!,
        });
        setLoading(false);
      }
    };

    relay.addMessageHandler(handler);
    return () => relay.removeMessageHandler(handler);
  }, [currentSessionId, addMessage, setLoading, relay]);

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !currentSessionId) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      sessionId: currentSessionId,
    };

    addMessage(userMsg);
    setInputText('');
    setLoading(true);

    try {
      await relay.sendChat(currentSessionId, {
        role: 'user',
        content: text,
        sessionId: currentSessionId,
      });
    } catch (e) {
      addMessage({
        id: `msg_${Date.now()}_err`,
        role: 'system',
        content: `Failed to send: ${e instanceof Error ? e.message : String(e)}`,
        timestamp: Date.now(),
        sessionId: currentSessionId,
      });
      setLoading(false);
    }
  }, [inputText, currentSessionId, addMessage, setLoading, relay]);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const isSystem = item.role === 'system';

    return (
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : isSystem ? styles.systemBubble : styles.assistantBubble,
        ]}
      >
        <Text style={[styles.roleLabel, isSystem && { color: '#f59e0b' }]}>
          {item.role === 'user' ? 'You' : item.role === 'assistant' ? 'AI' : 'System'}
        </Text>
        <Text style={styles.messageText}>{item.content}</Text>
        <Text style={styles.timestamp}>
          {new Date(item.timestamp).toLocaleTimeString()}
        </Text>
      </View>
    );
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Connection status */}
      <View style={styles.statusBar}>
        <View style={[styles.statusDot, relay.isConnected() ? styles.connectedDot : styles.disconnectedDot]} />
        <Text style={styles.statusText}>
          {relay.isConnected() ? 'Connected' : 'Disconnected'}
        </Text>
        {currentSessionId && (
          <Text style={styles.sessionText}>
            {currentSessionId.slice(0, 16)}...
          </Text>
        )}
      </View>

      {/* Messages */}
      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>WDK Chat</Text>
          <Text style={styles.emptySubtitle}>
            Talk to your AI agent. Ask it to check balances, execute trades, or manage policies.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Loading indicator */}
      {isLoading && (
        <View style={styles.loadingBar}>
          <Text style={styles.loadingText}>AI is thinking...</Text>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Message your AI agent..."
          placeholderTextColor="#6b7280"
          multiline
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={sendMessage}
          blurOnSubmit={false}
        />
        <Pressable
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim() || isLoading}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  connectedDot: {
    backgroundColor: '#22c55e',
  },
  disconnectedDot: {
    backgroundColor: '#ef4444',
  },
  statusText: {
    fontSize: 12,
    color: '#6b7280',
  },
  sessionText: {
    fontSize: 11,
    color: '#4b5563',
    marginLeft: 'auto',
    fontFamily: 'Menlo',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: '#1e3a5f',
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    backgroundColor: '#1a1a1a',
    alignSelf: 'flex-start',
  },
  systemBubble: {
    backgroundColor: '#1a1200',
    alignSelf: 'center',
    maxWidth: '95%',
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 10,
    color: '#4b5563',
    marginTop: 4,
    textAlign: 'right',
  },
  loadingBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    backgroundColor: '#0a0a0a',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#111111',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#ffffff',
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#1e3a5f',
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});
