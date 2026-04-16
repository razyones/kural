/**
 * Detects cross-module concepts and routes them by bridge
 * type to the correct architectural layer. It is the only module that
 * classifies bridge types — no other module maps query semantics to
 * orchestrator/processor/presenter/resolver/gateway/adapter roles.
 */

import type { CodeNode, NodeMap } from "../tree/tree.ts";
import { DECIMAL_PLACES, DISPLAY_PATHS, NONE, vecOf } from "./helpers.ts";
import { avg, cosineSimilarity } from "../../utils/vectors.ts";
import type { BridgeResult } from "./types.ts";
import type { PlacementEmbedder } from "./helpers.ts";
import { getChildren } from "../tree/tree.ts";
import { stddev } from "../audits/fence.ts";

const NEXT = 1;
/** 1σ — requires the top type to be at least one stddev above the mean and gap. */
const Z_THRESHOLD = 1;

/** Bridge type reference descriptions. */
const BRIDGE_TYPE_REFS: Record<string, string> = {
  orchestrator:
    "Sequences and coordinates multiple pipeline stages, calling into different subsystems in a defined order to produce a combined result",
  processor:
    "Takes input data from one subsystem and transforms it into output consumed by a different subsystem",
  presenter:
    "Converts domain data structures into formatted output for human display in a terminal or interface",
  resolver:
    "Merges competing configuration sources and input options into a single resolved settings object",
  gateway:
    "Crosses a system boundary like network, database, or filesystem on behalf of a domain module",
  adapter: "Converts between two different data formats used by different subsystems",
  "entry-point":
    "The root dispatcher that boots the application, sets up routing, and delegates to subcommands",
};

/** Maps bridge types to architectural layers. */
const BRIDGE_TYPE_LAYER: Record<string, string> = {
  orchestrator: "command",
  processor: "domain",
  presenter: "command",
  resolver: "command",
  gateway: "domain",
  adapter: "domain",
  "entry-point": "root",
};

/**
 * Classifies the bridge type by comparing query against reference descriptions.
 * @param embedder - Function that embeds text strings into vectors
 * @param queryVec - The query embedding vector
 * @returns Bridge type classification result
 * @kuralCauses calls the embedding API via embedder
 */
async function classifyBridgeType(
  embedder: PlacementEmbedder,
  queryVec: number[],
): Promise<BridgeResult> {
  const typeNames = Object.keys(BRIDGE_TYPE_REFS);
  const typeVecs = await embedder(Object.values(BRIDGE_TYPE_REFS));

  const sims = typeVecs.map((tv, j) => ({
    type: typeNames[j],
    sim: cosineSimilarity(queryVec, tv),
  }));
  sims.sort((a, b) => b.sim - a.sim);

  const top = sims[NONE];
  const gap = sims.length > NEXT ? top.sim - sims[NEXT].sim : NONE;
  const layer = BRIDGE_TYPE_LAYER[top.type];

  const allSimValues = sims.map((s) => s.sim);
  const simMean = avg(allSimValues);
  const simStd = stddev(allSimValues, simMean);
  const confident =
    simStd > NONE && top.sim - simMean > Z_THRESHOLD * simStd && gap > Z_THRESHOLD * simStd;

  return {
    type: top.type,
    layer,
    confidence: top.sim,
    gap,
    confident,
    alternatives: sims.slice(NONE, DISPLAY_PATHS).map((s) => ({
      type: s.type,
      similarity: Number(s.sim.toFixed(DECIMAL_PLACES)),
    })),
  };
}

/**
 * Routes a bridge query to the correct directory based on its layer.
 * @param layer - The architectural layer (root, command, domain)
 * @param queryVec - The query embedding vector
 * @param nodes - The full node map
 * @param root - The root directory node
 * @returns Target directory, or null if routing fails
 * @kuralPure
 */
function routeByLayer(
  layer: string,
  queryVec: number[],
  nodes: NodeMap,
  root: { key: string; node: CodeNode },
): { parentKey: string; parentName: string } | null {
  if (layer === "root") {
    return { parentKey: root.key, parentName: root.node.name };
  }

  if (layer === "command") {
    return routeCommand(queryVec, nodes);
  }

  if (layer === "domain") {
    return routeDomain(queryVec, nodes, root);
  }

  return null;
}

/**
 * Finds the candidate with the highest cosine similarity to the query.
 * @param queryVec - The query embedding vector
 * @param candidates - Directory nodes to compare against
 * @param vectorFn - Extracts the comparison vector from a node
 * @returns The best-matching node, or null if candidates is empty
 * @kuralPure
 */
function bestMatch(
  queryVec: number[],
  candidates: CodeNode[],
  vectorFn: (node: CodeNode) => number[],
): CodeNode | null {
  let best: CodeNode | null = null;
  let bestSim = -NEXT;
  for (const c of candidates) {
    const sim = cosineSimilarity(queryVec, vectorFn(c));
    if (sim > bestSim) {
      bestSim = sim;
      best = c;
    }
  }
  return best;
}

/**
 * Converts a node to a route result.
 * @param node - The matched node
 * @returns Parent key and name pair
 * @kuralPure
 */
function toRoute(node: CodeNode): { parentKey: string; parentName: string } {
  return { parentKey: node.key, parentName: node.name };
}

/**
 * Routes to the best command directory.
 * @param queryVec - The query embedding vector
 * @param nodes - The full node map
 * @returns Best-matching command directory, or null if none found
 * @kuralPatterns layerRouter
 * @kuralPure
 */
function routeCommand(
  queryVec: number[],
  nodes: NodeMap,
): { parentKey: string; parentName: string } | null {
  const commands = [...nodes.values()].find((n) => n.name === "commands" && n.kind === "directory");
  if (commands === undefined) {
    return null;
  }
  const cmdDirs = getChildren(commands, nodes).filter((c) => c.kind === "directory");
  const best = bestMatch(queryVec, cmdDirs, (n) => n.identity);
  return best === null ? null : toRoute(best);
}

/**
 * Routes to the best domain directory, descending one level.
 * @param queryVec - The query embedding vector
 * @param nodes - The full node map
 * @param root - The root directory node
 * @returns Best-matching domain directory, or null if none found
 * @kuralPatterns layerRouter
 * @kuralPure
 */
function routeDomain(
  queryVec: number[],
  nodes: NodeMap,
  root: { key: string; node: CodeNode },
): { parentKey: string; parentName: string } | null {
  const topDirs = getChildren(root.node, nodes).filter((c) => c.kind === "directory" && !c.util);
  const bestDir = bestMatch(queryVec, topDirs, vecOf);
  if (bestDir === null) {
    return null;
  }

  const subDirs = getChildren(bestDir, nodes).filter((c) => c.kind === "directory");
  if (subDirs.length > NONE) {
    const bestSub = bestMatch(queryVec, subDirs, vecOf);
    if (bestSub !== null) {
      return toRoute(bestSub);
    }
  }
  return toRoute(bestDir);
}

export { classifyBridgeType, routeByLayer };
