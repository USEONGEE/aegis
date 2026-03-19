import type { Manifest, UserConfig, Feature, ManifestPermissionDict, ManifestRule } from './types.js'

/** ERC-20 approve(address,uint256) selector */
const APPROVE_SELECTOR = '0x095ea7b3'

/**
 * Convert a Manifest to WDK call policy PermissionDict.
 *
 * For each feature:
 *   - Generate call rules from feature.calls[]
 *   - Auto-generate approve rules from feature.approvals[]
 *
 * Apply userConfig overrides:
 *   - features: filter to specific feature IDs
 *   - decision: override default decision for all rules
 *   - argsConditions: add argument conditions to rules
 *   - tokenAddresses: map token symbols to addresses
 *   - userAddress: user wallet address
 */
export function manifestToPolicy(
  manifest: Manifest,
  chainId: number,
  userConfig: UserConfig = {}
): ManifestPermissionDict {
  const chainConfig = manifest.chains[chainId]
  if (!chainConfig) return {}

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

  const dict: ManifestPermissionDict = {}
  let order = 0

  for (const feature of selectedFeatures) {
    // 1. Feature calls -> call policy rules
    for (const call of feature.calls) {
      const address: string = chainConfig.contracts[call.contract].toLowerCase()
      const selector = call.selector

      if (!dict[address]) dict[address] = {}
      if (!dict[address][selector]) dict[address][selector] = []

      const rule: ManifestRule = {
        order: order++,
        decision: decision || 'REQUIRE_APPROVAL'
      }

      if (argsConditions) {
        rule.args = {}
        for (const [key, value] of Object.entries(argsConditions)) {
          rule.args[key] = { condition: 'EQ', value: value as string }
        }
      }

      dict[address][selector].push(rule)
    }

    // 2. Feature approvals -> ERC-20 approve rules (auto-generated)
    for (const approval of feature.approvals) {
      const spenderAddress: string = chainConfig.contracts[approval.spender].toLowerCase()

      if (!dict['*']) dict['*'] = {}
      if (!dict['*'][APPROVE_SELECTOR]) dict['*'][APPROVE_SELECTOR] = []

      const rule: ManifestRule = {
        order: order++,
        decision: decision || 'REQUIRE_APPROVAL',
        args: {
          0: { condition: 'EQ', value: spenderAddress }
        }
      }

      dict['*'][APPROVE_SELECTOR].push(rule)
    }
  }

  return dict
}
