import { create } from 'zustand';
import type { ApprovalRequest } from '../core/approval/types';

/**
 * Approval store — manages pending tx approvals.
 * These are REQUIRE_APPROVAL decisions from the daemon's policy evaluation.
 */

interface ApprovalState {
  pendingApprovals: ApprovalRequest[];
  isLoading: boolean;

  addApproval: (approval: ApprovalRequest) => void;
  removeApproval: (requestId: string) => void;
  setApprovals: (approvals: ApprovalRequest[]) => void;
  setLoading: (loading: boolean) => void;
  getApproval: (requestId: string) => ApprovalRequest | undefined;
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  pendingApprovals: [],
  isLoading: false,

  addApproval: (approval) =>
    set((state) => {
      // Dedupe by requestId
      const exists = state.pendingApprovals.some(
        (a) => a.requestId === approval.requestId,
      );
      if (exists) return state;
      return { pendingApprovals: [...state.pendingApprovals, approval] };
    }),

  removeApproval: (requestId) =>
    set((state) => ({
      pendingApprovals: state.pendingApprovals.filter(
        (a) => a.requestId !== requestId,
      ),
    })),

  setApprovals: (approvals) =>
    set({ pendingApprovals: approvals }),

  setLoading: (isLoading) =>
    set({ isLoading }),

  getApproval: (requestId) =>
    get().pendingApprovals.find((a) => a.requestId === requestId),
}));
