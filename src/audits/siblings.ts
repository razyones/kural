/**
 * The comparator. Measures pairwise cosine similarity between sibling nodes
 * under the same parent, filtering out structurally coupled pairs. It is
 * the only module that produces sibling similarity measurements — no other
 * module walks the tree collecting pairwise scores.
 */

import type { CodeNode } from "../sost/tree.ts";
import type { SiblingPair } from "./types.ts";
import { cosineSimilarity } from "../utils/vectors.ts";
import { getChildrenWithKeys } from "./children.ts";
import { isLeaf } from "../sost/tree.ts";

const NONE = 0;
const NEXT = 1;
const HALF = 2;

/**
 * Detects sibling pairs that are structurally coupled — one declares a type
 * and the other consumes or produces it.
 * @param first - First sibling node
 * @param second - Second sibling node
 * @returns True if the pair has a parameter or return type relationship
 * @kuralPure
 */
function isTypeProducerPair(first: CodeNode, second: CodeNode): boolean {
  const [ty, fn] =
    first.kind === "type" && second.kind === "function"
      ? [first, second]
      : second.kind === "type" && first.kind === "function"
        ? [second, first]
        : [null, null];
  if (ty === null || fn === null) {
    return false;
  }
  return fn.returnsType.includes(ty.name) || fn.paramTypes.includes(ty.name);
}

/**
 * Collects all non-excluded sibling pair similarities across the tree.
 * @param nodes - Full code node map
 * @returns Array of sibling pairs with their cosine similarities
 * @kuralPure
 */
function collectSiblingPairs(nodes: Map<string, CodeNode>): SiblingPair[] {
  const pairs: SiblingPair[] = [];
  for (const [parentKey, parentNode] of nodes) {
    if (isLeaf(parentNode) || parentNode.util) {
      continue;
    }
    const cwk = getChildrenWithKeys(parentNode, nodes).filter(({ node: c }) => !c.util);
    const valid = cwk.filter(({ node: c }) => c.leaf.length > NONE);
    if (valid.length < HALF) {
      continue;
    }
    const level = parentNode.kind === "directory" ? "file" : "leaf";
    for (let i = NONE; i < valid.length; i++) {
      for (let j = i + NEXT; j < valid.length; j++) {
        const a = valid[i].node;
        const b = valid[j].node;
        if (a.companion !== null && a.companion === b.companion) {
          continue;
        }
        if (a.patterns !== null && b.patterns !== null) {
          continue;
        }
        if (a.helper || b.helper) {
          continue;
        }
        if (isTypeProducerPair(a, b)) {
          continue;
        }
        pairs.push({
          parentKey,
          aNode: a,
          bNode: b,
          similarity: cosineSimilarity(a.leaf, b.leaf),
          level,
        });
      }
    }
  }
  return pairs;
}

export { collectSiblingPairs, isTypeProducerPair };
