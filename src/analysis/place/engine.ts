/**
 * The navigator. Orchestrates the four-tier placement decision flow —
 * alien detection, bridge classification, safety gate, and confident
 * placement. It is the only module that combines all placement signals
 * into a final suggestion — no other module runs the decision tiers.
 */

import {
  BRIDGE_THRESHOLD,
  DECIMAL_PLACES,
  DISPLAY_PATHS,
  HARD_ALIEN_RATIO,
  NONE,
  PERCENT_SCALE,
  SAFETY_GATE,
  findCapabilityRoot,
  findRoot,
} from "./helpers.ts";
import type { BridgeResult, PlacementResult, PlacementSuggestion, RankedPath } from "./types.ts";
import { bestLeafMatch, calibrateAlienFence, classifyAxis } from "./calibrate.ts";
import { buildResult, buildUncertainSuggestion } from "./result.ts";
import { classifyBridgeType, routeByLayer } from "./bridge.ts";
import type { NodeMap } from "../tree/tree.ts";
import type { PlacementEmbedder } from "./helpers.ts";
import { chainSearch } from "./chain.ts";
import { findRelatedConcepts } from "./related.ts";

const NEXT = 1;

/**
 * Determines if the query is alien to the codebase.
 * @param leafSim - Best leaf-level cosine similarity for the query
 * @param alienFence - Calibrated similarity threshold for alien detection
 * @param topConfidence - Confidence score of the top-ranked path
 * @param topTrailHasCreateNew - Whether the top path's trail includes a create-new step
 * @returns Global and level alien flags
 * @kuralPure
 */
function detectAlien(
  leafSim: number,
  alienFence: number,
  topConfidence: number,
  topTrailHasCreateNew: boolean,
): { globalAlien: boolean; levelAlien: boolean } {
  const hardAlien = leafSim < alienFence * HARD_ALIEN_RATIO;
  const softAlien = leafSim < alienFence && topConfidence < SAFETY_GATE;
  return {
    globalAlien: hardAlien || softAlien,
    levelAlien: topTrailHasCreateNew,
  };
}

/**
 * Builds the suggestion for alien queries.
 * @param isGlobalAlien - Whether the query is globally alien vs level-alien
 * @param leafMatch - Best leaf match name and similarity score
 * @param paths - Ranked placement paths from chain search
 * @param nodes - The scored node map from the snapshot
 * @returns Placement suggestion with ask-user action and neighborhood candidates
 * @kuralPure
 */
function buildAlienSuggestion(
  isGlobalAlien: boolean,
  leafMatch: { name: string; similarity: number },
  paths: RankedPath[],
  nodes: NodeMap,
): PlacementSuggestion {
  const nonAlienPaths = paths.filter(
    (p) => !p.trail.some((t) => t.choice === "\u00ABcreate-new\u00BB"),
  );
  const neighborhoods = nonAlienPaths.slice(NONE, DISPLAY_PATHS).map((p) => {
    const dirNode = nodes.get(p.parentKey);
    return {
      name: p.parentName,
      description: dirNode?.description?.split("\n")[NONE] ?? "",
      confidence: Number((p.confidence * PERCENT_SCALE).toFixed(NEXT)),
    };
  });

  return {
    action: "ask-user",
    reason:
      "This concept is new to the codebase. Placement cannot be determined from the description alone.",
    method: isGlobalAlien ? "probe-alien-detection" : "level-alien-detection",
    bestLeafMatch: {
      name: leafMatch.name,
      similarity: Number(leafMatch.similarity.toFixed(DECIMAL_PLACES)),
    },
    neighborhoods,
  };
}

/**
 * Builds the suggestion for bridge queries.
 * @param bridgeInfo - Bridge classification result with type, layer, and confidence
 * @param queryVec - Embedding vector of the query text
 * @param nodes - The scored node map from the snapshot
 * @param root - Root key and node of the tree
 * @param paths - Ranked placement paths for fallback candidates
 * @returns Placement suggestion via bridge routing or escalation to user
 * @kuralPure
 */
function buildBridgeSuggestion(
  bridgeInfo: BridgeResult,
  queryVec: number[],
  nodes: NodeMap,
  root: { key: string; node: ReturnType<typeof findRoot>["node"] },
  paths: RankedPath[],
): PlacementSuggestion {
  if (bridgeInfo.confident) {
    const layerResult = routeByLayer(bridgeInfo.layer, queryVec, nodes, root);
    if (layerResult !== null) {
      return {
        action: "add-to-directory",
        target: layerResult.parentKey,
        name: layerResult.parentName,
        method: "bridge-type-routing",
        bridgeType: bridgeInfo.type,
        bridgeLayer: bridgeInfo.layer,
      };
    }
  }

  return {
    action: "ask-user",
    reason: bridgeInfo.confident
      ? "Bridge type classified but layer routing failed"
      : `Bridge type uncertain (${bridgeInfo.type} at ${(bridgeInfo.confidence * PERCENT_SCALE).toFixed(NONE)}%, gap ${(bridgeInfo.gap * PERCENT_SCALE).toFixed(NEXT)}%)`,
    method: "bridge-escalation",
    bridgeType: bridgeInfo.type,
    candidates: paths.slice(NONE, DISPLAY_PATHS).map((p) => ({
      name: p.parentName,
      confidence: Number((p.confidence * PERCENT_SCALE).toFixed(NEXT)),
    })),
  };
}

