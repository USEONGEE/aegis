import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import type { ApprovalRequest } from '../../core/approval/types';

/**
 * TxApprovalContext — state machine for transaction approval flow.
 * Pattern borrowed from HypurrQuant: idle -> pending -> signing -> success/error
 *
 * Features:
 * - Queue management: multiple pending approvals queued, processed one at a time
 * - State machine: idle | pending | signing | success | error
 * - Auto-advance: success state auto-advances to next in queue after delay
 * - Dismiss/reopen: user can dismiss sheet without rejecting
 */

// --- Types ---

export type TxApprovalStatus = 'idle' | 'pending' | 'signing' | 'success' | 'error';

export type TxApprovalState =
  | { status: 'idle' }
  | { status: 'pending'; request: ApprovalRequest }
  | { status: 'signing' }
  | { status: 'success'; txHash: string }
  | { status: 'error'; message: string };

interface QueueItem {
  request: ApprovalRequest;
  resolve: (result: { txHash: string }) => void;
  reject: (error: Error) => void;
}

export interface TxApprovalContextValue {
  state: TxApprovalState;
  requestApproval: (request: ApprovalRequest) => Promise<{ txHash: string }>;
  reject: () => void;
}

export interface TxApprovalInternalValue {
  approve: () => void;
  dismiss: () => void;
  reopen: () => void;
  retry: () => void;
  skip: () => void;
  queueLength: number;
  sheetVisible: boolean;
}

// --- Contexts ---

const TxApprovalCtx = createContext<TxApprovalContextValue | null>(null);
const TxApprovalInternalCtx = createContext<TxApprovalInternalValue>({
  approve: () => {},
  dismiss: () => {},
  reopen: () => {},
  retry: () => {},
  skip: () => {},
  queueLength: 0,
  sheetVisible: false,
});

// --- Provider ---

const SUCCESS_DELAY_MS = 1500;

interface TxApprovalProviderProps {
  executor?: (request: ApprovalRequest) => Promise<{ txHash: string }>;
  children: React.ReactNode;
}

export function TxApprovalProvider({ executor, children }: TxApprovalProviderProps) {
  const [state, setState] = useState<TxApprovalState>({ status: 'idle' });
  const [queueLength, setQueueLength] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);

  const queueRef = useRef<QueueItem[]>([]);
  const currentItemRef = useRef<QueueItem | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateQueueLength = useCallback(() => {
    setQueueLength(queueRef.current.length + (currentItemRef.current ? 1 : 0));
  }, []);

  const presentSheet = useCallback(() => {
    setSheetVisible(true);
  }, []);

  const processNext = useCallback(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }

    const next = queueRef.current.shift();
    if (next) {
      currentItemRef.current = next;
      setState({ status: 'pending', request: next.request });
      updateQueueLength();
      presentSheet();
    } else {
      currentItemRef.current = null;
      setState({ status: 'idle' });
      updateQueueLength();
      setSheetVisible(false);
    }
  }, [updateQueueLength, presentSheet]);

  const requestApproval = useCallback(
    (request: ApprovalRequest): Promise<{ txHash: string }> => {
      return new Promise((resolve, reject) => {
        const item: QueueItem = { request, resolve, reject };

        if (!currentItemRef.current) {
          currentItemRef.current = item;
          setState({ status: 'pending', request });
          updateQueueLength();
          presentSheet();
        } else {
          queueRef.current.push(item);
          updateQueueLength();
        }
      });
    },
    [updateQueueLength, presentSheet],
  );

  const executeTransaction = useCallback(async () => {
    const item = currentItemRef.current;
    if (!item) return;

    setState({ status: 'signing' });

    try {
      let result: { txHash: string };
      if (executor) {
        result = await executor(item.request);
      } else {
        // Mock executor for development
        await new Promise(r => setTimeout(r, 1500));
        result = { txHash: '0xmock_tx_hash_for_dev_testing_0000000000000000' };
      }

      setState({ status: 'success', txHash: result.txHash });
      item.resolve(result);

      successTimerRef.current = setTimeout(() => {
        successTimerRef.current = null;
        processNext();
      }, SUCCESS_DELAY_MS);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ status: 'error', message });
    }
  }, [executor, processNext]);

  const approve = useCallback(async () => {
    await executeTransaction();
  }, [executeTransaction]);

  const reject = useCallback(() => {
    const item = currentItemRef.current;
    if (item) {
      item.reject(new Error('User rejected'));
    }
    processNext();
  }, [processNext]);

  const dismiss = useCallback(() => {
    setSheetVisible(false);
  }, []);

  const reopen = useCallback(() => {
    if (currentItemRef.current) {
      presentSheet();
    }
  }, [presentSheet]);

  const retry = useCallback(async () => {
    if (state.status === 'error' && currentItemRef.current) {
      await executeTransaction();
    }
  }, [state.status, executeTransaction]);

  const skip = useCallback(() => {
    const item = currentItemRef.current;
    if (item && state.status === 'error') {
      item.reject(new Error('User skipped'));
      processNext();
    }
  }, [state.status, processNext]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  return (
    <TxApprovalCtx.Provider value={{ state, requestApproval, reject }}>
      <TxApprovalInternalCtx.Provider
        value={{ approve, dismiss, reopen, retry, skip, queueLength, sheetVisible }}
      >
        {children}
      </TxApprovalInternalCtx.Provider>
    </TxApprovalCtx.Provider>
  );
}

// --- Hooks ---

export function useTxApproval(): TxApprovalContextValue {
  const ctx = useContext(TxApprovalCtx);
  if (!ctx) throw new Error('useTxApproval must be used within TxApprovalProvider');
  return ctx;
}

export function useTxApprovalInternal(): TxApprovalInternalValue {
  return useContext(TxApprovalInternalCtx);
}
