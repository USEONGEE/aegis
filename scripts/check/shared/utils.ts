import { resolve, dirname } from 'node:path'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const MONOREPO_ROOT = resolve(__dirname, '..', '..', '..')

export const PACKAGES = ['canonical', 'guarded-wdk', 'manifest', 'daemon', 'relay', 'app'] as const

export type PackageName = (typeof PACKAGES)[number]

/**
 * Get all .ts source files under a package's src/ directory (non-recursive through node_modules).
 * Excludes __tests__, __fixtures__, and node_modules.
 */
export function getSourceFiles(pkgDir: string): string[] {
  const srcDir = resolve(pkgDir, 'src')
  if (!existsSync(srcDir)) return []
  return collectTsFiles(srcDir)
}

function collectTsFiles(dir: string): string[] {
  const results: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__fixtures__' || entry.name === 'dist') {
      continue
    }
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath)
    }
  }

  return results
}

/**
 * Check if a string matches a pattern (simple substring or regex).
 */
export function matchPattern(code: string, pattern: RegExp): boolean {
  return pattern.test(code)
}

/**
 * Resolve a package directory from its name.
 */
export function pkgDir(name: string): string {
  return resolve(MONOREPO_ROOT, 'packages', name)
}
