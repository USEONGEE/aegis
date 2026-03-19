import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import type { CheckResult, Violation } from '../../types.js'
import { getSourceFiles, pkgDir, MONOREPO_ROOT } from '../../shared/utils.js'

/**
 * guarded-wdk must not import from daemon, relay, app, or manifest.
 * Exception: @wdk-app/canonical is allowed.
 */
export function noAppImport(): CheckResult {
  const name = 'guarded-wdk/no-app-import'
  const violations: Violation[] = []
  const files = getSourceFiles(pkgDir('guarded-wdk'))

  // Forbidden package references (both workspace and relative path forms)
  const forbiddenPackages = ['@wdk-app/daemon', '@wdk-app/relay', '@wdk-app/app', '@wdk-app/manifest']
  const forbiddenRelativePaths = ['packages/daemon', 'packages/relay', 'packages/app', 'packages/manifest']

  // Match import/export from statements and dynamic imports
  const importPattern = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g
  const dynamicImportPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

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

          // Check forbidden workspace package imports
          if (forbiddenPackages.some(pkg => specifier === pkg || specifier.startsWith(pkg + '/'))) {
            violations.push({
              file: relative(MONOREPO_ROOT, filePath),
              line: i + 1,
              message: `Forbidden import from "${specifier}" in guarded-wdk`,
            })
          }

          // Check forbidden relative path imports
          if (forbiddenRelativePaths.some(rel => specifier.includes(rel))) {
            violations.push({
              file: relative(MONOREPO_ROOT, filePath),
              line: i + 1,
              message: `Forbidden relative import from "${specifier}" in guarded-wdk`,
            })
          }
        }
      }
    }
  }

  return { name, passed: violations.length === 0, violations }
}
