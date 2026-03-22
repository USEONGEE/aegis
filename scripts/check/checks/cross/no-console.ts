/**
 * No Console  [cross]
 *
 * Detects all console.* calls in source code.
 * Enforces structured logging — console.log/error/warn/info/debug/trace all forbidden.
 *
 * AST approach: CallExpression → PropertyAccessExpression where object is 'console'.
 */

import { SyntaxKind, Node } from 'ts-morph'
import { relative } from 'node:path'
import type { CheckResult, Violation } from '../../types.js'
import { getAstSourceFiles, ALL_PACKAGES } from '../../shared/ast-source-files.js'
import { MONOREPO_ROOT } from '../../shared/utils.js'

const CHECK_NAME = 'cross/no-console'

export function noConsole(): CheckResult {
  const violations: Violation[] = []
  const sourceFiles = getAstSourceFiles(ALL_PACKAGES)

  for (const sf of sourceFiles) {
    const rel = relative(MONOREPO_ROOT, sf.getFilePath())

    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression()
      if (!Node.isPropertyAccessExpression(expr)) continue

      const obj = expr.getExpression()
      if (obj.getText() !== 'console') continue

      const methodName = expr.getName()
      violations.push({
        file: rel,
        line: call.getStartLineNumber(),
        message: `console.${methodName}() — use structured logger`,
      })
    }
  }

  return { name: CHECK_NAME, passed: violations.length === 0, violations }
}
