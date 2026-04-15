/**
 * Safely extracts function-specific properties from discriminated union
 * node kinds so audit detectors can handle polymorphic operations.
 * @kuralHelper
 */

import type { CodeNode, NodeMap } from "../tree/tree.ts";

const EMPTY: string[] = [];

/**
 * Safely extracts the calls array from a node.
 * Only FunctionNodes have calls — returns empty array for other kinds.
 * @param node - The code node
 * @returns Array of function names called by this node
 * @kuralPure
 */
function getCalls(node: CodeNode): string[] {
  return node.kind === "function" ? node.calls : EMPTY;
}

/**
 * Checks if two nodes have a caller-callee relationship.
 * Handles function-to-function and function-to-pattern pairs.
 * For pattern nodes, checks whether the function calls any of
 * the pattern's children by name.
 * @param a - First node
 * @param b - Second node
 * @param nodes - Full node map for resolving pattern children
 * @returns True if either node calls the other (or its children) by name
 * @kuralPure
 */
function isCallerCallee(a: CodeNode, b: CodeNode, nodes?: NodeMap): boolean {
  if (getCalls(a).includes(b.name) || getCalls(b).includes(a.name)) {
    return true;
  }
  if (nodes === undefined) {
    return false;
  }
  return callsPatternChild(a, b, nodes) || callsPatternChild(b, a, nodes);
}

/**
 * True when the caller calls any child of the pattern node by name.
 * @param caller - The potential caller node
 * @param pattern - The potential pattern node
 * @param nodes - Full node map for resolving children
 * @returns True if caller calls any of pattern's children
 * @kuralPure
 * @kuralHelper
 */
function callsPatternChild(caller: CodeNode, pattern: CodeNode, nodes: NodeMap): boolean {
  if (pattern.kind !== "pattern") {
    return false;
  }
  const calls = getCalls(caller);
  if (calls.length === EMPTY.length) {
    return false;
  }
  return pattern.childKeys.some((childKey) => {
    const child = nodes.get(childKey);
    return child !== undefined && calls.includes(child.name);
  });
}

export { getCalls, isCallerCallee };
