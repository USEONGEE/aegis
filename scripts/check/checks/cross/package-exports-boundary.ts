import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import type { CheckResult, Violation } from '../../types.js'
import { getSourceFiles, pkgDir, MONOREPO_ROOT, PACKAGES } from '../../shared/utils.js'

/**
 * Cross-package imports must go through the package's public API (index).
 *
 * Heuristic: when importing from a workspace package (@wdk-app/xxx),
 * the import path must be just the package name — no deep imports
 * into internal modules.
 *
 * Allowed:
 *   import { foo } from '@wdk-app/canonical'
 *   import { foo } from '@wdk-app/canonical/index'
 *
 * Forbidden:
 *   import { foo } from '@wdk-app/canonical/src/internal'
 *   import { foo } from '@wdk-app/guarded-wdk/src/approval-store'
 */
export function packageExportsBoundary(): CheckResult {
  const name = 'cross/package-exports-boundary'
  const violations: Violation[] = []

  const workspacePackages = PACKAGES.map(p => `@wdk-app/${p}`)
  const importPattern = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g
  const dynamicImportPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const pkg of PACKAGES) {
    const files = getSourceFiles(pkgDir(pkg))

    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        for (const pattern of [importPattern, dynamicImportPattern]) {
          pattern.lastIndex = 0
          let match: RegExpExecArray | null
          while ((match = pattern.exec(line)) !== null) {
            const specifier = match[1]

            // Only check workspace package imports
            const matchedPkg = workspacePackages.find(ws => specifier.startsWith(ws))
            if (!matchedPkg) continue

            // Skip self-imports (within the same package)
            const importedPkgName = matchedPkg.replace('@wdk-app/', '')
            if (importedPkgName === pkg) continue

            // The specifier after the package name
            const rest = specifier.slice(matchedPkg.length)

            // Allowed: exact package name, or /index
            if (rest === '' || rest === '/index' || rest === '/index.js' || rest === '/index.ts') {
              continue
            }

            violations.push({
              file: relative(MONOREPO_ROOT, filePath),
              line: i + 1,
              message: `Deep import "${specifier}" bypasses package boundary — import from "${matchedPkg}" instead`,
            })
          }
        }
      }
    }
  }

  return { name, passed: violations.length === 0, violations }
}
