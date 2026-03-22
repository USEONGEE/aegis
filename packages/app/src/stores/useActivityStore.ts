import { create } from 'zustand';

/**
 * Activity store — event timeline from daemon's Guarded WDK events.
 * Events are streamed via Relay in real-time.
 */

export type ActivityEventType =
  | 'IntentProposed'
  | 'PolicyEvaluated'
  | 'ApprovalRequested'
  | 'ApprovalVerified'
  | 'ApprovalRejected'
  | 'ApprovalFailed'
  | 'ExecutionBroadcasted'
  | 'ExecutionSettled'
  | 'ExecutionFailed'
  | 'TransactionSigned'
  | 'PendingPolicyRequested'
  | 'PolicyApplied'
  | 'SignerRevoked'
  | 'WalletCreated'
  | 'WalletDeleted';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  chainId: number | null;
  summary: string;
  details: Record<string, unknown> | null;
  timestamp: number;
}

export type ActivityFilter = ActivityEventType | 'all';

interface ActivityState {
  events: ActivityEvent[];
  filter: ActivityFilter;
  isLoading: boolean;

  addEvent: (event: ActivityEvent) => void;
  setEvents: (events: ActivityEvent[]) => void;
  clearEvents: () => void;
  setFilter: (filter: ActivityFilter) => void;
  setLoading: (loading: boolean) => void;

  /** Get filtered events */
  getFilteredEvents: () => ActivityEvent[];
}

const MAX_EVENTS = 500;

export const useActivityStore = create<ActivityState>((set, get) => ({
  events: [],
  filter: 'all',
  isLoading: false,

  addEvent: (event) =>
    set((state) => {
      const events = [event, ...state.events].slice(0, MAX_EVENTS);
      return { events };
    }),

  setEvents: (events) =>
    set({ events }),

  clearEvents: () =>
    set({ events: [] }),

  setFilter: (filter) =>
    set({ filter }),

  setLoading: (isLoading) =>
    set({ isLoading }),

  getFilteredEvents: () => {
    const { events, filter } = get();
    if (filter === 'all') return events;
    return events.filter((e) => e.type === filter);
  },
}));