/**
 * Decides the placement tier and returns the suggestion + optional bridge info.
 * @param alien - Global and level alien detection flags
 * @param topPath - Highest-ranked placement path
 * @param paths - All ranked placement paths from chain search
 * @param leafMatch - Best leaf match similarity and name
 * @param nodes - The scored node map from the snapshot
 * @param root - Root key and node of the tree
 * @param q - Embedding vector of the query text
 * @param embedder - Function that embeds text strings into vectors
 * @returns Placement suggestion and optional bridge classification info
 * @kuralCauses may call the embedding API for bridge classification
 */
async function decideTier(
  alien: { globalAlien: boolean; levelAlien: boolean },
  topPath: RankedPath,
  paths: RankedPath[],
  leafMatch: { similarity: number; name: string },
  nodes: NodeMap,
  root: { key: string; node: ReturnType<typeof findRoot>["node"] },
  q: number[],
  embedder: PlacementEmbedder,
): Promise<{ suggestion: PlacementSuggestion; bridgeInfo: BridgeResult | null }> {
  const isAlien = alien.globalAlien || alien.levelAlien;
  if (isAlien) {
    return {
      suggestion: buildAlienSuggestion(alien.globalAlien, leafMatch, paths, nodes),
      bridgeInfo: null,
    };
  }

  const isBridge = topPath.confidence < BRIDGE_THRESHOLD;
  if (isBridge) {
    const bridgeInfo = await classifyBridgeType(embedder, q);
    return { suggestion: buildBridgeSuggestion(bridgeInfo, q, nodes, root, paths), bridgeInfo };
  }

  if (topPath.confidence < SAFETY_GATE) {
    return {
      suggestion: buildUncertainSuggestion(paths, nodes, topPath.confidence),
      bridgeInfo: null,
    };
  }

  return {
    suggestion: {
      action: "add-to-directory",
      target: topPath.parentKey,
      name: topPath.parentName,
      method: "chain-search",
    },
    bridgeInfo: null,
  };
}

/** Intermediate signals gathered before the tier decision. */
type PlaceSignals = {
  root: { key: string; node: ReturnType<typeof findRoot>["node"] };
  calibration: { alienFence: number; probeCount: number };
  q: number[];
  axis: ReturnType<typeof classifyAxis>;
  leafMatch: { similarity: number; name: string };
  paths: RankedPath[];
  topPath: RankedPath;
  chainGap: number;
  alien: { globalAlien: boolean; levelAlien: boolean };
};

/**
 * Gathers all placement signals: calibration, chain search, alien detection.
 * @param queryText - Description of the code to place
 * @param nodes - The scored node map from the snapshot
 * @param embedder - Function that embeds text strings into vectors
 * @returns Intermediate signals including calibration, paths, and alien flags
 * @kuralCauses calls the embedding API for calibration and query
 */
async function gatherSignals(
  queryText: string,
  nodes: NodeMap,
  embedder: PlacementEmbedder,
): Promise<PlaceSignals> {
  const root = findRoot(nodes);
  const calibration = await calibrateAlienFence(embedder, nodes, root.node);
  const [q] = await embedder([queryText]);
  const axis = classifyAxis(q, root.node, nodes);
  const leafMatch = bestLeafMatch(q, nodes);

  const startKey =
    axis.classification === "capability" ? (findCapabilityRoot(root, nodes) ?? root.key) : root.key;
  const paths = chainSearch(q, startKey, nodes.get(startKey) ?? root.node, nodes);
  const topPath = paths[NONE];
  const second = paths.length > NEXT ? paths[NEXT] : null;
  const chainGap = second === null ? NEXT : topPath.confidence - second.confidence;
  const hasCreateNew = topPath.trail.some((t) => t.choice === "\u00ABcreate-new\u00BB");
  const alien = detectAlien(
    leafMatch.similarity,
    calibration.alienFence,
    topPath.confidence,
    hasCreateNew,
  );

  return { root, calibration, q, axis, leafMatch, paths, topPath, chainGap, alien };
}

/**
 * Runs the full placement algorithm: calibrate, embed, detect, route.
 * @param queryText - Description of the code to place
 * @param nodes - The scored node map from the snapshot
 * @param embedder - Function that embeds text strings into vectors
 * @returns Complete placement result
 * @kuralCauses calls the embedding API for query and calibration probes
 */
async function place(
  queryText: string,
  nodes: NodeMap,
  embedder: PlacementEmbedder,
): Promise<PlacementResult> {
  const s = await gatherSignals(queryText, nodes, embedder);
  const { suggestion, bridgeInfo } = await decideTier(
    s.alien,
    s.topPath,
    s.paths,
    s.leafMatch,
    nodes,
    s.root,
    s.q,
    embedder,
  );
  const placementKey =
    suggestion.action === "add-to-directory" ? suggestion.target : s.topPath.parentKey;
  return buildResult(
    queryText,
    s.axis,
    s.calibration,
    s.leafMatch,
    s.chainGap,
    s.alien,
    s.topPath,
    s.paths,
    suggestion,
    bridgeInfo,
    findRelatedConcepts(s.q, nodes, placementKey),
  );
}

export { place };
export type { PlacementEmbedder };
