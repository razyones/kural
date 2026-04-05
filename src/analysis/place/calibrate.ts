/**
 * The surveyor. Probes the tree's own distributions to establish query-space
 * baselines for alien detection. It is the only module that calibrates
 * detection thresholds from the tree — no other module measures probe
 * baselines or computes alien fences.
 */

import type { CodeNode, NodeMap } from "../tree/tree.ts";
import { NONE, SENSITIVITY } from "./helpers.ts";
import { getChildren, isLeaf } from "../tree/tree.ts";
import type { AxisResult } from "./types.ts";
import type { PlacementEmbedder } from "./helpers.ts";
import { cosineSimilarity } from "../../utils/vectors.ts";
import { robustLowerFence } from "../audits/fence.ts";

const NEXT = 1;
const MIN_PROBES = 2;

/** Calibration result with the computed alien fence. */
type CalibrationResult = {
  alienFence: number;
  probeCount: number;
};

/**
 * Selects one file description per top-level module as calibration probes.
 * @param nodes - The full node map for traversing the tree
 * @param root - The root directory node to start probe selection from
 * @returns Array of probe descriptions paired with their parent directory keys
 * @kuralPure
 */
function selectProbes(
  nodes: NodeMap,
  root: CodeNode,
): { description: string; parentKey: string }[] {
  const topDirs = getChildren(root, nodes).filter((c) => c.kind === "directory");
  const probes: { description: string; parentKey: string }[] = [];
  for (const dir of topDirs) {
    const files = getChildren(dir, nodes).filter(
      (c) => c.kind === "file" && c.description !== undefined && c.description.length > NONE,
    );
    if (files.length > NONE) {
      probes.push({ description: files[NONE].description ?? "", parentKey: dir.key });
    }
    const subDirs = getChildren(dir, nodes).filter((c) => c.kind === "directory");
    for (const sub of subDirs.slice(NONE, NEXT)) {
      const subFiles = getChildren(sub, nodes).filter(
        (c) => c.kind === "file" && c.description !== undefined && c.description.length > NONE,
      );
      if (subFiles.length > NONE) {
        probes.push({ description: subFiles[NONE].description ?? "", parentKey: sub.key });
      }
    }
  }
  return probes;
}

/**
 * Embeds probe descriptions and computes the alien fence from the
 * query-space distribution.
 * @param embedder - Function that embeds text strings into vectors
 * @param nodes - The full node map
 * @param root - The root directory node
 * @returns Alien fence threshold and probe count
 * @kuralCauses calls the embedding API via embedder
 */
async function calibrateAlienFence(
  embedder: PlacementEmbedder,
  nodes: NodeMap,
  root: CodeNode,
): Promise<CalibrationResult> {
  const probes = selectProbes(nodes, root);
  if (probes.length < MIN_PROBES) {
    return { alienFence: NONE, probeCount: NONE };
  }

  const probeVecs = await embedder(probes.map((p) => p.description));
  const probeSims: number[] = [];
  for (let i = NONE; i < probes.length; i++) {
    let bestSim = NONE;
    for (const [, node] of nodes) {
      if (!isLeaf(node) || node.identity.length === NONE) {
        continue;
      }
      const sim = cosineSimilarity(probeVecs[i], node.identity);
      if (sim > bestSim) {
        bestSim = sim;
      }
    }
    probeSims.push(bestSim);
  }

  return {
    alienFence: robustLowerFence(probeSims, SENSITIVITY),
    probeCount: probes.length,
  };
}

/**
 * Finds the best matching leaf node for the query.
 * @param q - Query embedding vector
 * @param nodes - The full node map
 * @returns Best matching leaf name and similarity score
 * @kuralPure
 */
function bestLeafMatch(q: number[], nodes: NodeMap): { similarity: number; name: string } {
  let bestSim = NONE;
  let bestName = "";
  for (const [, node] of nodes) {
    if (!isLeaf(node) || node.identity.length === NONE) {
      continue;
    }
    const sim = cosineSimilarity(q, node.identity);
    if (sim > bestSim) {
      bestSim = sim;
      bestName = node.name;
    }
  }
  return { similarity: bestSim, name: bestName };
}

/**
 * Classifies query as domain or capability axis.
 * @param q - Query embedding vector
 * @param rootNode - The root directory node
 * @param nodes - The full node map
 * @returns Axis classification with fit scores
 * @kuralPure
 */
function classifyAxis(q: number[], rootNode: CodeNode, nodes: NodeMap): AxisResult {
  const topLevel = getChildren(rootNode, nodes);
  const utils = topLevel.filter((c) => c.util && c.kind === "directory");
  const domain = topLevel.filter((c) => !c.util && c.kind === "directory");

  const bestDomain =
    domain.length > NONE ? Math.max(...domain.map((c) => cosineSimilarity(q, c.identity))) : NONE;
  const bestUtil =
    utils.length > NONE ? Math.max(...utils.map((c) => cosineSimilarity(q, c.identity))) : NONE;

  return {
    classification: bestUtil > bestDomain ? "capability" : "domain",
    domainFit: bestDomain,
    capabilityFit: bestUtil,
  };
}

export { bestLeafMatch, calibrateAlienFence, classifyAxis };
export type { CalibrationResult };
