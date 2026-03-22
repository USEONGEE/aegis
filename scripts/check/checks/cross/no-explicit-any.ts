/**
 * No Explicit Any  [cross]
 *
 * Detects all explicit `any` type usage in daemon, relay, app, manifest.
 * guarded-wdk is excluded (covered by existing no-type-assertion check).
 *
 * AST approach: SyntaxKind.AnyKeyword — catches all forms:
 *   - `as any`, `catch (err: any)`, `: any`, `Record<string, any>`, etc.
 * Parent context determines the violation message.
 */

import { SyntaxKind, Node } from 'ts-morph'
import { relative } from 'node:path'
import type { CheckResult, Violation } from '../../types.js'
import { getAstSourceFiles } from '../../shared/ast-source-files.js'
import { MONOREPO_ROOT } from '../../shared/utils.js'

const CHECK_NAME = 'cross/no-explicit-any'

const TARGET_PACKAGES = [
  'packages/daemon/tsconfig.json',
  'packages/relay/tsconfig.json',
  'packages/app/tsconfig.json',
  'packages/manifest/tsconfig.json',
]

function describeContext(anyNode: Node): string {
  const parent = anyNode.getParent()
  if (!parent) return 'explicit \'any\' usage'

  // as any — AnyKeyword -> AsExpression
  if (Node.isAsExpression(parent)) {
    return '\'as any\' type assertion'
  }

  // Walk up to find the meaningful ancestor (skip TypeNode wrappers)
  let ancestor: Node = parent
  if (Node.isTypeNode(ancestor)) {
    const gp = ancestor.getParent()
    if (gp) ancestor = gp
  }

  // catch (err: any) — VariableDeclaration -> CatchClause
  if (Node.isVariableDeclaration(ancestor)) {
    const vdParent = ancestor.getParent()
    if (vdParent && Node.isCatchClause(vdParent)) {
      return 'catch parameter typed as \'any\' — use \'unknown\''
    }
    return `variable '${ancestor.getName()}' typed as 'any'`
  }

  // fn(x: any) — ParameterDeclaration
  if (Node.isParameterDeclaration(ancestor)) {
    return `parameter '${ancestor.getName() ?? '?'}' typed as 'any'`
  }

  // { key: any } — PropertySignature
  if (Node.isPropertySignature(ancestor)) {
    return `property '${ancestor.getName()}' typed as 'any'`
  }

  // Generic type argument: Record<string, any>, Array<any>, etc.
  if (Node.isTypeNode(parent)) {
    return '\'any\' in type expression'
  }

  return 'explicit \'any\' usage'
}

export function noExplicitAny(): CheckResult {
  const violations: Violation[] = []
  const sourceFiles = getAstSourceFiles(TARGET_PACKAGES)

  for (const sf of sourceFiles) {
    const rel = relative(MONOREPO_ROOT, sf.getFilePath())

    for (const anyKeyword of sf.getDescendantsOfKind(SyntaxKind.AnyKeyword)) {
      violations.push({
        file: rel,
        line: anyKeyword.getStartLineNumber(),
        message: describeContext(anyKeyword),
      })
    }
  }

  return { name: CHECK_NAME, passed: violations.length === 0, violations }
}
