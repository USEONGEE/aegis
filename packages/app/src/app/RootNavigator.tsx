import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { ChatListScreen } from '../domains/chat/screens/ChatListScreen';
import { ChatDetailScreen } from '../domains/chat/screens/ChatDetailScreen';
import { PolicyScreen } from '../domains/policy/screens/PolicyScreen';
import { ApprovalScreen } from '../domains/approval/screens/ApprovalScreen';
import { ActivityScreen } from '../domains/activity/screens/ActivityScreen';
import { DashboardScreen } from '../domains/dashboard/screens/DashboardScreen';
import { SettingsScreen } from '../domains/settings/screens/SettingsScreen';
import { TxApprovalSheet } from '../shared/tx/TxApprovalSheet';
import { useChatStore, type TextChatMessage } from '../stores/useChatStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useActivityStore } from '../stores/useActivityStore';
import { LoginScreen } from '../domains/auth/screens/LoginScreen';
import { EnrollmentScreen } from '../domains/auth/screens/EnrollmentScreen';
import { RelayClient } from '../core/relay/RelayClient';
import { IdentityKeyManager } from '../core/identity/IdentityKeyManager';
import type { AnyStreamEvent, ChatEvent } from '@wdk-app/protocol';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

// --- Chat Stack ---

export type ChatStackParamList = {
  ChatList: undefined;
  ChatDetail: { sessionId: string };
};

const ChatStack = createNativeStackNavigator<ChatStackParamList>();

