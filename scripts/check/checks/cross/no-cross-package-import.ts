import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import type { CheckResult, Violation } from '../../types.js'
import { getSourceFiles, pkgDir, MONOREPO_ROOT } from '../../shared/utils.js'

/**
 * Enforce package boundary rules:
 * - daemon must not import from relay or app
 * - relay must not import from daemon or app
 * - app must not import from daemon or relay
 * - guarded-wdk -> canonical is allowed (via @wdk-app/canonical)
 */
export function noCrossPackageImport(): CheckResult {
  const name = 'cross/no-cross-package-import'
  const violations: Violation[] = []

  const rules: Array<{ pkg: string; forbidden: string[] }> = [
    { pkg: 'daemon', forbidden: ['relay', 'app'] },
    { pkg: 'relay', forbidden: ['daemon', 'app'] },
    { pkg: 'app', forbidden: ['daemon', 'relay'] },
  ]

  const importPattern = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g
  const dynamicImportPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const { pkg, forbidden } of rules) {
    const files = getSourceFiles(pkgDir(pkg))

    const forbiddenWorkspace = forbidden.map(f => `@wdk-app/${f}`)
    const forbiddenRelative = forbidden.map(f => `packages/${f}`)

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

            if (forbiddenWorkspace.some(ws => specifier === ws || specifier.startsWith(ws + '/'))) {
              violations.push({
                file: relative(MONOREPO_ROOT, filePath),
                line: i + 1,
                message: `Package "${pkg}" must not import from "${specifier}"`,
              })
            }

            if (forbiddenRelative.some(rel => specifier.includes(rel))) {
              violations.push({
                file: relative(MONOREPO_ROOT, filePath),
                line: i + 1,
                message: `Package "${pkg}" must not import from "${specifier}" (relative path)`,
              })
            }
          }
        }
      }
    }
  }

  return { name, passed: violations.length === 0, violations }
}
