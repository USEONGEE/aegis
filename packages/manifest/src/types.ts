/**
 * Constraint type for features.
 */
export interface Constraint {
  /** Constraint type ('maxAmount' | 'allowedTokens' | 'allowedRecipients') */
  type: string
  /** Constraint value (varies by type) */
  value: unknown
  /** Constraint description */
  description: string
}

/**
 * A contract call definition within a feature.
 */
export interface Call {
  /** Contract reference key (key in contracts map, e.g., 'pool') */
  contract: string
  /** 4-byte function selector (e.g., '0x617ba037') */
  selector: string
  /** Function signature (e.g., 'supply(address,uint256,address,uint16)') */
  signature: string
  /** Call description */
  description: string
}

/**
 * An ERC-20 approval definition within a feature.
 */
export interface Approval {
  /** Token contract reference key or address */
  token: string
  /** Spender contract reference key (e.g., 'pool') */
  spender: string
  /** Approval description (e.g., 'Approve USDC for Aave Pool') */
  description: string
}

/**
 * A protocol feature (e.g., supply, borrow, repay).
 */
export interface Feature {
  /** Feature identifier (e.g., 'supply', 'borrow', 'repay') */
  id: string
  /** Display name */
  name: string
  /** Feature description */
  description: string
  /** Contract calls this feature executes */
  calls: Call[]
  /** ERC-20 approve calls required by this feature */
  approvals: Approval[]
  /** Constraints for this feature */
  constraints: Constraint[]
}

/**
 * Chain-specific configuration within a manifest.
 */
export interface ChainConfig {
  /** Chain identifier (e.g., 1, 137) */
  chainId: number
  /** Contract address map (e.g., { pool: '0x...', oracle: '0x...' }) */
  contracts: Record<string, string>
  /** Supported feature list */
  features: Feature[]
}

/**
 * A protocol manifest describing supported features and contract calls.
 */
export interface Manifest {
  /** Protocol name (e.g., 'aave-v3') */
  protocol: string
  /** Manifest version (e.g., '1.0.0') */
  version: string
  /** Protocol description */
  description: string
  /** chainId -> ChainConfig */
  chains: Record<number, ChainConfig>
}

/**
 * Validation result returned by validateManifest.
 */
export interface ValidationResult {
  valid: boolean
  errors?: string[]
}

/**
 * User configuration overrides for manifestToPolicy.
 */
export interface UserConfig {
  /** Feature IDs to enable (all if omitted) */
  features?: string[]
  /** Override decision for all generated rules */
  decision?: 'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'
  /** Additional argument conditions */
  argsConditions?: Record<string, string>
  /** Token symbol -> address map */
  tokenAddresses?: Record<string, string>
  /** User wallet address */
  userAddress?: string
}

/**
 * A single WDK policy permission (flat format).
 * @deprecated Use ManifestPermissionDict / ManifestRule instead.
 * Kept for backward compatibility only.
 */
export interface PolicyPermission {
  type: string
  target: string
  selector: string
  description: string
  args?: Record<string, ManifestArgCondition>
  valueLimit?: string | number
  decision: 'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'
}

/**
 * Argument condition for a rule.
 * Identical to guarded-wdk ArgCondition.
 */
export interface ManifestArgCondition {
  condition: 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'ONE_OF' | 'NOT_ONE_OF'
  value: string | string[]
}

/**
 * A single rule in a PermissionDict bucket.
 * Structurally identical to guarded-wdk Rule — output can be used directly
 * as CallPolicy.permissions without conversion.
 */
export interface ManifestRule {
  order: number
  args?: Record<string, ManifestArgCondition>
  valueLimit?: string | number
  decision: 'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'
}

/**
 * Dictionary-based permission structure.
 * Structurally compatible with guarded-wdk PermissionDict.
 */
export interface ManifestPermissionDict {
  [target: string]: {
    [selector: string]: ManifestRule[]
  }
}

export const Types = {}
