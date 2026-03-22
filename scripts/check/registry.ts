import type { CheckEntry } from './types.js'

// --- guarded-wdk checks ---
import { noAppImport } from './checks/guarded-wdk/no-app-import.js'
import { noTypeAssertion } from './checks/guarded-wdk/no-type-assertion.js'
import {
  verifierOnlyInBroker,
  domainOpsOnlyViaBroker,
  middlewareNoDirectStore,
  evaluatePolicyOnlyInMiddleware,
  verifierPrimitivesOnlyInVerifier,
  approvalStateOnlyInBroker,
  noPublicVerifierExport
} from './checks/guarded-wdk/responsibility-boundary.js'

// --- daemon checks ---
import { noDaemonDirectWdkStore } from './checks/daemon/no-direct-wdk-store.js'

// --- server checks ---
import { noBrowserGlobals } from './checks/server/no-browser-globals.js'

// --- cross checks ---
import { noCrossPackageImport } from './checks/cross/no-cross-package-import.js'
import { noRequireImports } from './checks/cross/no-require-imports.js'
import { packageExportsBoundary } from './checks/cross/package-exports-boundary.js'
import { deadFiles } from './checks/cross/dead-files.js'
import { deadExportsCheck } from './checks/cross/dead-exports.js'
import { typescriptCompile } from './checks/cross/typescript-compile.js'
import { noEmptyCatch } from './checks/cross/no-empty-catch.js'
import { noConsole } from './checks/cross/no-console.js'
import { noExplicitAny } from './checks/cross/no-explicit-any.js'

export const checks: CheckEntry[] = [
  // guarded-wdk group (2)
  {
    name: 'guarded-wdk/no-app-import',
    description: 'guarded-wdk must not import from daemon, relay, app, or manifest',
    group: 'guarded-wdk',
    fn: noAppImport,
  },
  {
    name: 'guarded-wdk/no-type-assertion',
    description: 'guarded-wdk must not use `as any` or `as unknown as`',
    group: 'guarded-wdk',
    fn: noTypeAssertion,
  },

  // daemon group (1)
  {
    name: 'daemon/no-direct-wdk-store-access',
    description: 'daemon must not runtime-import WdkStore or call getApprovalStore/getBroker',
    group: 'daemon',
    fn: noDaemonDirectWdkStore,
  },

  // server group (1)
  {
    name: 'server/no-browser-globals',
    description: 'daemon and relay must not reference browser globals',
    group: 'server',
    fn: noBrowserGlobals,
  },

  // guarded-wdk responsibility boundary (7)
  {
    name: 'guarded-wdk/verifier-only-in-broker',
    description: 'verifyApproval may only be imported from signed-approval-broker',
    group: 'guarded-wdk',
    fn: verifierOnlyInBroker,
  },
  {
    name: 'guarded-wdk/domain-ops-only-via-broker',
    description: 'createWallet/deleteWallet/revokeSigner calls restricted to broker',
    group: 'guarded-wdk',
    fn: domainOpsOnlyViaBroker,
  },
  {
    name: 'guarded-wdk/middleware-no-direct-store',
    description: 'guarded-middleware must not import store types directly',
    group: 'guarded-wdk',
    fn: middlewareNoDirectStore,
  },
  {
    name: 'guarded-wdk/evaluate-policy-only-in-middleware',
    description: 'evaluatePolicy() calls restricted to guarded-middleware',
    group: 'guarded-wdk',
    fn: evaluatePolicyOnlyInMiddleware,
  },
  {
    name: 'guarded-wdk/verifier-primitives-only-in-verifier',
    description: 'nonce/revocation store primitives restricted to approval-verifier',
    group: 'guarded-wdk',
    fn: verifierPrimitivesOnlyInVerifier,
  },
  {
    name: 'guarded-wdk/approval-state-only-in-broker',
    description: 'pending/history mutations restricted to signed-approval-broker',
    group: 'guarded-wdk',
    fn: approvalStateOnlyInBroker,
  },
  {
    name: 'guarded-wdk/no-public-verifier-export',
    description: 'verifyApproval must not be exported from public API',
    group: 'guarded-wdk',
    fn: noPublicVerifierExport,
  },

  // cross group (5)
  {
    name: 'cross/no-cross-package-import',
    description: 'Packages must not import across forbidden boundaries',
    group: 'cross',
    fn: noCrossPackageImport,
  },
  {
    name: 'cross/no-require-imports',
    description: 'All packages must use ES module imports, not require()',
    group: 'cross',
    fn: noRequireImports,
  },
  {
    name: 'cross/package-exports-boundary',
    description: 'Cross-package imports must go through the public API (index)',
    group: 'cross',
    fn: packageExportsBoundary,
  },
  {
    name: 'cross/dead-files',
    description: 'Detect .ts files not reachable from package entry points',
    group: 'cross',
    fn: deadFiles,
  },
  {
    name: 'cross/dead-exports',
    description: 'Detect exported symbols never imported anywhere in the project',
    group: 'cross',
    fn: deadExportsCheck,
  },
  {
    name: 'cross/no-empty-catch',
    description: 'All packages must not have empty catch blocks (comments do not count)',
    group: 'cross',
    fn: noEmptyCatch,
  },
  {
    name: 'cross/no-console',
    description: 'All packages must not use console.* (use structured logger)',
    group: 'cross',
    fn: noConsole,
  },
  {
    name: 'cross/no-explicit-any',
    description: 'daemon/relay/app/manifest must not use explicit any types',
    group: 'cross',
    fn: noExplicitAny,
  },
  // Phase 2: typescript-compile (외부 JS 라이브러리 타입 불일치 해소 필요)
  // {
  //   name: 'cross/typescript-compile',
  //   description: 'tsc --noEmit must pass for all packages',
  //   group: 'cross',
  //   fn: typescriptCompile,
  // },
]
