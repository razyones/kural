/**
 * Ranks function and type leaves anywhere in the tree so the
 * agent sees which signatures to match. It is the only module that
 * surfaces symbol facets — no other module answers "which leaves
 * resemble this query?"
 */

import type { CodeNode, NodeMap } from "../tree/tree.ts";
import {
  NONE,
  fullDescription,
  leafEndLine,
  leafStartLine,
  roundSim,
  signatureOf,
} from "./helpers.ts";
import type { SymbolFacet } from "./types.ts";
import { cosineSimilarity } from "../../utils/vectors.ts";
import { isLeaf } from "../tree/tree.ts";

/**
 * Ranks all non-util leaves against the query so util matches stay
 * scoped to the utilities section, and leaves inside the placement
 * target are excluded since they surface as siblings.
 * @param q - Query embedding vector
 * @param nodes - The full node map
 * @param placementKey - Key of the placement target, excluded from results
 * @param cap - Maximum number of symbols to return
 * @returns Top-ranked symbol facets sorted by descending similarity
 * @kuralPure
 */
function rankSymbols(
  q: number[],
  nodes: NodeMap,
  placementKey: string,
  cap: number,
): SymbolFacet[] {
  const scored: { node: CodeNode; sim: number }[] = [];
  for (const [, node] of nodes) {
    if (!symbolCandidate(node, placementKey)) {
      continue;
    }
    scored.push({ node, sim: cosineSimilarity(q, node.identity) });
  }
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(NONE, cap).map(({ node, sim }) => toSymbolFacet(node, sim));
}

/**
 * Determines whether a node is a ranking candidate for the symbol
 * section — non-util leaves with an identity vector, outside the
 * placement target's direct children.
 * @param node - The node under consideration
 * @param placementKey - Key of the placement target
 * @returns True when the node qualifies for symbol ranking
 * @kuralPure
 */
function symbolCandidate(node: CodeNode, placementKey: string): boolean {
  if (!isLeaf(node) || node.util || node.identity.length === NONE) {
    return false;
  }
  return node.parentKey !== placementKey;
}

/**
 * Projects a symbol node into its facet shape.
 * @param node - The leaf node being projected
 * @param similarity - The computed cosine similarity
 * @returns Symbol facet ready for the brief output
 * @kuralPure
 */
function toSymbolFacet(node: CodeNode, similarity: number): SymbolFacet {
  return {
    name: node.name,
    kind: node.kind,
    file: node.parentKey ?? "",
    startLine: leafStartLine(node),
    endLine: leafEndLine(node),
    description: fullDescription(node.description),
    signature: signatureOf(node),
    helper: node.helper,
    pure: node.kind === "function" ? node.pure : false,
    exported: node.exported,
    patterns: node.patterns ?? [],
    companion: node.companion,
    similarity: roundSim(similarity),
  };
}

export { rankSymbols };
