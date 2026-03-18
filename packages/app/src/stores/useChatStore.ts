import { create } from 'zustand';

/**
 * Chat store — manages messages for the Chat tab.
 * Messages flow: user -> Relay -> daemon -> OpenClaw -> daemon -> Relay -> app
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sessionId: string;
  metadata?: {
    toolCall?: string;
    status?: string;
  };
}

interface ChatState {
  messages: ChatMessage[];
  currentSessionId: string | null;
  isLoading: boolean;

  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  setSessionId: (sessionId: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  currentSessionId: null,
  isLoading: false,

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  setMessages: (messages) =>
    set({ messages }),

  clearMessages: () =>
    set({ messages: [] }),

  setSessionId: (sessionId) =>
    set({ currentSessionId: sessionId }),

  setLoading: (isLoading) =>
    set({ isLoading }),
}));
