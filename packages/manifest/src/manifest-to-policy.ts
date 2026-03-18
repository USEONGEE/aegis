import type { Manifest, UserConfig, PolicyPermission, Feature } from './types.js'

/** ERC-20 approve(address,uint256) selector */
const APPROVE_SELECTOR = '0x095ea7b3'

/**
 * Convert a Manifest to WDK call policy permissions.
 *
 * For each feature:
 *   - Generate call permissions from feature.calls[]
 *   - Auto-generate approve permissions from feature.approvals[]
 *
 * Apply userConfig overrides:
 *   - features: filter to specific feature IDs
 *   - decision: override default decision for all permissions
 *   - argsConditions: add argument conditions to permissions
 *   - tokenAddresses: map token symbols to addresses
 *   - userAddress: user wallet address
 */
export function manifestToPolicy(
  manifest: Manifest,
  chainId: string,
  userConfig: UserConfig = {}
): PolicyPermission[] {
  const chainConfig = manifest.chains[chainId]
  if (!chainConfig) return []

  const {
    features: enabledFeatures,
    decision,
    argsConditions,
    tokenAddresses = {},
    userAddress
  } = userConfig

  const selectedFeatures: Feature[] = enabledFeatures
    ? chainConfig.features.filter((f: Feature) => enabledFeatures.includes(f.id))
    : chainConfig.features

  const permissions: PolicyPermission[] = []

  for (const feature of selectedFeatures) {
    // 1. Feature calls -> call policy permissions
    for (const call of feature.calls) {
      const contractAddress: string = chainConfig.contracts[call.contract]
      const permission: PolicyPermission = {
        type: 'call',
        address: contractAddress,
        selector: call.selector,
        description: `${manifest.protocol}/${feature.id}: ${call.description}`
      }

      if (decision) {
        permission.decision = decision
      }

      if (argsConditions) {
        permission.argsConditions = { ...argsConditions }
      }

      permissions.push(permission)
    }

    // 2. Feature approvals -> ERC-20 approve permissions (auto-generated)
    for (const approval of feature.approvals) {
      const spenderAddress: string = chainConfig.contracts[approval.spender]
      const permission: PolicyPermission = {
        type: 'call',
        address: '*',
        selector: APPROVE_SELECTOR,
        description: `${manifest.protocol}/${feature.id}: ${approval.description}`,
        constraints: {
          spender: spenderAddress
        }
      }

      if (decision) {
        permission.decision = decision
      }

      permissions.push(permission)
    }
  }

  return permissions
}
