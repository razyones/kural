/**
 * The pathfinder. Evaluates all root-to-directory paths through the tree
 * using conditional probability chains ranked by geometric mean. It is
 * the only module that performs exhaustive probabilistic path search —
 * no other module explores the full routing tree.
 */

import type { CodeNode, NodeMap } from "../tree/tree.ts";
import { HALF_BLEND, NONE, PERCENT_SCALE, TOP_PATHS, vecOf } from "./helpers.ts";
import type { RankedPath, TrailEntry } from "./types.ts";
import { avg, cosineSimilarity } from "../../utils/vectors.ts";
import { isLeaf } from "../tree/tree.ts";
import { localProject } from "./lcpn.ts";

const NEXT = 1;
const HALF = 2;

/** Internal path during chain exploration. */
type ChainPath = {
  parentKey: string;
  parentName: string;
  logProb: number;
  depth: number;
  trail: TrailEntry[];
  alien: boolean;
};

/**
 * Computes blended scores for children using LCPN + base similarity.
 * @param q - Query embedding vector.
 * @param childVecs - Embedding vectors of the child nodes.
 * @returns Array of blended similarity scores, one per child.
 * @kuralPure
 */
function blendedScores(q: number[], childVecs: number[][]): number[] {
  const sims = childVecs.map((cv) => cosineSimilarity(q, cv));
  const proj = localProject(q, childVecs);
  const projSims = proj
    ? proj.projectedChildren.map((pc) => cosineSimilarity(proj.projectedQ, pc))
    : null;
  return childVecs.map((_, i) => {
    const projSim = projSims === null ? sims[i] : projSims[i];
    return HALF_BLEND * projSim + HALF_BLEND * sims[i];
  });
}

const MIN_TEMPERATURE = 0.01;

/**
 * Computes routing temperature from branching factor: more children means
 * more decisive routing to avoid probability dilution. For 5 children T≈0.2,
 * for 10 children T≈0.1, matching empirically effective ranges.
 * @param numChildren - Number of child directories at this routing step
 * @returns Temperature value scaled to branching factor
 * @kuralPure
 */
function adaptiveTemperature(numChildren: number): number {
  return Math.max(NEXT / Math.max(numChildren, NEXT), MIN_TEMPERATURE);
}

/**
 * Converts scores to softmax probabilities with a create-new virtual child.
 * @param scores - Raw blended similarity scores for existing children.
 * @returns Softmax probability array with an appended create-new entry.
 * @kuralPure
 */
function softmaxWithCreateNew(scores: number[]): number[] {
  const temperature = adaptiveTemperature(scores.length);
  const scoreMean = avg(scores);
  const scoreStd = Math.sqrt(
    scores.reduce((s, v) => s + (v - scoreMean) ** HALF, NONE) / scores.length,
  );
  const allScores = [...scores, scoreMean + scoreStd];
  const maxScore = Math.max(...allScores);
  const exps = allScores.map((s) => Math.exp((s - maxScore) / temperature));
  const sumExp = exps.reduce((a, b) => a + b, NONE);
  return exps.map((e) => e / sumExp);
}

/**
 * Resolves directory children, filtering out leaves and optionally util nodes.
 * @param parentNode - The parent node whose children to resolve.
 * @param nodes - The full node map for looking up child keys.
 * @returns Array of directory child entries with their keys and nodes.
 * @kuralPure
 */
function directoryChildren(
  parentNode: CodeNode,
  nodes: NodeMap,
): { key: string; node: CodeNode }[] {
  const children = parentNode.childKeys
    .map((k) => ({ key: k, node: nodes.get(k) }))
    .filter(
      (item): item is { key: string; node: CodeNode } =>
        item.node !== undefined && !isLeaf(item.node) && item.node.kind === "directory",
    );
  return parentNode.util ? children : children.filter(({ node: c }) => !c.util);
}

/**
 * Builds a trail entry for a routing step.
 * @param parentName - Display name of the parent node at this step.
 * @param choice - Name of the chosen child or create-new marker.
 * @param probability - Raw probability of this routing choice.
 * @returns A formatted trail entry with a percentage-scaled probability.
 * @kuralPure
 */
