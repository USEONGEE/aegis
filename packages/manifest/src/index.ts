export { validateManifest } from './validate-manifest.js'
export { manifestToPolicy } from './manifest-to-policy.js'
export { Types } from './types.js'
export type {
  Manifest,
  ChainConfig,
  Feature,
  Call,
  Approval,
  ValidationResult,
  ValidationResultValid,
  ValidationResultInvalid,
  UserConfig
} from './types.js'

// Policy types: re-exported from guarded-wdk via types.ts
export type { ArgCondition, Rule, PermissionDict, Decision } from './types.js'

// Examples
export { aaveV3Manifest } from './examples/aave-v3.js'
export { uniswapV2Manifest } from './examples/uniswap-v2.js'
export { kittenSwapManifest } from './examples/kittenswap.js'
