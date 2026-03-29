/**
 * The surveyor. Collects and aggregates scores across subtrees using
 * iterative post-order traversal. It is the only module that walks the
 * tree downward to summarize health — no other module performs subtree
 * aggregation.
 */

import { NO_SIBLINGS } from "./metrics.ts";
import type { NodeMap } from "./tree.ts";
import { avg } from "../utils/vectors.ts";
import { isLeaf } from "./tree.ts";

const NONE = 0;
const NEXT = 1;
const SELF_INDEX = 1;

/** Aggregated subtree scores for a single node. */
type SubtreeResult = {
  minFit: number;
  minUniq: number;
  fitValues: number[];
  uniqValues: number[];
};

const EMPTY_RESULT: SubtreeResult = {
  minFit: Infinity,
  minUniq: Infinity,
  fitValues: [],
  uniqValues: [],
};

/**
 * Builds a post-order traversal sequence of non-leaf, non-util node keys
 * starting from the given root key.
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
 * Aggregates fit/uniqueness values for each node key in traversal order,
 * merging child subtree results bottom-up.
 */
function aggregateResults(
  order: string[],
  nodes: NodeMap,
  fitMap: Map<string, number | null>,
  uniqMap: Map<string, number>,
): Map<string, SubtreeResult> {
  const results = new Map<string, SubtreeResult>();

  for (const nodeKey of order) {
    const node = nodes.get(nodeKey);
    if (node === undefined) {
      continue;
    }

    const localFit = fitMap.get(nodeKey) ?? null;
    const localUniq = uniqMap.get(nodeKey) ?? NO_SIBLINGS;

    const fitValues: number[] = localFit === null ? [] : [localFit];
    const uniqValues: number[] = localUniq === NO_SIBLINGS ? [] : [localUniq];
    let minFit = localFit ?? Infinity;
    let minUniq = localUniq === NO_SIBLINGS ? Infinity : localUniq;

    for (const childKey of node.childKeys) {
      const child = nodes.get(childKey);
      if (child === undefined || isLeaf(child) || child.util) {
        continue;
      }
      const sub = results.get(childKey);
      if (sub === undefined) {
        continue;
      }
      for (const v of sub.fitValues) {
        fitValues.push(v);
      }
      for (const v of sub.uniqValues) {
        uniqValues.push(v);
      }
      if (sub.minFit < minFit) {
        minFit = sub.minFit;
      }
      if (sub.minUniq < minUniq) {
        minUniq = sub.minUniq;
      }
    }

    results.set(nodeKey, { minFit, minUniq, fitValues, uniqValues });
  }

  return results;
}

/**
 * Collects fit and uniqueness values across a node's subtree using an
 * iterative post-order traversal (avoids stack overflow on deep trees).
 * Leaf nodes contribute nothing. NO_SIBLINGS sentinels are excluded from
 * uniqueness aggregation. Util subtrees are skipped.
 *
 * @param key - Node key to start from
 * @param nodes - The complete node map
 * @param fitMap - Pre-computed label-fit values (null values excluded)
 * @param uniqMap - Pre-computed label-uniqueness values
 * @returns Aggregated min scores and value arrays for the subtree
 */
function collectSubtree(
  key: string,
  nodes: NodeMap,
  fitMap: Map<string, number | null>,
  uniqMap: Map<string, number>,
): SubtreeResult {
  const root = nodes.get(key);
  if (root === undefined || isLeaf(root)) {
    return EMPTY_RESULT;
  }

  const order = postOrder(key, nodes);
  const results = aggregateResults(order, nodes, fitMap, uniqMap);

  return results.get(key) ?? EMPTY_RESULT;
}

/**
 * Extracts descendant-only scores from a subtree result (excludes self).
 * @param sub - Full subtree result including self
 * @param localFit - This node's own label-fit (null for util containers)
 * @param localUniq - This node's own label-uniqueness
 * @returns Descendant fit/uniqueness arrays and min values
 */
function descendantScores(
  sub: SubtreeResult,
  localFit: number | null,
  localUniq: number,
): {
  subtreeFit: number;
  subtreeUniqueness: number;
  subtreeMinFit: number;
  subtreeMinUniqueness: number;
} {
  const dFit = localFit === null ? sub.fitValues : sub.fitValues.slice(SELF_INDEX);
  const dUniq = localUniq === NO_SIBLINGS ? sub.uniqValues : sub.uniqValues.slice(SELF_INDEX);

  const subtreeFit = dFit.length > NONE ? avg(dFit) : (localFit ?? NONE);
  const subtreeUniqueness = dUniq.length > NONE ? avg(dUniq) : NO_SIBLINGS;
  const subtreeMinFit = dFit.length > NONE ? loopMin(dFit) : (localFit ?? NONE);
  const subtreeMinUniqueness = dUniq.length > NONE ? loopMin(dUniq) : NO_SIBLINGS;

  return { subtreeFit, subtreeUniqueness, subtreeMinFit, subtreeMinUniqueness };
}

/**
 * Finds the minimum value in an array using a loop (avoids Math.min spread
 * which can blow the call stack on large arrays).
 */
function loopMin(values: number[]): number {
  let min = Infinity;
  for (const v of values) {
    if (v < min) {
      min = v;
    }
  }
  return min;
}

export { collectSubtree, descendantScores };
export type { SubtreeResult };
