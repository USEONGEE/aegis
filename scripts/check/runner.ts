import type { CheckEntry, CheckResult } from './types.js'

export interface RunSummary {
  passed: number
  failed: number
  total: number
  results: CheckResult[]
}

/**
 * Run an array of checks, collect results, and pretty-print.
 */
export async function runChecks(entries: CheckEntry[]): Promise<RunSummary> {
  const results: CheckResult[] = []
  let passed = 0
  let failed = 0

  console.log(`\nRunning ${entries.length} check(s)...\n`)
  console.log('─'.repeat(60))

  for (const entry of entries) {
    try {
      const result = await entry.fn()
      results.push(result)

      if (result.passed) {
        passed++
        console.log(`  ✅ PASS  ${result.name}`)
      } else {
        failed++
        console.log(`  ❌ FAIL  ${result.name}  (${result.violations.length} violation(s))`)
        for (const v of result.violations) {
          console.log(`           ${v.file}:${v.line} — ${v.message}`)
        }
      }
    } catch (err: unknown) {
      failed++
      const errorMessage = err instanceof Error ? err.message : String(err)
      results.push({
        name: entry.name,
        passed: false,
        violations: [{ file: '(runtime)', line: 0, message: `Check threw: ${errorMessage}` }],
      })
      console.log(`  ❌ FAIL  ${entry.name}  (check threw an error)`)
      console.log(`           ${errorMessage}`)
    }
  }

  console.log('─'.repeat(60))
  console.log(`\n  Total: ${entries.length}  |  Passed: ${passed}  |  Failed: ${failed}\n`)

  return { passed, failed, total: entries.length, results }
}
