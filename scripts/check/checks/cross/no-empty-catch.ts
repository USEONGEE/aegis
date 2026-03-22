/**
 * No Empty Catch  [cross]
 *
 * Detects catch blocks with zero statements (comments don't count).
 * Enforces "No Fallback" principle — errors must not be silently swallowed.
 *
 * AST approach: CatchClause → Block.getStatements().length === 0
 * ts-morph's getStatements() returns only actual statements, not comments.
 */

import { SyntaxKind } from 'ts-morph'
import { relative } from 'node:path'
import type { CheckResult, Violation } from '../../types.js'
import { getAstSourceFiles, ALL_PACKAGES } from '../../shared/ast-source-files.js'
import { MONOREPO_ROOT } from '../../shared/utils.js'

const CHECK_NAME = 'cross/no-empty-catch'

export function noEmptyCatch(): CheckResult {
  const violations: Violation[] = []
  const sourceFiles = getAstSourceFiles(ALL_PACKAGES)

  for (const sf of sourceFiles) {
    const rel = relative(MONOREPO_ROOT, sf.getFilePath())

    for (const catchClause of sf.getDescendantsOfKind(SyntaxKind.CatchClause)) {
      const block = catchClause.getBlock()
      if (block.getStatements().length === 0) {
        violations.push({
          file: rel,
          line: catchClause.getStartLineNumber(),
          message: 'empty catch block — must contain at least one statement (comments do not count)',
        })
      }
    }
  }

  return { name: CHECK_NAME, passed: violations.length === 0, violations }
}
