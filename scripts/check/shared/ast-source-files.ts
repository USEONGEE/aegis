/**
 * AST Source Files — shared utility for ts-morph based checks
 *
 * Collects first-party source files across multiple packages using ts-morph Project.
 * Unlike getSourceFiles() in utils.ts which only handles .ts,
 * this properly includes .tsx via tsconfig include patterns.
 */

import * as path from 'path'
import type { SourceFile } from 'ts-morph'
import { getProject } from './ts-project.js'
import { MONOREPO_ROOT } from './utils.js'

const ALL_PACKAGES = [
  'packages/canonical/tsconfig.json',
  'packages/guarded-wdk/tsconfig.json',
  'packages/manifest/tsconfig.json',
  'packages/daemon/tsconfig.json',
  'packages/relay/tsconfig.json',
  'packages/app/tsconfig.json',
  'packages/protocol/tsconfig.json',
]

function buildSrcPrefixes(tsconfigPaths: string[]): string[] {
  return tsconfigPaths.map(t =>
    path.join(MONOREPO_ROOT, path.dirname(t), 'src') + path.sep
  )
}

function isFirstPartySource(filePath: string, srcPrefixes: string[]): boolean {
  if (filePath.includes('node_modules')) return false
  if (filePath.includes('__tests__')) return false
  if (filePath.includes('__fixtures__')) return false
  if (filePath.includes(`${path.sep}dist${path.sep}`)) return false
  if (filePath.endsWith('.d.ts')) return false
  return srcPrefixes.some(prefix => filePath.startsWith(prefix))
}

/**
 * Collect first-party source files from specified packages via ts-morph.
 * Includes .ts and .tsx files, excludes tests/fixtures/dist/node_modules/.d.ts.
 */
export function getAstSourceFiles(tsconfigPaths: string[]): SourceFile[] {
  const srcPrefixes = buildSrcPrefixes(tsconfigPaths)
  const seen = new Set<string>()
  const result: SourceFile[] = []

  for (const tsconfigPath of tsconfigPaths) {
    const project = getProject(tsconfigPath)
    for (const sf of project.getSourceFiles()) {
      const fp = sf.getFilePath()
      if (seen.has(fp)) continue
      seen.add(fp)
      if (isFirstPartySource(fp, srcPrefixes)) {
        result.push(sf)
      }
    }
  }

  return result
}

/** All 7 package tsconfig paths */
export { ALL_PACKAGES }
