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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '../../../app/RootNavigator';
import type { ChatEvent, ControlEvent } from '@wdk-app/protocol';

type Props = NativeStackScreenProps<ChatStackParamList, 'ChatDetail'>;

/** Flexible payload shape covering control + chat event fields from relay. */
interface RelayPayloadData {
  type?: string;
  sessionId?: string;
  messageId?: string;
  source?: string;
  toolCallId?: string;
  toolName?: string;
  status?: string;
  delta?: string;
  error?: string;
  content?: string;
  role?: string;
}

/**
 * ChatDetailScreen — conversation with OpenClaw AI via Relay.
 *
 * Messages flow:
 * user input -> RelayClient.sendChat() -> Relay -> daemon -> OpenClaw
 * OpenClaw response -> daemon -> Relay -> RelayClient handler -> store -> UI
 */
export function ChatDetailScreen({ route }: Props) {
  const sessionId = route.params.sessionId;
  const {
    sessions, addMessage, isLoading, setLoading, isTyping, setTyping,
    switchSession, queuedMessageId, setQueuedMessageId,
    messageState, setMessageState,
  } = useChatStore();
  const [inputText, setInputText] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  const currentSessionId = sessionId;
  const messages = sessions[currentSessionId] || [];
  const streamBufferRef = useRef<string>('');
  const streamMsgIdRef = useRef<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const relay = RelayClient.getInstance();

  // Sync store's currentSessionId with route param
  useEffect(() => {
    switchSession(currentSessionId);
  }, [currentSessionId, switchSession]);

  // Cursor providers and cron_session_created handler are registered at app-level (ChatNavigator)

  // Subscribe to incoming chat messages from Relay
  useEffect(() => {
    const handler = (message: { channel: string; payload: unknown; timestamp: number }) => {
      // Use flexible type for payload — protocol types + extra fields from relay
      const data = message.payload as RelayPayloadData;

      // v0.4.8: event_stream channel — message_queued, message_started, cancel results
      // cron_session_created and cursor tracking are handled at app-level (RootNavigator)
      if (message.channel === 'event_stream') {
        // event_stream wraps events in { event: ... } payload
        const eventData = (data.event ?? data) as RelayPayloadData;
        switch (eventData.type) {
          case 'message_queued': {
            if (eventData.sessionId === currentSessionId && eventData.messageId) {
              setQueuedMessageId(eventData.messageId);
              setMessageState('queued');
            }
            return;
          }
          case 'message_started': {
            if (eventData.sessionId === currentSessionId) {
              setMessageState('active');
            }
            return;
          }
          case 'CancelCompleted':
          case 'CancelFailed': {
            setQueuedMessageId(null);
            setMessageState('idle');
            setTyping(false);
            setLoading(false);
            streamBufferRef.current = '';
            streamMsgIdRef.current = null;
            return;
          }
        }
        return;
      }

      // Chat channel: handle streaming message types
      if (message.channel !== 'chat') return;

      const msgSessionId = data.sessionId ?? currentSessionId;
      const msgSource = (data.source === 'cron' ? 'cron' : 'user') as 'user' | 'cron';

      // Store messages for all sessions (not just current) for cron/offline recovery
      // But only update UI state (typing, stream, loading) for current session
      const isCurrentSession = msgSessionId === currentSessionId;

      switch (data.type) {
        case 'tool_start': {
          if (isCurrentSession) {
            setTyping(false);
          }
          addMessage({
            kind: 'tool',
            id: `tool_${data.toolCallId}`,
            role: 'system',
            content: `🔧 ${data.toolName}`,
            timestamp: message.timestamp,
            sessionId: msgSessionId!,
            source: msgSource,
            toolCall: data.toolName ?? '',
            toolStatus: 'running',
          });
          return;
        }

        case 'tool_done': {
          addMessage({
            kind: 'tool',
            id: `tool_${data.toolCallId}`,
            role: 'system',
            content: data.status === 'success'
              ? `✅ ${data.toolName} 완료`
              : `❌ ${data.toolName} 실패`,
            timestamp: message.timestamp,
            sessionId: msgSessionId!,
            source: msgSource,
            toolCall: data.toolName ?? '',
            toolStatus: data.status === 'success' ? 'done' : 'error',
          });
          return;
        }

        case 'cancelled': {
          if (isCurrentSession) {
            setTyping(false);
            setLoading(false);
            setQueuedMessageId(null);
            setMessageState('idle');
            streamBufferRef.current = '';
            streamMsgIdRef.current = null;
          }
          addMessage({
            kind: 'status',
            id: `msg_cancelled_${Date.now()}`,
            role: 'system',
            content: '요청이 취소되었습니다.',
            timestamp: message.timestamp,
            sessionId: msgSessionId!,
            source: msgSource,
            status: 'cancelled',
          });
          return;
        }

        case 'typing': {
          if (isCurrentSession) {
            setTyping(true);
            setStreamError(null);
          }
          return;
        }

        case 'stream': {
          if (isCurrentSession) {
            setTyping(false);
          }
          if (data.delta) {
            // Always save stream messages (all sessions, not just current)
            if (isCurrentSession) {
              streamBufferRef.current += data.delta;
              if (!streamMsgIdRef.current) {
                streamMsgIdRef.current = `msg_stream_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              }
            }
            // For non-current sessions, we can't buffer streams — they'll be saved on 'done'
            if (isCurrentSession && streamMsgIdRef.current) {
              addMessage({
                kind: 'text',
                id: streamMsgIdRef.current,
                role: 'assistant',
                content: streamBufferRef.current,
                timestamp: message.timestamp,
                sessionId: msgSessionId!,
                source: msgSource,
              });
            }
          }
          return;
        }

        case 'error': {
          if (isCurrentSession) {
            setTyping(false);
            setLoading(false);
            setQueuedMessageId(null);
            setMessageState('idle');
            streamBufferRef.current = '';
            streamMsgIdRef.current = null;
            const errorText = data.error || 'Unknown error';
            setStreamError(errorText);
          }
          addMessage({
            kind: 'status',
            id: `msg_${Date.now()}_err`,
            role: 'system',
            content: `Error: ${data.error || 'Unknown error'}`,
            timestamp: message.timestamp,
            sessionId: msgSessionId!,
            source: msgSource,
            status: 'cancelled',
          });
          return;
        }

        case 'done': {
          // Stream complete — finalize
          if (isCurrentSession) {
            setTyping(false);
            setLoading(false);
            setQueuedMessageId(null);
            setMessageState('idle');
            streamBufferRef.current = '';
            streamMsgIdRef.current = null;
          }
          // Non-current session done messages are saved at app-level (ChatNavigator)
          return;
        }

        default: {
          // Legacy: complete message (no type field)
          if (data.content && isCurrentSession) {
            setTyping(false);
            setLoading(false);
            streamBufferRef.current = '';
            streamMsgIdRef.current = null;
            addMessage({
              kind: 'text',
              id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              role: (data.role as 'assistant') ?? 'assistant',
              content: data.content,
              timestamp: message.timestamp,
              sessionId: msgSessionId!,
              source: msgSource,
            });
          }
          return;
        }
      }
    };

    relay.addMessageHandler(handler);
    return () => relay.removeMessageHandler(handler);
  }, [currentSessionId, addMessage, setLoading, setTyping, setQueuedMessageId, setMessageState, sessions, relay]);

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !currentSessionId) return;

    const userMsg: ChatMessage = {
      kind: 'text',
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      sessionId: currentSessionId,
      source: 'user',
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
        kind: 'status',
        id: `msg_${Date.now()}_err`,
        role: 'system',
        content: `Failed to send: ${e instanceof Error ? e.message : String(e)}`,
        timestamp: Date.now(),
        sessionId: currentSessionId,
        source: 'user',
        status: 'cancelled',
      });
      setLoading(false);
    }
  }, [inputText, currentSessionId, addMessage, setLoading, relay]);

  const cancelPendingMessage = useCallback(async () => {
    if (!queuedMessageId) return;
    try {
      if (messageState === 'queued') {
        await relay.cancelQueued(queuedMessageId);
      } else {
        await relay.cancelActive(queuedMessageId);
      }
    } catch (_err: unknown) {
      return
    }
    setQueuedMessageId(null);
    setMessageState('idle');
    setTyping(false);
    setLoading(false);
    streamBufferRef.current = '';
    streamMsgIdRef.current = null;
  }, [queuedMessageId, messageState, relay, setLoading, setTyping, setQueuedMessageId, setMessageState]);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.kind === 'text' && item.role === 'user';
    const isSystem = item.role === 'system';
    const isTool = item.kind === 'tool';

    // Tool messages: compact indicator
    if (isTool) {
      return (
        <View style={styles.toolIndicator}>
          <Text style={styles.toolText}>
            {item.toolStatus === 'running' && `🔧 ${item.toolCall} 실행 중...`}
            {item.toolStatus === 'done' && `✅ ${item.toolCall} 완료`}
            {item.toolStatus === 'error' && `❌ ${item.toolCall} 실패`}
          </Text>
        </View>
      );
    }

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
        <View style={styles.messageFooter}>
          <Text style={styles.timestamp}>
            {new Date(item.timestamp).toLocaleTimeString()}
          </Text>
          {isUser && queuedMessageId && item.id === messages[messages.length - 1]?.id && (
            <Text style={styles.queuedStatus}>전송됨 ✓</Text>
          )}
        </View>
      </View>
    );
  }, [queuedMessageId, messages]);

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

      {/* Loading / typing indicator with cancel */}
      {(isLoading || isTyping) && (
        <View style={styles.loadingBar}>
          <Text style={styles.loadingText}>
            {isTyping ? 'AI is typing...' : 'AI is thinking...'}
          </Text>
          {queuedMessageId && (
            <Pressable style={styles.cancelButton} onPress={cancelPendingMessage}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Stream error */}
      {streamError && (
        <View style={styles.loadingBar}>
          <Text style={[styles.loadingText, { color: '#ef4444' }]}>
            {streamError}
          </Text>
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
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  timestamp: {
    fontSize: 10,
    color: '#4b5563',
  },
  queuedStatus: {
    fontSize: 10,
    color: '#22c55e',
  },
  toolIndicator: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: 'center',
    marginBottom: 4,
  },
  toolText: {
    fontSize: 12,
    color: '#6b7280',
  },
  loadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#374151',
  },
  cancelButtonText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
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
