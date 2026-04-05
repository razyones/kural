/**
 * The librarian. Finds existing functions and types that a newly placed
 * piece of code would likely depend on. It is the only module that
 * performs flat similarity search across all leaves — no other module
 * computes the "shopping list" of related concepts.
 */

import { DECIMAL_PLACES, NONE, TOP_K_RELATED } from "./helpers.ts";
import type { NodeMap } from "../tree/tree.ts";
import type { RelatedGroup } from "./types.ts";
import { cosineSimilarity } from "../../utils/vectors.ts";
import { isLeaf } from "../tree/tree.ts";

/**
 * Finds the top related leaf nodes outside the placement directory.
 * @param q - Query embedding vector
 * @param nodes - The full node map
 * @param placementKey - Key of the placement target (excluded from results)
 * @returns Related concepts grouped by parent file
 * @kuralPure
 */
function findRelatedConcepts(q: number[], nodes: NodeMap, placementKey: string): RelatedGroup[] {
  const candidates: {
    name: string;
    kind: string;
    file: string;
    sim: number;
  }[] = [];
  for (const [, node] of nodes) {
    if (!isLeaf(node) || node.identity.length === NONE || node.parentKey === placementKey) {
      continue;
    }
    candidates.push({
      name: node.name,
      kind: node.kind,
      file: node.parentKey ?? "",
      sim: cosineSimilarity(q, node.identity),
    });
  }
  candidates.sort((a, b) => b.sim - a.sim);

  const byFile = new Map<string, RelatedGroup>();
  for (const c of candidates.slice(NONE, TOP_K_RELATED)) {
    const fileName = nodes.get(c.file)?.name ?? c.file;
    let group = byFile.get(c.file);
    if (group === undefined) {
      group = { file: fileName, path: c.file, items: [] };
      byFile.set(c.file, group);
    }
    group.items.push({
      name: c.name,
      kind: c.kind,
      similarity: Number(c.sim.toFixed(DECIMAL_PLACES)),
    });
  }
  return [...byFile.values()];
}

export { findRelatedConcepts };
