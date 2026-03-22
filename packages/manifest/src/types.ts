import type { ArgCondition, Rule, PermissionDict, Decision } from '@wdk-app/guarded-wdk'
export type { ArgCondition, Rule, PermissionDict, Decision }

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
export interface ValidationResultValid {
  valid: true
}

export interface ValidationResultInvalid {
  valid: false
  errors: string[]
}

export type ValidationResult = ValidationResultValid | ValidationResultInvalid

/**
 * User configuration overrides for manifestToPolicy.
 */
export interface UserConfig {
  /** Feature IDs to enable (all if omitted) */
  features?: string[]
  /** Override decision for all generated rules */
  decision?: Decision
  /** Additional argument conditions */
  argsConditions?: Record<string, string>
}

export const Types = {}
