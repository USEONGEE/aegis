/**
 * Dead Exports Detection  [cross]
 *
 * export되었지만 프로젝트 어디에서도 import하지 않는 심볼 감지.
 * dead-files 체크의 사각지대(파일 내 미사용 export)를 보완.
 *
 * 알고리즘:
 *   1. 7개 패키지에서 src/ 하위 소스 파일 수집
 *   2. getExportedDeclarations()로 export → canonical origin 해소
 *   3. ImportDeclaration만 스캔 (re-export는 소비자 아님)
 *   4. resolveCanonicalOrigin으로 import → canonical origin 마킹
 *   5. 마킹되지 않은 export = dead export 보고
 *
 * 포팅 원본: HypurrQuant dead-exports.ts
 */

import * as path from 'path'
import type { SourceFile, ImportSpecifier, Node } from 'ts-morph'
import type { CheckResult, Violation } from '../../types.js'
import { getProject } from '../../shared/ts-project.js'
import { MONOREPO_ROOT } from '../../shared/utils.js'

const CHECK_NAME = 'cross/dead-exports'

// ============================================================================
// Scan Targets — 7 packages
// ============================================================================

const SCAN_TARGETS = [
  'packages/guarded-wdk/tsconfig.json',
  'packages/daemon/tsconfig.json',
  'packages/relay/tsconfig.json',
  'packages/manifest/tsconfig.json',
  'packages/app/tsconfig.json',
  'packages/canonical/tsconfig.json',
  'packages/protocol/tsconfig.json',
]

const SRC_PREFIXES = SCAN_TARGETS.map(t =>
  path.join(MONOREPO_ROOT, path.dirname(t), 'src') + path.sep
)

// ============================================================================
// Universe Filter — first-party source code only (src/ prefix based)
// ============================================================================

function isFirstPartyCode(filePath: string): boolean {
  if (filePath.includes('node_modules')) return false
  if (filePath.endsWith('.d.ts')) return false
  return SRC_PREFIXES.some(prefix => filePath.startsWith(prefix))
}

// ============================================================================
// Canonical Origin Resolution (ported from HypurrQuant — do not modify)
// ============================================================================

interface CanonicalOrigin {
  file: string
  name: string
}

/**
 * Resolve an imported symbol to its canonical (original definition) location.
 * Primary: target file's getExportedDeclarations() — reliable for barrel chain resolution.
 * Fallback: symbol chain resolution via getAliasedSymbol() — for cases where target file is unavailable.
 */
function resolveCanonicalOrigin(
  namedImport: ImportSpecifier,
  targetSourceFile: SourceFile | undefined,
): CanonicalOrigin | null {
  const exportedName = namedImport.getAliasNode()?.getText() ?? namedImport.getName()

  // Primary: target file's getExportedDeclarations() — follows barrel chains to canonical origin
  if (targetSourceFile) {
    try {
      const decls = targetSourceFile.getExportedDeclarations().get(exportedName)
      if (decls && decls.length > 0) {
        const file = decls[0].getSourceFile().getFilePath()
        if (isFirstPartyCode(file)) {
          return { file, name: exportedName }
        }
      }
    } catch {
      // Primary failed — fall through to fallback
    }
  }

  // Fallback: symbol chain resolution (handles edge cases where targetSourceFile is null)
  try {
    const sym = namedImport.getSymbol()
    const aliased = sym?.getAliasedSymbol?.()
    const target = aliased ?? sym
    if (target) {
      const decls = target.getDeclarations()
      if (decls && decls.length > 0) {
        const decl = decls[0]
        const file = decl.getSourceFile().getFilePath()
        const name = target.getName()
        if (isFirstPartyCode(file)) {
          return { file, name }
        }
      }
    }
  } catch {
    // Fallback also failed
  }

  return null
}

// ============================================================================
// Export Entry
// ============================================================================

interface ExportEntry {
  file: string
  name: string
  line: number
}

// ============================================================================
// Check
// ============================================================================

