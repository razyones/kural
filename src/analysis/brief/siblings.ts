/**
 * Ranks children of the placement directory so the agent sees
 * which existing peers to imitate. It is the only module that surfaces
 * sibling facets — no other module answers "what lives next door?"
 */

import type { CodeNode, NodeMap } from "../tree/tree.ts";
import { NONE, fullDescription, roundSim } from "./helpers.ts";
import type { SiblingFacet } from "./types.ts";
import { cosineSimilarity } from "../../utils/vectors.ts";
import { getChildren } from "../tree/tree.ts";
import { vecOf } from "../place/helpers.ts";

/**
 * Scores children of the placement target against the query and caps
 * the list. Excludes pattern-synthetic nodes since those expand via the
 * pattern-members section, not siblings.
 * @param q - Query embedding vector
 * @param placementKey - Key of the placement target directory
 * @param nodes - The full node map
 * @param cap - Maximum number of siblings to return
 * @returns Top-ranked sibling facets sorted by descending similarity
 * @kuralPure
 */
function rankSiblings(
  q: number[],
  placementKey: string,
  nodes: NodeMap,
  cap: number,
): SiblingFacet[] {
  const parent = nodes.get(placementKey);
  if (parent === undefined) {
    return [];
  }
  const children = getChildren(parent, nodes).filter((c) => c.kind !== "pattern");
  const scored = children.map((c) => ({ node: c, sim: scoreChild(q, c) }));
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(NONE, cap).map(({ node, sim }) => toSiblingFacet(node, sim));
}

/**
 * Computes cosine similarity against a node's blended vector.
 * @param q - Query embedding vector
 * @param node - The sibling node being scored
 * @returns Similarity score, or zero when the node has no vectors
 * @kuralPure
 */
function scoreChild(q: number[], node: CodeNode): number {
  const vec = vecOf(node);
  if (vec.length === NONE) {
    return NONE;
  }
  return cosineSimilarity(q, vec);
}

/**
 * Projects a sibling node into its facet shape.
 * @param node - The sibling node to project
 * @param similarity - The computed cosine similarity
 * @returns Sibling facet ready for the brief output
 * @kuralPure
 */
function toSiblingFacet(node: CodeNode, similarity: number): SiblingFacet {
  return {
    name: node.name,
    kind: node.kind,
    path: node.key,
    description: fullDescription(node.description),
    similarity: roundSim(similarity),
  };
}

export { rankSiblings };
