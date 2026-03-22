import { create } from 'zustand';

/**
 * Policy store — manages active and pending policies.
 * Active policies: currently enforced by WDK.
 * Pending policies: awaiting owner approval (from AI policyRequest).
 */

export interface Policy {
  id: string;
  chainId: number;
  target: string;
  selector: string;
  decision: 'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT';
  constraints: Record<string, unknown> | null;
  description: string | null;
}

export interface PolicyGroup {
  chainId: number;
  policies: Policy[];
  policyVersion: number;
  updatedAt: number;
}

export interface PendingPolicyRequest {
  requestId: string;
  chainId: number;
  accountIndex: number;
  reason: string;
  policies: Policy[];
  rawPolicies: unknown[];     // daemon's native CallPolicy format for transmission
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
  getChainPolicies: (chainId: number) => PolicyGroup | undefined;
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

  getChainPolicies: (chainId) =>
    get().activePolicies.find((pg) => pg.chainId === chainId),
}));