function ChatNavigator() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Wait for zustand persist to rehydrate from AsyncStorage
    const unsub = useChatStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    // If already hydrated (hot reload etc.)
    if (useChatStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, []);

  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const sessions = useChatStore((s) => s.sessions);

  // App-level sync: register cursor providers and control handler once (not screen-dependent)
  const syncInitialized = useRef(false);
  useEffect(() => {
    if (!hydrated || syncInitialized.current) return;
    syncInitialized.current = true;

    const relay = RelayClient.getInstance();
    const { registerSession, updateCursor, updateControlCursor } = useChatStore.getState();

    // Register cursor providers for authenticate payload
    relay.setChatCursorsProvider(() => useChatStore.getState().streamCursors);
    relay.setControlCursorProvider(() => useChatStore.getState().controlCursor);

    // F27: Wire token auto-refresh for reconnect
    const RELAY_BASE = process.env.EXPO_PUBLIC_RELAY_URL || 'http://localhost:3000';
    relay.setTokenRefresher(async () => {
      return useAuthStore.getState().refreshAccessToken(RELAY_BASE);
    });

    // Track which sessions have been backfilled (prevents duplicate backfill)
    const backfilledSessions = new Set<string>();

    // App-level handler: cursor tracking + cron session discovery + non-current chat ingestion
    const syncHandler = (message: { channel: string; payload: unknown; timestamp: number; messageId?: string; id?: string }) => {
      const data = message.payload as (AnyStreamEvent & { sessionId?: string }) | (ChatEvent & { sessionId?: string });
      const entryId = message.messageId || message.id;
      const { addMessage } = useChatStore.getState();

      // Track control cursor
      if (entryId && message.channel === 'control') {
        updateControlCursor(entryId);
      }

      // Track chat cursor
      if (entryId && message.channel === 'chat' && data.sessionId) {
        updateCursor(data.sessionId, entryId);
      }

      // v0.4.8: event_stream is now a top-level channel (was nested in control)
      if (message.channel === 'event_stream') {
        const event = (data as { event?: { type?: string; requestId?: string; chainId?: number; timestamp?: number } }).event;
        if (event && event.type) {
          const { addEvent } = useActivityStore.getState();
          addEvent({
            id: event.requestId || `${event.type}:${event.timestamp || Date.now()}`,
            type: event.type as import('../stores/useActivityStore').ActivityEventType,
            chainId: (event.chainId as number) ?? null,
            summary: event.type,
            details: event as Record<string, unknown>,
            timestamp: event.timestamp || Date.now(),
          });
        }
      }

      // v0.4.8: cron_session_created is now delivered via event_stream channel
      if (message.channel === 'event_stream' && data.type === 'cron_session_created' && data.sessionId) {
        registerSession(data.sessionId, 'cron');
        if (!backfilledSessions.has(data.sessionId)) {
          backfilledSessions.add(data.sessionId);
          relay.subscribeChatStream(data.sessionId);
        }
        return;
      }

      // Chat: save non-current-session done messages at app-level
      // (current session messages are handled by ChatDetailScreen's UI logic)
      if (message.channel === 'chat' && data.type === 'done' && data.sessionId) {
        const currentSid = useChatStore.getState().currentSessionId;
        if (data.sessionId !== currentSid && data.content) {
          addMessage({
            kind: 'text',
            id: entryId || `msg_done_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            role: 'assistant',
            content: data.content,
            timestamp: message.timestamp,
            sessionId: data.sessionId,
            source: (data.source as 'user' | 'cron') ?? 'user',
          });
        }
      }
    };

    relay.addMessageHandler(syncHandler);
    return () => relay.removeMessageHandler(syncHandler);
  }, [hydrated]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  // After hydration, check if we should restore to a session
  const hasRestoredSession =
    currentSessionId !== null && sessions[currentSessionId] !== undefined;

  return (
    <ChatStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTintColor: '#ffffff',
      }}
      initialRouteName={hasRestoredSession ? 'ChatDetail' : 'ChatList'}
    >
      <ChatStack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{ title: 'Chat' }}
      />
      <ChatStack.Screen
        name="ChatDetail"
        component={ChatDetailScreen}
        options={{ title: '대화', headerBackTitle: '목록' }}
        initialParams={
          hasRestoredSession ? { sessionId: currentSessionId! } : undefined
        }
      />
    </ChatStack.Navigator>
  );
}

// --- Root Tabs ---

type RootTabParamList = {
  Chat: undefined;
  Policy: undefined;
  Approval: undefined;
  Activity: undefined;
  Dashboard: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, string> = {
  Chat: 'C',
  Policy: 'P',
  Approval: 'A',
  Activity: 'T',
  Dashboard: 'D',
  Settings: 'S',
};

export function RootNavigator() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isAuthLoading = useAuthStore(s => s.isLoading);
  const loadPersistedAuth = useAuthStore(s => s.loadPersistedAuth);
  const userId = useAuthStore(s => s.userId);
  const token = useAuthStore(s => s.token);
  const [enrollmentDone, setEnrollmentDone] = useState<boolean | null>(null);

  useEffect(() => {
    loadPersistedAuth();
    // Check persisted enrollment state
    import('expo-secure-store').then(SecureStore => {
      SecureStore.getItemAsync('wdk_enrollment_done').then(val => {
        setEnrollmentDone(val === 'true');
      });
    });
  }, []);

  // Relay connect/disconnect based on auth state
  useEffect(() => {
    if (!isAuthenticated || !enrollmentDone || !userId || !token) {
      // Disconnect if previously connected and auth state changed (logout)
      const relay = RelayClient.getInstance();
      if (relay.isConnected()) {
        relay.disconnect();
      }
      return;
    }

    const relay = RelayClient.getInstance();
    const relayUrl = process.env.EXPO_PUBLIC_RELAY_URL || 'http://localhost:3000';
    relay.connect(relayUrl, userId, token).catch(() => {
      // Connection failure is handled by RelayClient's internal reconnect logic
    });

    return () => {
      relay.disconnect();
    };
  }, [isAuthenticated, enrollmentDone, userId, token]);

  // Auto-generate identity key if none exists
  useEffect(() => {
    if (!isAuthenticated || !enrollmentDone) return;

    const identity = IdentityKeyManager.getInstance();
    identity.load().then(existing => {
      if (!existing) {
        identity.generate();
      }
    });
  }, [isAuthenticated, enrollmentDone]);

  if (isAuthLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // F30: Show enrollment screen after first login (skip if already enrolled)
  if (enrollmentDone === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  if (!enrollmentDone) {
    return <EnrollmentScreen
      onEnrolled={async () => {
        const SecureStore = await import('expo-secure-store');
        await SecureStore.setItemAsync('wdk_enrollment_done', 'true');
        setEnrollmentDone(true);
      }}
      onSkip={() => {
        // Skip without persisting — will show again on next app restart
        setEnrollmentDone(true);
      }}
    />;
  }

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: '#0a0a0a' },
          headerTintColor: '#ffffff',
          tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#1a1a1a' },
          tabBarActiveTintColor: '#3b82f6',
          tabBarInactiveTintColor: '#6b7280',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size - 4, fontWeight: 'bold' }}>
              {TAB_ICONS[route.name as keyof RootTabParamList]}
            </Text>
          ),
        })}
      >
        <Tab.Screen
          name="Chat"
          component={ChatNavigator}
          options={{ headerShown: false }}
        />
        <Tab.Screen name="Policy" component={PolicyScreen} />
        <Tab.Screen name="Approval" component={ApprovalScreen} />
        <Tab.Screen name="Activity" component={ActivityScreen} />
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
      <TxApprovalSheet />
    </>
  );
}
