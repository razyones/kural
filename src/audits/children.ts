/**
 * The resolver. Turns a parent node's child keys into concrete node-key
 * pairs by looking them up in the full tree. It is the only module that
 * bridges parent references to child instances — no other module resolves
 * key arrays into live node pairs.
 */

import type { CodeNode } from "../sost/tree.ts";

/** A child node paired with its map key. */
type ChildWithKey = { key: string; node: CodeNode };

/**
 * Resolves child keys to node-key pairs.
 * @param node - The parent node
 * @param nodes - Full code node map
 * @returns Array of key-node pairs
 */
function getChildrenWithKeys(node: CodeNode, nodes: Map<string, CodeNode>): ChildWithKey[] {
  return node.childKeys
    .map((key) => ({ key, node: nodes.get(key) }))
    .filter((item): item is ChildWithKey => item.node !== undefined);
}

export { getChildrenWithKeys };
export type { ChildWithKey };