export async function deadExportsCheck(): Promise<CheckResult> {
  // ====================================================================
  // Phase 1: Collect all first-party source files
  // ====================================================================
  const universe = new Map<string, SourceFile>()
  for (const tsconfig of SCAN_TARGETS) {
    const tsconfigPath = path.join(MONOREPO_ROOT, tsconfig)
    try {
      const project = getProject(tsconfigPath)
      for (const sf of project.getSourceFiles()) {
        const fp = sf.getFilePath()
        if (isFirstPartyCode(fp) && !universe.has(fp)) {
          universe.set(fp, sf)
        }
      }
    } catch { /* tsconfig not found — skip */ }
  }

  // ====================================================================
  // Phase 2: Collect Export Universe (own exports only)
  // ====================================================================
  const exportRegistry = new Map<string, ExportEntry>()
  const aliasKeys = new Map<string, Set<string>>()

  for (const [filePath, sf] of universe) {
    let exportedDecls: ReadonlyMap<string, Node[]>
    try {
      exportedDecls = sf.getExportedDeclarations()
    } catch {
      continue
    }

    for (const [exportName, decls] of exportedDecls) {
      if (!decls || decls.length === 0) continue

      const canonicalDecl = decls[0]
      const canonicalFile = canonicalDecl.getSourceFile().getFilePath()
      if (!universe.has(canonicalFile)) continue

      const canonicalKey = `${canonicalFile}::${exportName}`

      if (canonicalFile === filePath) {
        // Own export: register in exportRegistry
        if (!exportRegistry.has(canonicalKey)) {
          exportRegistry.set(canonicalKey, {
            file: canonicalFile,
            name: exportName,
            line: canonicalDecl.getStartLineNumber(),
          })
        }
      } else {
        // Re-export from barrel: register alias mapping
        const canonicalStart = canonicalDecl.getStart()
        const origSf = universe.get(canonicalFile)
        if (origSf) {
          try {
            const origExports = origSf.getExportedDeclarations()
            for (const [origName, origDecls] of origExports) {
              if (!origDecls?.[0]) continue
              const origStart = origDecls[0].getStart()
              const origFile = origDecls[0].getSourceFile().getFilePath()
              if (origFile === canonicalFile && origStart === canonicalStart && origName !== exportName) {
                const origKey = `${canonicalFile}::${origName}`
                const aliases = aliasKeys.get(origKey) ?? new Set()
                aliases.add(canonicalKey)
                aliasKeys.set(origKey, aliases)
              }
            }
          } catch { /* skip */ }
        }
      }
    }
  }

  // ====================================================================
  // Phase 3: Collect Import Consumers
  // ====================================================================
  const consumedSet = new Set<string>()

  for (const [, sf] of universe) {
    for (const importDecl of sf.getImportDeclarations()) {
      const targetSf = importDecl.getModuleSpecifierSourceFile()

      // Named imports: import { X } from './y'
      for (const namedImport of importDecl.getNamedImports()) {
        const origin = resolveCanonicalOrigin(namedImport, targetSf)
        if (origin) {
          consumedSet.add(`${origin.file}::${origin.name}`)
        }
      }

      // Default import: import X from './y'
      const defaultImport = importDecl.getDefaultImport()
      if (defaultImport && targetSf) {
        try {
          const decls = targetSf.getExportedDeclarations().get('default')
          if (decls && decls.length > 0) {
            const canonicalFile = decls[0].getSourceFile().getFilePath()
            if (isFirstPartyCode(canonicalFile)) {
              consumedSet.add(`${canonicalFile}::default`)
            }
          }
        } catch { /* skip */ }
      }

      // Namespace import: import * as NS from './y'
      // Conservative: mark ALL exports of target as consumed
      const nsImport = importDecl.getNamespaceImport()
      if (nsImport && targetSf) {
        try {
          const allExports = targetSf.getExportedDeclarations()
          for (const [eName, eDecls] of allExports) {
            if (eDecls && eDecls.length > 0) {
              const canonicalFile = eDecls[0].getSourceFile().getFilePath()
              if (isFirstPartyCode(canonicalFile)) {
                consumedSet.add(`${canonicalFile}::${eName}`)
              }
            }
          }
        } catch { /* skip */ }
      }
    }
  }

  // ====================================================================
  // Phase 4: Compute Dead Exports
  // ====================================================================
  const violations: Violation[] = []

  for (const [key, entry] of exportRegistry) {
    if (consumedSet.has(key)) continue
    const aliases = aliasKeys.get(key)
    if (aliases && [...aliases].some(a => consumedSet.has(a))) continue

    violations.push({
      file: path.relative(MONOREPO_ROOT, entry.file),
      line: entry.line,
      message: `Export '${entry.name}' is never imported (remove 'export' keyword, or delete if unused locally)`,
    })
  }

  return {
    name: CHECK_NAME,
    passed: violations.length === 0,
    violations,
  }
}
