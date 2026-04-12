/**
 * Probes the tree's own distributions to establish query-space
 * baselines for alien detection. It is the only module that calibrates
 * detection thresholds from the tree — no other module measures probe
 * baselines or computes alien fences.
 */

import type { AxisResult, RankedPath } from "./types.ts";
import type { CodeNode, NodeMap } from "../tree/tree.ts";
import { DEFAULT_SENSITIVITY, NONE } from "./helpers.ts";
import { getChildren, isLeaf } from "../tree/tree.ts";
import { median, robustLowerFence } from "../audits/fence.ts";
import type { PlacementEmbedder } from "./helpers.ts";
import { chainSearch } from "./chain.ts";
import { cosineSimilarity } from "../../utils/vectors.ts";

const NEXT = 1;
const MIN_PROBES = 2;
const SENSITIVITY_INCREMENT = 1;

/** Calibration result with all self-calibrated placement thresholds. */
type CalibrationResult = {
  alienFence: number;
  hardAlienFence: number;
  safetyGate: number;
  bridgeThreshold: number;
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
 * Scores each probe by finding its best leaf match and chain-search confidence.
 * @param probeVecs - Embedded probe vectors
 * @param nodes - The full node map
 * @param rootKey - Key of the root directory
 * @param root - The root directory node
 * @returns Best-match similarities (one per probe) and chain-search confidences (only for probes where chain search returned paths)
 * @kuralPure
 */
function scoreProbes(
  probeVecs: number[][],
  nodes: NodeMap,
  rootKey: string,
  root: CodeNode,
): { probeSims: number[]; probeConfidences: number[] } {
  const probeSims: number[] = [];
  const probeConfidences: number[] = [];
  for (let i = NONE; i < probeVecs.length; i++) {
    probeSims.push(bestLeafMatch(probeVecs[i], nodes).similarity);
    const paths: RankedPath[] = chainSearch(probeVecs[i], rootKey, root, nodes);
    if (paths.length > NONE) {
      probeConfidences.push(paths[NONE].confidence);
    }
  }
  return { probeSims, probeConfidences };
}

/**
 * Computes self-calibrated confidence thresholds from probe distributions.
 * @param probeSims - Best-match similarities from probes
 * @param probeConfidences - Chain-search confidences from probes
 * @returns Alien fences, safety gate, and bridge threshold
 * @kuralPure
 */
function computeThresholds(
  probeSims: number[],
  probeConfidences: number[],
): Omit<CalibrationResult, "probeCount"> {
  const sensitivity = DEFAULT_SENSITIVITY;
  const alienFence = robustLowerFence(probeSims, sensitivity);
  const hardAlienFence = robustLowerFence(probeSims, sensitivity + SENSITIVITY_INCREMENT);
  const hasConfidence = probeConfidences.length >= MIN_PROBES;
  const safetyGate = hasConfidence ? robustLowerFence(probeConfidences, sensitivity) : NONE;
  const confMed = hasConfidence ? median(probeConfidences) : NONE;
  const confSpread = hasConfidence
    ? median(probeConfidences.map((v) => Math.abs(v - confMed)))
    : NONE;
  const bridgeThreshold = Math.max(NONE, safetyGate - confSpread);
  return { alienFence, hardAlienFence, safetyGate, bridgeThreshold };
}

/**
 * Embeds probe descriptions and computes all self-calibrated placement
 * thresholds from the codebase's own distributions.
 * @param embedder - Function that embeds text strings into vectors
 * @param nodes - The full node map
 * @param rootKey - Key of the root directory node
 * @param root - The root directory node
 * @returns Self-calibrated thresholds for alien, bridge, and safety gating
 * @kuralCauses calls the embedding API via embedder
 */
async function calibrate(
  embedder: PlacementEmbedder,
  nodes: NodeMap,
  rootKey: string,
  root: CodeNode,
): Promise<CalibrationResult> {
  const probes = selectProbes(nodes, root);
  if (probes.length < MIN_PROBES) {
    return {
      alienFence: NONE,
      hardAlienFence: NONE,
      safetyGate: NONE,
      bridgeThreshold: NONE,
      probeCount: NONE,
    };
  }
  const probeVecs = await embedder(probes.map((p) => p.description));
  const { probeSims, probeConfidences } = scoreProbes(probeVecs, nodes, rootKey, root);
  return { ...computeThresholds(probeSims, probeConfidences), probeCount: probes.length };
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

export { bestLeafMatch, calibrate, classifyAxis };
export type { CalibrationResult };
