/**
 * Walks the parent chain of the placement target and collects
 * lineage descriptions so the agent sees the boundary constraints of
 * each enclosing directory. It is the only module that walks the
 * placement lineage — no other module assembles ancestor facets.
 */

import type { AncestorFacet } from "./types.ts";
import type { NodeMap } from "../tree/tree.ts";
import { fullDescription } from "./helpers.ts";

/**
 * Walks upward from the placement target toward the root, collecting
 * a capped ancestor chain. The placement target itself is excluded —
 * it appears in the placement facet — and the tree root is skipped
 * since its "ancestor" framing is meaningless at the repo boundary.
 * @param placementKey - Key of the placement target
 * @param nodes - The full node map
 * @param cap - Maximum number of ancestors to return
 * @returns Ordered ancestor facets from nearest to furthest parent
 * @kuralPure
 */
function walkAncestors(placementKey: string, nodes: NodeMap, cap: number): AncestorFacet[] {
  const result: AncestorFacet[] = [];
  const start = nodes.get(placementKey);
  if (start === undefined) {
    return result;
  }
  let currentKey = start.parentKey;
  while (currentKey !== null && result.length < cap) {
    const node = nodes.get(currentKey);
    if (node === undefined) {
      break;
    }
    if (node.parentKey !== null) {
      result.push({
        name: node.name,
        path: currentKey,
        description: fullDescription(node.description),
      });
    }
    currentKey = node.parentKey;
  }
  return result;
}

export { walkAncestors };
