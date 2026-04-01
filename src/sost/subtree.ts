/**
 * The surveyor. Collects and aggregates childrenFit and childrenUniqueness
 * across subtrees using iterative post-order traversal. It is the only
 * module that walks the tree downward to summarize health.
 */

import { NO_SIBLINGS } from "./metrics.ts";
import type { NodeMap } from "./tree.ts";
import { avg } from "../utils/vectors.ts";
import { isLeaf } from "./tree.ts";

const NONE = 0;
const NEXT = 1;

/** Aggregated subtree scores for a single node. */
type SubtreeResult = {
  childrenFitValues: number[];
  childrenUniqValues: number[];
};

/**
 * Collects childrenFit and childrenUniqueness values across a node's
 * subtree using iterative post-order traversal. Skips leaves and util
 * subtrees. Excludes N/A sentinels from uniqueness.
 * @param key - The root node key to start collection from
 * @param nodes - The flat node map for traversal
 * @param childrenFitMap - Pre-computed children fit values per node
 * @param childrenUniqMap - Pre-computed children uniqueness values per node
 * @returns Aggregated childrenFit and childrenUniqueness arrays across the subtree
 * @kuralPure
 */
function collectSubtree(
  key: string,
  nodes: NodeMap,
  childrenFitMap: Map<string, number | null>,
  childrenUniqMap: Map<string, number>,
): SubtreeResult {
  const root = nodes.get(key);
  if (root === undefined || isLeaf(root)) {
    return { childrenFitValues: [], childrenUniqValues: [] };
  }

  const results = new Map<string, SubtreeResult>();
  const order = postOrder(key, nodes);

  for (const nodeKey of order) {
    const node = nodes.get(nodeKey);
    if (node === undefined) {
      continue;
    }

    const localFit = childrenFitMap.get(nodeKey) ?? null;
    const localUniq = childrenUniqMap.get(nodeKey) ?? NO_SIBLINGS;
    const isPattern = node.kind === "pattern";

    const fitValues: number[] = localFit === null || isPattern ? [] : [localFit];
    const uniqValues: number[] = localUniq === NO_SIBLINGS || isPattern ? [] : [localUniq];

    for (const childKey of node.childKeys) {
      const child = nodes.get(childKey);
      if (child === undefined || isLeaf(child) || child.util) {
        continue;
      }
      const sub = results.get(childKey);
      if (sub === undefined) {
        continue;
      }
      for (const v of sub.childrenFitValues) {
        fitValues.push(v);
      }
      for (const v of sub.childrenUniqValues) {
        uniqValues.push(v);
      }
    }

    results.set(nodeKey, { childrenFitValues: fitValues, childrenUniqValues: uniqValues });
  }

  return results.get(key) ?? { childrenFitValues: [], childrenUniqValues: [] };
}

/**
 * Builds a post-order traversal sequence, skipping leaves and util nodes.
 * @param key - The root node key to start traversal from
 * @param nodes - The flat node map for traversal
 * @returns Array of node keys in post-order
 * @kuralPure
 */
function postOrder(key: string, nodes: NodeMap): string[] {
  const stack: string[] = [key];
  const visited = new Set<string>();
  const order: string[] = [];

  while (stack.length > NONE) {
    const current = stack[stack.length - NEXT];
    const node = nodes.get(current);

    if (node === undefined || isLeaf(node)) {
      stack.pop();
      continue;
    }

    if (visited.has(current)) {
      stack.pop();
      order.push(current);
      continue;
    }

    visited.add(current);

    for (let i = node.childKeys.length - NEXT; i >= NONE; i--) {
      const childKey = node.childKeys[i];
      const child = nodes.get(childKey);
      if (child === undefined || isLeaf(child) || child.util) {
        continue;
      }
      stack.push(childKey);
    }
  }

  return order;
}

/**
 * Extracts descendant-only subtree scores (excludes self).
 * @param sub - The aggregated subtree result containing fit and uniqueness arrays
 * @param localFit - The node's own children fit value, or null
 * @param localUniq - The node's own children uniqueness value
 * @returns Subtree fit and uniqueness averages excluding the node itself
 * @kuralPure
 */
function descendantScores(
  sub: SubtreeResult,
  localFit: number | null,
  localUniq: number,
): { subtreeFit: number | null; subtreeUniqueness: number | null } {
  const SELF_INDEX = 1;

  const dFit = localFit === null ? sub.childrenFitValues : sub.childrenFitValues.slice(SELF_INDEX);

  const dUniq =
    localUniq === NO_SIBLINGS ? sub.childrenUniqValues : sub.childrenUniqValues.slice(SELF_INDEX);

  const subtreeFit = dFit.length > NONE ? avg(dFit) : localFit;
  const subtreeUniqueness = dUniq.length > NONE ? avg(dUniq) : null;

  return { subtreeFit, subtreeUniqueness };
}

export { collectSubtree, descendantScores };
export type { SubtreeResult };
