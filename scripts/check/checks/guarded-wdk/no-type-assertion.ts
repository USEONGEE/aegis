import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import type { CheckResult, Violation } from '../../types.js'
import { getSourceFiles, pkgDir, MONOREPO_ROOT } from '../../shared/utils.js'

/**
 * guarded-wdk must not use `as any` or `as unknown as` type assertions.
 * These bypass TypeScript's type system and can hide bugs.
 */
export function noTypeAssertion(): CheckResult {
  const name = 'guarded-wdk/no-type-assertion'
  const violations: Violation[] = []
  const files = getSourceFiles(pkgDir('guarded-wdk'))

  const patterns = [
    { regex: /\bas\s+any\b/g, label: 'as any' },
    { regex: /\bas\s+unknown\s+as\b/g, label: 'as unknown as' },
  ]

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip comment-only lines
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue
      }

      for (const { regex, label } of patterns) {
        regex.lastIndex = 0
        if (regex.test(line)) {
          violations.push({
            file: relative(MONOREPO_ROOT, filePath),
            line: i + 1,
            message: `Type assertion "${label}" found`,
          })
        }
      }
    }
  }

  return { name, passed: violations.length === 0, violations }
}
