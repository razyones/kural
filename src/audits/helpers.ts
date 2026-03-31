/**
 * Shared helpers for audit definitions. Provides safe accessors for
 * discriminated union fields that only exist on certain node kinds.
 */

import type { CodeNode } from "../sost/tree.ts";

const EMPTY: string[] = [];

/**
 * Safely extracts the calls array from a node.
 * Only FunctionNodes have calls — returns empty array for other kinds.
 * @param node - The code node
 * @returns Array of function names called by this node
 */
function getCalls(node: CodeNode): string[] {
  return node.kind === "function" ? node.calls : EMPTY;
}

/**
 * Checks if two nodes have a caller-callee relationship.
 * @param a - First node
 * @param b - Second node
 * @returns True if either node calls the other by name
 */
function isCallerCallee(a: CodeNode, b: CodeNode): boolean {
  return getCalls(a).includes(b.name) || getCalls(b).includes(a.name);
}

export { getCalls, isCallerCallee };
