/**
 * The assembler. Runs placement, fans out facet rankers, and returns
 * the bounded brief an agent consumes before implementing. It is the
 * only module that composes every brief section into a single
 * result — no other module orchestrates siblings, utilities, symbols,
 * ancestors, patterns, and companions together.
 */

import type { Brief, BriefCaps, PlacementFacet, RelatedFacet, SymbolFacet } from "./types.ts";
import { DEFAULT_CAPS, NONE, fullDescription, roundSim } from "./helpers.ts";
import { expandCompanionMembers, expandPatternMembers } from "./patterns.ts";
import { rankReuse, rankSiblings, rankSymbols, walkAncestors } from "./rankers.ts";
import type { NodeMap } from "../tree/tree.ts";
import type { PlacementEmbedder } from "../place/helpers.ts";
import type { PlacementResult } from "../place/types.ts";
import { place } from "../place/engine.ts";

/**
 * Resolves the placement target key from the place engine's result.
 * For confident placements, uses the suggestion target. For ask-user
 * outcomes, steps up one directory from the top-ranked path so brief
 * scopes siblings around peer modules instead of the internals of an
 * arbitrary leaf match.
 * @param result - The placement result returned by place()
 * @param nodes - The full node map used to resolve parent pointers
 * @returns The target directory key the brief will scope sections around
 * @kuralPure
 * @kuralHelper
 */
function placementKey(result: PlacementResult, nodes: NodeMap): string {
  if (result.suggestion.action === "add-to-directory") {
    return result.suggestion.target;
  }
  const [first] = result.topPaths;
  if (first === undefined) {
    return "";
  }
  const candidate = nodes.get(first.parentKey);
  if (candidate !== undefined && candidate.parentKey !== null) {
    return candidate.parentKey;
  }
  return first.parentKey;
}

/**
 * Flattens the place engine's nested related concept groups into a
 * single ranked list, capped by the caller's request.
 * @param result - The placement result containing grouped related concepts
 * @param cap - Maximum number of related facets to return
 * @returns Flat related facet list sorted by similarity
 * @kuralPure
 * @kuralHelper
 */
function flattenRelated(result: PlacementResult, cap: number): RelatedFacet[] {
  const flat: RelatedFacet[] = [];
  for (const group of result.relatedConcepts) {
    for (const item of group.items) {
      flat.push({
        name: item.name,
        kind: item.kind,
        file: group.path,
        description: fullDescription(item.description),
        similarity: roundSim(item.similarity),
      });
    }
  }
  flat.sort((a, b) => b.similarity - a.similarity);
  return flat.slice(NONE, cap);
}

/**
 * Shapes the placement facet from the engine's result. For ask-user
 * outcomes, the name reflects the parent directory the brief landed on
 * rather than the leaf the chain happened to favor.
 * @param result - The placement result returned by place()
 * @param target - Resolved placement key
 * @param nodes - The full node map used to resolve the target's name
 * @returns Placement facet ready for the brief output
 * @kuralPure
 * @kuralHelper
 */
function toPlacementFacet(result: PlacementResult, target: string, nodes: NodeMap): PlacementFacet {
  const s = result.suggestion;
  if (s.action === "add-to-directory") {
    return {
      action: "add-to-directory",
      target,
      name: s.name,
      path: target,
      confidence: result.confidence,
      method: s.method,
      reason: null,
      bridgeType: s.bridgeType ?? null,
      bridgeLayer: s.bridgeLayer ?? null,
    };
  }
  const targetNode = nodes.get(target);
  const name = targetNode?.name ?? result.topPaths[NONE]?.parentName ?? "";
  return {
    action: "ask-user",
    target,
    name,
    path: target,
    confidence: result.confidence,
    method: s.method,
    reason: s.reason,
    bridgeType: s.bridgeType ?? null,
    bridgeLayer: null,
  };
}

/**
 * Resolves caps by overlaying optional user overrides on the defaults.
 * @param overrides - Partial caps from config or CLI flags
 * @returns Fully populated caps ready for the rankers
 * @kuralPure
 * @kuralHelper
 */
function resolveCaps(overrides: Partial<BriefCaps> | undefined): BriefCaps {
  if (overrides === undefined) {
    return DEFAULT_CAPS;
  }
  return { ...DEFAULT_CAPS, ...overrides };
}

/**
 * Runs the full brief pipeline: place, embed, fan out rankers, expand
 * patterns and companions, and assemble the bounded output.
 * @param queryText - Description of the code the agent plans to write
 * @param nodes - The scored node map from the snapshot
 * @param embedder - Function that embeds text strings into vectors
 * @param capsOverride - Optional per-section overrides for output caps
 * @returns Fully assembled brief suitable for an agent's prefill
 * @kuralCauses calls the placement engine and the embedding API
 */
async function brief(
  queryText: string,
  nodes: NodeMap,
  embedder: PlacementEmbedder,
  capsOverride?: Partial<BriefCaps>,
): Promise<Brief> {
  const caps = resolveCaps(capsOverride);
  const result = await place(queryText, nodes, embedder);
  const [queryVec] = await embedder([queryText]);
  const target = placementKey(result, nodes);
  const symbols: SymbolFacet[] = rankSymbols(queryVec, nodes, target, caps.symbols);
  return {
    query: queryText,
    placement: toPlacementFacet(result, target, nodes),
    ancestors: walkAncestors(target, nodes, caps.ancestors),
    siblings: rankSiblings(queryVec, target, nodes, caps.siblings),
    utilities: rankReuse(queryVec, nodes, caps.utilities),
    symbols,
    related: flattenRelated(result, caps.related),
    patternMembers: expandPatternMembers(symbols, nodes, caps.patternMembers),
    companionMembers: expandCompanionMembers(symbols, nodes, caps.companionMembers),
  };
}

export { brief };
