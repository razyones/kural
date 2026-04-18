/**
 * Resolves AST node positions to source-file line numbers. It is the
 * only module that owns position-to-line conversion for the parser —
 * no other module bridges TypeScript AST offsets to human line numbers.
 * @kuralHelper
 */

import type ts from "typescript";

const LINE_OFFSET = 1;

/**
 * Returns the 1-based line number where a declaration starts, after
 * skipping any leading trivia like JSDoc comments.
 * @param node - Declaration AST node whose start line is needed
 * @param sourceFile - Source file used to resolve positions
 * @returns The 1-based line number of the declaration
 * @kuralPure
 * @kuralPatterns declarationLine
 */
function declarationStartLine(node: ts.Node, sourceFile: ts.SourceFile): number {
  const pos = node.getStart(sourceFile);
  const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
  return line + LINE_OFFSET;
}

/**
 * Returns the 1-based line number where a declaration ends — the line
 * containing its closing brace or terminating token.
 * @param node - Declaration AST node whose end line is needed
 * @param sourceFile - Source file used to resolve positions
 * @returns The 1-based line number of the declaration's last token
 * @kuralPure
 * @kuralPatterns declarationLine
 */
function declarationEndLine(node: ts.Node, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return line + LINE_OFFSET;
}

export { declarationEndLine, declarationStartLine };
