import { readFileSync, existsSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'
import type { CheckResult, Violation } from '../../types.js'
import { getSourceFiles, pkgDir, MONOREPO_ROOT, PACKAGES } from '../../shared/utils.js'

/**
 * Detect dead files: .ts files in src/ that are not reachable from the package's
 * src/index.ts entry point via import/export chains.
 *
 * Uses BFS from entry points following static imports.
 */
export function deadFiles(): CheckResult {
  const name = 'cross/dead-files'
  const violations: Violation[] = []

  for (const pkg of PACKAGES) {
    const dir = pkgDir(pkg)
    const entryPoint = resolve(dir, 'src', 'index.ts')

    if (!existsSync(entryPoint)) continue

    const allFiles = new Set(getSourceFiles(dir).map(f => resolve(f)))
    const reachable = new Set<string>()
    const queue: string[] = [entryPoint]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (reachable.has(current)) continue
      reachable.add(current)

      if (!existsSync(current)) continue

      const content = readFileSync(current, 'utf-8')
      const imports = extractImports(content)

      for (const imp of imports) {
        const resolved = resolveImport(imp, dirname(current))
        if (resolved && allFiles.has(resolved) && !reachable.has(resolved)) {
          queue.push(resolved)
        }
      }
    }

    // Find files that are in allFiles but not reachable
    for (const file of allFiles) {
      if (!reachable.has(file)) {
        violations.push({
          file: relative(MONOREPO_ROOT, file),
          line: 1,
          message: `Dead file: not reachable from ${pkg}/src/index.ts`,
        })
      }
    }
  }

  return { name, passed: violations.length === 0, violations }
}

/**
 * Extract import specifiers from file content.
 */
function extractImports(content: string): string[] {
  const specifiers: string[] = []

  // Static imports/exports: import ... from 'specifier'
  const staticPattern = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = staticPattern.exec(content)) !== null) {
    specifiers.push(match[1])
  }

  // Dynamic imports: import('specifier')
  const dynamicPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = dynamicPattern.exec(content)) !== null) {
    specifiers.push(match[1])
  }

  // Re-export: export * from 'specifier'
  const reexportPattern = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g
  while ((match = reexportPattern.exec(content)) !== null) {
    specifiers.push(match[1])
  }

  return specifiers
}

/**
 * Resolve a relative import specifier to an absolute file path.
 * Handles .js extension mapping to .ts, and index.ts resolution.
 */
function resolveImport(specifier: string, fromDir: string): string | null {
  // Only resolve relative imports
  if (!specifier.startsWith('.')) return null

  // Handle .js -> .ts extension mapping (common in ESM TypeScript)
  let target = specifier
  if (target.endsWith('.js')) {
    target = target.slice(0, -3) + '.ts'
  }

  const absolute = resolve(fromDir, target)

  // Try exact path
  if (existsSync(absolute) && absolute.endsWith('.ts')) {
    return absolute
  }

  // Try with .ts extension
  const withTs = absolute + '.ts'
  if (existsSync(withTs)) {
    return withTs
  }

  // Try as directory with index.ts
  const indexTs = resolve(absolute, 'index.ts')
  if (existsSync(indexTs)) {
    return indexTs
  }

  return null
}
