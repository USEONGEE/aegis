import { create } from 'zustand';

/**
 * Policy store — manages active and pending policies.
 * Active policies: currently enforced by WDK.
 * Pending policies: awaiting owner approval (from AI policyRequest).
 */

export interface Policy {
  id: string;
  chain: string;
  target: string;
  selector: string;
  decision: 'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT';
  constraints?: Record<string, unknown>;
  description?: string;
}

export interface PolicyGroup {
  chain: string;
  policies: Policy[];
  policyVersion: number;
  updatedAt: number;
}

export interface PendingPolicyRequest {
  requestId: string;
  chain: string;
  reason: string;
  policies: Policy[];
  requestedBy: string;        // 'ai' or 'owner'
  createdAt: number;
  expiresAt: number;
}

interface PolicyState {
  activePolicies: PolicyGroup[];
  pendingPolicies: PendingPolicyRequest[];
  isLoading: boolean;

  setActivePolicies: (policies: PolicyGroup[]) => void;
  addPendingPolicy: (request: PendingPolicyRequest) => void;
  removePendingPolicy: (requestId: string) => void;
  setPendingPolicies: (policies: PendingPolicyRequest[]) => void;
  setLoading: (loading: boolean) => void;

  /** Get active policies for a specific chain */
  getChainPolicies: (chain: string) => PolicyGroup | undefined;
}

export const usePolicyStore = create<PolicyState>((set, get) => ({
  activePolicies: [],
  pendingPolicies: [],
  isLoading: false,

  setActivePolicies: (activePolicies) =>
    set({ activePolicies }),

  addPendingPolicy: (request) =>
    set((state) => ({
      pendingPolicies: [...state.pendingPolicies, request],
    })),

  removePendingPolicy: (requestId) =>
    set((state) => ({
      pendingPolicies: state.pendingPolicies.filter((p) => p.requestId !== requestId),
    })),

  setPendingPolicies: (pendingPolicies) =>
    set({ pendingPolicies }),

  setLoading: (isLoading) =>
    set({ isLoading }),

  getChainPolicies: (chain) =>
    get().activePolicies.find((pg) => pg.chain === chain),
}));
