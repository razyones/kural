/**
 * Resolves a parent's child keys into key-node pairs so
 * audit detectors can iterate children while retaining their map keys
 * for finding reports. It is the only module that provides keyed child
 * access for diagnostics — no other audit helper preserves the key
 * alongside the node.
 */

import type { CodeNode } from "../tree/tree.ts";

/** A child node paired with its map key. */
type ChildWithKey = { key: string; node: CodeNode };

/**
 * Resolves child keys to node-key pairs.
 * @param node - The parent node
 * @param nodes - Full code node map
 * @returns Array of key-node pairs
 * @kuralPure
 */
function getChildrenWithKeys(node: CodeNode, nodes: Map<string, CodeNode>): ChildWithKey[] {
  return node.childKeys
    .map((key) => ({ key, node: nodes.get(key) }))
    .filter((item): item is ChildWithKey => item.node !== undefined);
}

export { getChildrenWithKeys };
export type { ChildWithKey };
