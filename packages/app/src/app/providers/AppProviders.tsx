import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TxApprovalProvider } from '../../shared/tx/TxApprovalContext';
import { ToastProvider } from '../../shared/ui/ToastProvider';
import { SignedApprovalBuilder } from '../../core/approval/SignedApprovalBuilder';
import { IdentityKeyManager } from '../../core/identity/IdentityKeyManager';
import { RelayClient } from '../../core/relay/RelayClient';

/**
 * Global Provider tree.
 * Order: SafeArea → Navigation → TxApproval → Toast → children
 *
 * The executor wires SignedApprovalBuilder through RelayClient:
 *  1. Build SignedApproval envelope from the approval request
 *  2. Send via RelayClient to daemon (control channel)
 *  3. Await daemon confirmation
 */
async function approvalExecutor(request: {
  type: string;
  targetHash: string;
  chain: string;
  requestId: string;
}): Promise<{ txHash: `0x${string}` }> {
  const identity = IdentityKeyManager.getInstance();
  const keyPair = await identity.load();

  if (!keyPair) {
    throw new Error('Identity key not found. Please complete device pairing first.');
  }

  const builder = new SignedApprovalBuilder(keyPair);
  const signedApproval = builder.forTx({
    targetHash: request.targetHash,
    chain: request.chain,
    requestId: request.requestId,
  });

  const relay = RelayClient.getInstance();
  const result = await relay.sendApproval(signedApproval);

  return { txHash: result.txHash as `0x${string}` };
}

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <TxApprovalProvider executor={approvalExecutor}>
          <ToastProvider>
            {children}
          </ToastProvider>
        </TxApprovalProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
