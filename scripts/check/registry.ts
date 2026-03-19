import type { CheckEntry } from './types.js'

// --- guarded-wdk checks ---
import { noAppImport } from './checks/guarded-wdk/no-app-import.js'
import { noTypeAssertion } from './checks/guarded-wdk/no-type-assertion.js'

// --- server checks ---
import { noBrowserGlobals } from './checks/server/no-browser-globals.js'

// --- cross checks ---
import { noCrossPackageImport } from './checks/cross/no-cross-package-import.js'
import { noRequireImports } from './checks/cross/no-require-imports.js'
import { packageExportsBoundary } from './checks/cross/package-exports-boundary.js'
import { deadFiles } from './checks/cross/dead-files.js'
import { typescriptCompile } from './checks/cross/typescript-compile.js'

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

  // server group (1)
  {
    name: 'server/no-browser-globals',
    description: 'daemon and relay must not reference browser globals',
    group: 'server',
    fn: noBrowserGlobals,
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
  // Phase 2: typescript-compile (외부 JS 라이브러리 타입 불일치 해소 필요)
  // {
  //   name: 'cross/typescript-compile',
  //   description: 'tsc --noEmit must pass for all packages',
  //   group: 'cross',
  //   fn: typescriptCompile,
  // },
]
