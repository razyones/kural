/**
 * Ranks leaves inside capability subtrees the agent can consult
 * before writing new code, so existing helpers stay visible. It is the
 * only brief module that scopes retrieval to the capability axis — no
 * other module surfaces the reuse set around a query.
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
import type { UtilityFacet } from "./types.ts";
import { cosineSimilarity } from "../../utils/vectors.ts";
import { isLeaf } from "../tree/tree.ts";

/**
 * Ranks capability-axis leaves — functions and types marked as util —
 * by cosine similarity to the query, capped to the requested size.
 * @param q - Query embedding vector
 * @param nodes - The full node map
 * @param cap - Maximum number of reusable facets to return
 * @returns Top-ranked reusable facets sorted by descending similarity
 * @kuralPure
 */
function rankReuse(q: number[], nodes: NodeMap, cap: number): UtilityFacet[] {
  const scored: { node: CodeNode; sim: number }[] = [];
  for (const [, node] of nodes) {
    if (!isLeaf(node) || !node.util || node.identity.length === NONE) {
      continue;
    }
    scored.push({ node, sim: cosineSimilarity(q, node.identity) });
  }
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(NONE, cap).map(({ node, sim }) => toReuseFacet(node, sim));
}

/**
 * Projects a capability-axis leaf into the brief's reuse facet shape.
 * @param node - The capability-axis leaf being projected
 * @param similarity - The computed cosine similarity
 * @returns Reusable facet ready for the brief output
 * @kuralPure
 */
function toReuseFacet(node: CodeNode, similarity: number): UtilityFacet {
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
    similarity: roundSim(similarity),
  };
}

export { rankReuse };
