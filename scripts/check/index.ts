import { checks } from './registry.js'
import { runChecks } from './runner.js'

/**
 * CLI entry point for the CI check framework.
 *
 * Usage:
 *   npx tsx scripts/check/index.ts              # Run all checks
 *   npx tsx scripts/check/index.ts --check=name  # Run a single check
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  // Parse --check=name flag
  let selectedName: string | null = null
  for (const arg of args) {
    if (arg.startsWith('--check=')) {
      selectedName = arg.slice('--check='.length)
    }
  }

  let entriesToRun = checks

  if (selectedName) {
    const matched = checks.filter(c => c.name === selectedName)
    if (matched.length === 0) {
      console.error(`\n  Unknown check: "${selectedName}"`)
      console.error(`\n  Available checks:`)
      for (const c of checks) {
        console.error(`    - ${c.name}  (${c.description})`)
      }
      process.exit(1)
    }
    entriesToRun = matched
  }

  const summary = await runChecks(entriesToRun)

  process.exit(summary.failed > 0 ? 1 : 0)
}

main().catch((err: unknown) => {
  console.error('Fatal error in check runner:', err)
  process.exit(1)
})
