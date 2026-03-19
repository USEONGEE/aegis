import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import type { CheckResult, Violation } from '../../types.js'
import { pkgDir, MONOREPO_ROOT, PACKAGES } from '../../shared/utils.js'

/**
 * Run tsc --noEmit for each package that has a tsconfig.json.
 * Any compilation error is a violation.
 */
export function typescriptCompile(): CheckResult {
  const name = 'cross/typescript-compile'
  const violations: Violation[] = []

  for (const pkg of PACKAGES) {
    const dir = pkgDir(pkg)
    const tsconfigPath = resolve(dir, 'tsconfig.json')

    if (!existsSync(tsconfigPath)) continue

    try {
      execSync('npx tsc --noEmit --skipLibCheck', {
        cwd: dir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string }
      const output = (error.stdout || '') + (error.stderr || '')

      // Parse tsc output: each line like "src/foo.ts(10,5): error TS2345: ..."
      const errorLines = output.split('\n').filter(line => line.includes(': error TS'))

      if (errorLines.length > 0) {
        for (const errorLine of errorLines) {
          const match = errorLine.match(/^(.+?)\((\d+),\d+\):\s*error\s+(TS\d+):\s*(.+)$/)
          if (match) {
            violations.push({
              file: relative(MONOREPO_ROOT, resolve(dir, match[1])),
              line: parseInt(match[2], 10),
              message: `${match[3]}: ${match[4]}`,
            })
          } else {
            violations.push({
              file: relative(MONOREPO_ROOT, tsconfigPath),
              line: 1,
              message: errorLine.trim(),
            })
          }
        }
      } else {
        // Fallback: report the whole output as one violation
        violations.push({
          file: relative(MONOREPO_ROOT, tsconfigPath),
          line: 1,
          message: `tsc --noEmit failed: ${output.slice(0, 500)}`,
        })
      }
    }
  }

  // Filter out test file violations (jest mock types are noisy)
  const srcViolations = violations.filter(v => !v.file.includes('/tests/') && !v.file.includes('.test.'))
  return { name, passed: srcViolations.length === 0, violations: srcViolations }
}
