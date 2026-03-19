import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import type { CheckResult, Violation } from '../../types.js'
import { getSourceFiles, pkgDir, MONOREPO_ROOT } from '../../shared/utils.js'

/**
 * Server packages (daemon, relay) must not reference browser globals:
 * window, document, navigator, localStorage, sessionStorage.
 *
 * These indicate client-side code leaking into server packages.
 */
export function noBrowserGlobals(): CheckResult {
  const name = 'server/no-browser-globals'
  const violations: Violation[] = []

  const serverPackages = ['daemon', 'relay']
  const browserGlobals = ['window', 'document', 'navigator', 'localStorage', 'sessionStorage']

  // Match standalone usage (not in comments, strings, or property access chains like "sliding-window")
  // Use word boundary to avoid false positives
  const pattern = new RegExp(
    `(?<!\\w\\.)\\b(${browserGlobals.join('|')})\\b(?![-\\w])`,
    'g'
  )

  for (const pkg of serverPackages) {
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

        // Skip lines that are purely in string literals (rough heuristic)
        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(line)) !== null) {
          const global = match[1]

          // Additional false-positive check: skip if inside a string or comment on this line
          const beforeMatch = line.slice(0, match.index)
          const singleQuotes = (beforeMatch.match(/'/g) || []).length
          const doubleQuotes = (beforeMatch.match(/"/g) || []).length
          const backticks = (beforeMatch.match(/`/g) || []).length

          // If odd number of quotes before the match, it's likely inside a string
          if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0 || backticks % 2 !== 0) {
            continue
          }

          // Skip inline comments
          const commentIndex = line.indexOf('//')
          if (commentIndex >= 0 && commentIndex < match.index) {
            continue
          }

          violations.push({
            file: relative(MONOREPO_ROOT, filePath),
            line: i + 1,
            message: `Browser global "${global}" found in server package`,
          })
        }
      }
    }
  }

  return { name, passed: violations.length === 0, violations }
}
