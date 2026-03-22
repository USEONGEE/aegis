import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TxApprovalProvider } from '../../shared/tx/TxApprovalContext';
import { ToastProvider } from '../../shared/ui/ToastProvider';
import type { ApprovalRequest } from '../../core/approval/types';
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
async function approvalExecutor(request: ApprovalRequest): Promise<{ txHash: `0x${string}` }> {
  const identity = IdentityKeyManager.getInstance();
  const keyPair = await identity.load();

  if (!keyPair) {
    throw new Error('Identity key not found. Please generate an identity key first.');
  }

  const builder = new SignedApprovalBuilder(keyPair);

  // Gap 10: branch on request.type to use the correct builder method
  let signedApproval;
  switch (request.type) {
    case 'tx':
      signedApproval = builder.forTx({
        targetHash: request.targetHash,
        chainId: request.chainId,
        requestId: request.requestId,
        accountIndex: request.accountIndex,
        content: request.content,
        policyVersion: request.policyVersion,
      });
      break;

    case 'policy':
      signedApproval = builder.forPolicy({
        targetHash: request.targetHash,
        chainId: request.chainId,
        requestId: request.requestId,
        accountIndex: request.accountIndex,
        content: request.content,
      });
      break;

    case 'policy_reject':
      signedApproval = builder.forPolicyReject({
        targetHash: request.targetHash,
        chainId: request.chainId,
        requestId: request.requestId,
        accountIndex: request.accountIndex,
        content: request.content,
      });
      break;

    case 'device_revoke':
      signedApproval = builder.forDeviceRevoke({
        targetPublicKey: request.targetPublicKey ?? request.requestId,  // fallback should never happen; targetPublicKey is required for device_revoke
        chainId: request.chainId,
        accountIndex: request.accountIndex,
        content: request.content,
      });
      break;

    case 'wallet_create':
    case 'wallet_delete':
      signedApproval = builder.forWallet({
        type: request.type,
        targetHash: request.targetHash,
        chainId: request.chainId,
        requestId: request.requestId,
        accountIndex: request.accountIndex,
        content: request.content,
      });
      break;

    default:
      throw new Error(`Unknown approval type: ${request.type}`);
  }

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
