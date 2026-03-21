import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Chat store — manages messages for the Chat tab.
 * Messages flow: user -> Relay -> daemon -> OpenClaw -> daemon -> Relay -> app
 *
 * Store structure: sessions keyed by sessionId, each containing ChatMessage[].
 * Persisted via zustand persist + AsyncStorage.
 */

const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 500;

// --- Discriminated Union: ChatMessage ---

interface ChatMessageBase {
  id: string;
  content: string;
  timestamp: number;
  sessionId: string;
  source: 'user' | 'cron';
}

export interface TextChatMessage extends ChatMessageBase {
  kind: 'text';
  role: 'user' | 'assistant';
}

export interface ToolChatMessage extends ChatMessageBase {
  kind: 'tool';
  role: 'system';
  toolCall: string;
  toolStatus: 'running' | 'done' | 'error';
}

export interface StatusChatMessage extends ChatMessageBase {
  kind: 'status';
  role: 'system';
  status: 'cancelled';
}

export type ChatMessage = TextChatMessage | ToolChatMessage | StatusChatMessage;

// --- ChatSession ---

export interface ChatSession {
  id: string;
  title: string;
  lastMessageAt: number;
  source: 'user' | 'cron';
  messageCount: number;
}

// --- ChatState ---

interface ChatState {
  // Persisted data
  sessions: Record<string, ChatMessage[]>;
  sessionList: ChatSession[];
  currentSessionId: string | null;
  streamCursors: Record<string, string>;
  controlCursor: string;

  // Transient (not persisted)
  isLoading: boolean;
  isTyping: boolean;
  queuedMessageId: string | null;
  messageState: 'idle' | 'queued' | 'active';

  // Actions
  addMessage: (message: ChatMessage) => void;
  createSession: (source: 'user' | 'cron') => string;
  registerSession: (id: string, source: 'user' | 'cron') => void;
  switchSession: (sessionId: string) => void;
  setLoading: (loading: boolean) => void;
  setTyping: (typing: boolean) => void;
  setQueuedMessageId: (id: string | null) => void;
  setMessageState: (state: 'idle' | 'queued' | 'active') => void;
  updateCursor: (sessionId: string, entryId: string) => void;
  updateControlCursor: (entryId: string) => void;
}

export const useChatStore = create(
  persist<ChatState>(
    (set, get) => ({
      sessions: {},
      sessionList: [],
      currentSessionId: null,
      streamCursors: {},
      controlCursor: '0',
      isLoading: false,
      isTyping: false,
      queuedMessageId: null,
      messageState: 'idle' as const,

      addMessage: (message) =>
        set((state) => {
          const sid = message.sessionId;
          const existing = state.sessions[sid] || [];

          // Same id → overwrite (idempotent for stream updates)
          const idx = existing.findIndex((m) => m.id === message.id);
          let updated: ChatMessage[];
          if (idx >= 0) {
            updated = [...existing.slice(0, idx), message, ...existing.slice(idx + 1)];
          } else {
            updated = [...existing, message];
          }

          // Trim if exceeding max
          if (updated.length > MAX_MESSAGES_PER_SESSION) {
            updated = updated.slice(updated.length - MAX_MESSAGES_PER_SESSION);
          }

          // Auto-upsert session if not exists
          let sessionList = [...state.sessionList];
          const sessionIdx = sessionList.findIndex((s) => s.id === sid);
          if (sessionIdx >= 0) {
            sessionList[sessionIdx] = {
              ...sessionList[sessionIdx],
              lastMessageAt: message.timestamp,
              messageCount: updated.length,
              title:
                sessionList[sessionIdx].title === '새 대화' && message.kind === 'text'
                  ? message.content.slice(0, 30)
                  : sessionList[sessionIdx].title,
            };
          } else {
            // Auto-create session (handles chat arriving before cron_session_created)
            sessionList = [
              {
                id: sid,
                title: message.kind === 'text' ? message.content.slice(0, 30) : '새 대화',
                lastMessageAt: message.timestamp,
                source: message.source,
                messageCount: updated.length,
              },
              ...sessionList,
            ];
          }

          // Trim sessions if exceeding max
          if (sessionList.length > MAX_SESSIONS) {
            const sorted = [...sessionList].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
            const removed = sorted.slice(MAX_SESSIONS);
            const removedIds = new Set(removed.map((s) => s.id));
            sessionList = sorted.slice(0, MAX_SESSIONS);
            const sessions = { ...state.sessions, [sid]: updated };
            for (const rid of removedIds) {
              delete sessions[rid];
            }
            return { sessions, sessionList };
          }

          return {
            sessions: { ...state.sessions, [sid]: updated },
            sessionList,
          };
        }),

      createSession: (source) => {
        const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        set((state) => ({
          currentSessionId: id,
          sessionList: [
            {
              id,
              title: '새 대화',
              lastMessageAt: Date.now(),
              source,
              messageCount: 0,
            },
            ...state.sessionList,
          ],
          sessions: { ...state.sessions, [id]: [] },
        }));
        return id;
      },

      registerSession: (id, source) => {
        // Register a session with a specific ID (e.g. from daemon cron_session_created).
        // Idempotent: no-op if session already exists. Does NOT change currentSessionId.
        set((state) => {
          if (state.sessions[id]) return state; // already exists
          return {
            sessionList: [
              {
                id,
                title: '새 대화',
                lastMessageAt: Date.now(),
                source,
                messageCount: 0,
              },
              ...state.sessionList,
            ],
            sessions: { ...state.sessions, [id]: [] },
          };
        });
      },

      switchSession: (sessionId) => set({ currentSessionId: sessionId }),

      setLoading: (isLoading) => set({ isLoading }),
      setTyping: (isTyping) => set({ isTyping }),
      setQueuedMessageId: (queuedMessageId) => set({ queuedMessageId }),
      setMessageState: (messageState) => set({ messageState }),

      updateCursor: (sessionId, entryId) =>
        set((state) => ({
          streamCursors: { ...state.streamCursors, [sessionId]: entryId },
        })),

      updateControlCursor: (controlCursor) => set({ controlCursor }),
    }),
    {
      name: 'wdk-chat-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) =>
        ({
          sessions: state.sessions,
          sessionList: state.sessionList,
          currentSessionId: state.currentSessionId,
          streamCursors: state.streamCursors,
          controlCursor: state.controlCursor,
        }) as unknown as ChatState,
    },
  ),
);
