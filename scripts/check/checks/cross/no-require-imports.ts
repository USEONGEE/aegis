import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import type { CheckResult, Violation } from '../../types.js'
import { getSourceFiles, pkgDir, MONOREPO_ROOT, PACKAGES } from '../../shared/utils.js'

/**
 * All packages must use ES module imports, not require().
 * Scans all .ts files under each package's src/ directory (excludes tests).
 */
export function noRequireImports(): CheckResult {
  const name = 'cross/no-require-imports'
  const violations: Violation[] = []

  // Match require() calls but not comments about require
  // Handles: require('foo'), require("foo"), require(`foo`)
  const requirePattern = /\brequire\s*\(/g

  for (const pkg of PACKAGES) {
    const files = getSourceFiles(pkgDir(pkg))

    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Skip comment lines
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue
        }

        requirePattern.lastIndex = 0
        if (requirePattern.test(line)) {
          // Skip if the require is in an inline comment
          const commentIndex = line.indexOf('//')
          const requireIndex = line.indexOf('require(')
          if (commentIndex >= 0 && commentIndex < requireIndex) {
            continue
          }

          violations.push({
            file: relative(MONOREPO_ROOT, filePath),
            line: i + 1,
            message: `require() call found — use ES module import instead`,
          })
        }
      }
    }
  }

  return { name, passed: violations.length === 0, violations }
}