function trailEntry(parentName: string, choice: string, probability: number): TrailEntry {
  return {
    node: parentName,
    choice,
    probability: Number((probability * PERCENT_SCALE).toFixed(NEXT)),
  };
}

/**
 * Recursively explores all directory paths from a parent node.
 * @param q - Query embedding vector.
 * @param parentKey - Key identifying the current parent node.
 * @param parentNode - The current parent node to expand.
 * @param nodes - The full node map for child lookups.
 * @param logProb - Accumulated log-probability along this path.
 * @param depth - Current depth in the routing tree.
 * @param trail - Trail entries accumulated so far.
 * @returns All leaf-terminated chain paths reachable from this parent.
 * @kuralPure
 */
function explorePaths(
  q: number[],
  parentKey: string,
  parentNode: CodeNode,
  nodes: NodeMap,
  logProb: number,
  depth: number,
  trail: TrailEntry[],
): ChainPath[] {
  const filtered = directoryChildren(parentNode, nodes);
  if (filtered.length === NONE) {
    return [{ parentKey, parentName: parentNode.name, logProb, depth, trail, alien: false }];
  }

  const childVecs = filtered.map(({ node: c }) => vecOf(c));
  const probs = softmaxWithCreateNew(blendedScores(q, childVecs));
  const allPaths: ChainPath[] = [];

  const createNewProb = probs[probs.length - NEXT];
  if (createNewProb > NONE) {
    allPaths.push({
      parentKey,
      parentName: parentNode.name,
      logProb: logProb + Math.log(createNewProb),
      depth,
      trail: [...trail, trailEntry(parentNode.name, "\u00ABcreate-new\u00BB", createNewProb)],
      alien: true,
    });
  }

  for (let i = NONE; i < filtered.length; i++) {
    const step = trailEntry(parentNode.name, filtered[i].node.name, probs[i]);
    allPaths.push(
      ...explorePaths(
        q,
        filtered[i].key,
        filtered[i].node,
        nodes,
        logProb + Math.log(probs[i]),
        depth + NEXT,
        [...trail, step],
      ),
    );
  }

  return allPaths;
}

/**
 * Exhaustive conditional probability chain search through the directory tree.
 * @param q - Query embedding vector
 * @param rootKey - Key of the starting node
 * @param rootNode - The starting node
 * @param nodes - The full node map
 * @returns Top ranked paths with confidence scores
 * @kuralPure
 */
function chainSearch(
  q: number[],
  rootKey: string,
  rootNode: CodeNode,
  nodes: NodeMap,
): RankedPath[] {
  const allPaths = explorePaths(q, rootKey, rootNode, nodes, NONE, NONE, []);

  allPaths.sort((a, b) => {
    const avgA = a.logProb / Math.max(a.depth, NEXT);
    const avgB = b.logProb / Math.max(b.depth, NEXT);
    return avgB - avgA;
  });

  if (allPaths.length === NONE) {
    return [
      { parentKey: rootKey, parentName: rootNode.name, confidence: NEXT, depth: NONE, trail: [] },
    ];
  }

  const avgLogProbs = allPaths.map((p) => p.logProb / Math.max(p.depth, NEXT));
  const finite = avgLogProbs.filter((lp) => lp > -Infinity);
  const maxAvg = finite.length > NONE ? Math.max(...finite) : NONE;
  const confExps = avgLogProbs.map((lp) => (lp > -Infinity ? Math.exp(lp - maxAvg) : NONE));
  const confSum = confExps.reduce((a, b) => a + b, NONE);
  const confidences =
    confSum > NONE ? confExps.map((e) => e / confSum) : confExps.map(() => NEXT / allPaths.length);

  return allPaths.slice(NONE, TOP_PATHS).map((p, i) => ({
    parentKey: p.parentKey,
    parentName: p.parentName,
    confidence: confidences[i],
    depth: p.depth,
    trail: p.trail,
  }));
}

export { chainSearch };
