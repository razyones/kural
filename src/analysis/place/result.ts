/**
 * The assembler. Constructs the final placement output from computed signals —
 * formatting percentages, flattening bridge info, and building neighborhoods.
 * It is the only module that shapes the placement result object — no other
 * module formats detection metrics or suggestions for output.
 */

import type {
  AxisResult,
  BridgeResult,
  PlacementResult,
  PlacementSuggestion,
  RankedPath,
  RelatedGroup,
} from "./types.ts";
import { DECIMAL_PLACES, DISPLAY_PATHS, NONE, PERCENT_SCALE } from "./helpers.ts";
import type { NodeMap } from "../tree/tree.ts";

const NEXT = 1;

/**
 * Builds the suggestion for uncertain queries.
 * @param paths - Ranked candidate paths sorted by confidence
 * @param nodes - The full node map for looking up directory descriptions
 * @param topConfidence - Confidence score of the top-ranked path
 * @returns A placement suggestion with action "ask-user" and neighborhood options
 * @kuralPure
 */
function buildUncertainSuggestion(
  paths: RankedPath[],
  nodes: NodeMap,
  topConfidence: number,
): PlacementSuggestion {
  const neighborhoods = paths.slice(NONE, DISPLAY_PATHS).map((p) => {
    const dirNode = nodes.get(p.parentKey);
    return {
      name: p.parentName,
      description: dirNode?.description?.split("\n")[NONE] ?? "",
      confidence: Number((p.confidence * PERCENT_SCALE).toFixed(NEXT)),
    };
  });
  return {
    action: "ask-user",
    reason: `Low confidence (${(topConfidence * PERCENT_SCALE).toFixed(NEXT)}%). Multiple modules are plausible.`,
    method: "safety-gate",
    neighborhoods,
  };
}

/**
 * Formats bridge info for the result, or null if no bridge was detected.
 * @param bridgeInfo - Raw bridge detection result, or null if none detected
 * @returns Formatted bridge object with scaled percentages, or null
 * @kuralPure
 */
function formatBridge(bridgeInfo: BridgeResult | null): PlacementResult["bridge"] {
  if (bridgeInfo === null) {
    return null;
  }
  return {
    type: bridgeInfo.type,
    layer: bridgeInfo.layer,
    confidence: Number((bridgeInfo.confidence * PERCENT_SCALE).toFixed(NEXT)),
    gap: Number((bridgeInfo.gap * PERCENT_SCALE).toFixed(NEXT)),
    confident: bridgeInfo.confident,
    alternatives: bridgeInfo.alternatives,
  };
}

/**
 * Assembles the final PlacementResult from all computed signals.
 * @param queryText - The original query string
 * @param axis - Axis classification with domain and capability fit scores
 * @param calibration - Alien fence threshold and probe count from calibration
 * @param leafMatch - Best matching leaf node name and similarity score
 * @param chainGap - Gap between top two ranked paths as a raw ratio
 * @param alien - Global and level alien detection flags
 * @param topPath - The highest-ranked candidate path
 * @param paths - All ranked candidate paths sorted by confidence
 * @param suggestion - The placement suggestion for the query
 * @param bridgeInfo - Bridge detection result, or null if none detected
 * @param relatedConcepts - Groups of semantically related concepts
 * @returns The fully assembled placement result with formatted metrics
 * @kuralPure
 */
function buildResult(
  queryText: string,
  axis: AxisResult,
  calibration: { alienFence: number; probeCount: number },
  leafMatch: { similarity: number; name: string },
  chainGap: number,
  alien: { globalAlien: boolean; levelAlien: boolean },
  topPath: RankedPath,
  paths: RankedPath[],
  suggestion: PlacementSuggestion,
  bridgeInfo: BridgeResult | null,
  relatedConcepts: RelatedGroup[],
): PlacementResult {
  return {
    query: queryText,
    axis: {
      classification: axis.classification,
      domainFit: Number(axis.domainFit.toFixed(DECIMAL_PLACES)),
      capabilityFit: Number(axis.capabilityFit.toFixed(DECIMAL_PLACES)),
    },
    detection: {
      alienFence: Number(calibration.alienFence.toFixed(DECIMAL_PLACES)),
      probeCount: calibration.probeCount,
      bestLeafMatch: {
        name: leafMatch.name,
        similarity: Number(leafMatch.similarity.toFixed(DECIMAL_PLACES)),
      },
      chainGap: Number((chainGap * PERCENT_SCALE).toFixed(NEXT)),
      globalAlien: alien.globalAlien,
      levelAlien: alien.levelAlien ? topPath.parentName : null,
    },
    suggestion,
    confidence: Number((topPath.confidence * PERCENT_SCALE).toFixed(NEXT)),
    topPaths: paths.slice(NONE, DISPLAY_PATHS).map((p) => ({
      parentKey: p.parentKey,
      parentName: p.parentName,
      confidence: Number((p.confidence * PERCENT_SCALE).toFixed(NEXT)),
      trail: p.trail,
    })),
    bridge: formatBridge(bridgeInfo),
    relatedConcepts,
  };
}

export { buildResult, buildUncertainSuggestion };
