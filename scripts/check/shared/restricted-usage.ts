import { Node, Project, SyntaxKind, type SourceFile } from 'ts-morph'
import { relative } from 'node:path'
import type { CheckResult, Violation } from '../types.js'
import { MONOREPO_ROOT, getSourceFiles, pkgDir } from './utils.js'

// --- Rule types ---

interface ImportRule { kind: 'import'; symbolName: string; fromModules: string[]; allow?: string[]; deny?: string[] }
interface MethodCallRule { kind: 'method-call'; methodName: string; allow?: string[]; deny?: string[] }
interface FunctionCallRule { kind: 'function-call'; functionName: string; allow?: string[]; deny?: string[] }
interface ExportRule { kind: 'export'; symbolName: string; allow?: string[]; deny?: string[] }

export type RestrictedRule = ImportRule | MethodCallRule | FunctionCallRule | ExportRule

export interface RestrictedUsageConfig {
  name: string
  packages: string[]
  rules: RestrictedRule[]
}

/**
 * Determine whether a file should be checked for violations.
 * - allow mode (whitelist): check if file is NOT in allow list
 * - deny mode (blacklist): check if file IS in deny list
 * - neither: check all files
 */
function shouldCheck (relPath: string, rule: { allow?: string[]; deny?: string[] }): boolean {
  if (rule.allow !== undefined) return !rule.allow.includes(relPath)
  if (rule.deny !== undefined) return rule.deny.includes(relPath)
  return true
}

function scanFile (sf: SourceFile, rules: RestrictedRule[], violations: Violation[]): void {
  const rel = relative(MONOREPO_ROOT, sf.getFilePath())

  for (const rule of rules) {
    if (!shouldCheck(rel, rule)) continue

    switch (rule.kind) {
      case 'import':
        for (const decl of sf.getImportDeclarations()) {
          if (decl.isTypeOnly()) continue
          const spec = decl.getModuleSpecifierValue()
          if (!rule.fromModules.some(m => spec.includes(m))) continue
          for (const ni of decl.getNamedImports()) {
            if (ni.isTypeOnly() || ni.getName() !== rule.symbolName) continue
            violations.push({ file: rel, line: decl.getStartLineNumber(), message: `${rule.symbolName} import is restricted` })
          }
        }
        break

      case 'method-call':
        for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
          const expr = call.getExpression()
          if (!Node.isPropertyAccessExpression(expr)) continue
          if (expr.getName() !== rule.methodName) continue
          violations.push({ file: rel, line: call.getStartLineNumber(), message: `.${rule.methodName}() call is restricted` })
        }
        break

      case 'function-call':
        for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
          const expr = call.getExpression()
          if (!Node.isIdentifier(expr) || expr.getText() !== rule.functionName) continue
          violations.push({ file: rel, line: call.getStartLineNumber(), message: `${rule.functionName}() call is restricted` })
        }
        break

      case 'export':
        for (const decl of sf.getExportDeclarations()) {
          if (decl.isTypeOnly()) continue
          for (const ne of decl.getNamedExports()) {
            if (ne.isTypeOnly() || ne.getName() !== rule.symbolName) continue
            violations.push({ file: rel, line: decl.getStartLineNumber(), message: `${rule.symbolName} must not be exported from this file` })
          }
        }
        break
    }
  }
}

/**
 * Factory: creates a CheckFn from a declarative config.
 *
 * Pattern: "this symbol is restricted to these files"
 * - allow (whitelist): only these files may use the symbol
 * - deny (blacklist): these files must NOT use the symbol
 *
 * AST-based: uses ts-morph to parse imports, calls, and exports.
 * Type-only imports/exports are ignored (runtime boundary only).
 */
export function createRestrictedUsageCheck (config: RestrictedUsageConfig): () => CheckResult {
  return () => {
    const violations: Violation[] = []
    const project = new Project({ compilerOptions: { noResolve: true } })

    for (const pkg of config.packages) {
      for (const fp of getSourceFiles(pkgDir(pkg))) {
        project.addSourceFileAtPath(fp)
      }
    }

    for (const sf of project.getSourceFiles()) {
      scanFile(sf, config.rules, violations)
    }

    return { name: config.name, passed: violations.length === 0, violations }
  }
}
