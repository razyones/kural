/**
 * Orchestrates the complete scoring pipeline to produce a
 * ScoreCard for every node in the tree — capturing three perspectives:
 * as a child, as a parent, and as a subtree root.
 */

import type { CodeNode, NodeMap } from "../tree/tree.ts";
import {
  NO_SIBLINGS,
  computeChildrenFit,
  computeChildrenUniqueness,
  computeFit,
  computeUniqueness,
  findBestUncle,
} from "./metrics.ts";
import { buildTree, getEligibleChildren, isLeaf } from "../tree/tree.ts";
import { collectSubtree, descendantScores } from "./subtree.ts";
import { harmonicMean, unitizeCosine, unitizeDistance } from "../../utils/vectors.ts";
import type { ParseResult } from "../ingestion/parse/pipeline.ts";

const NONE = 0;

/** Structural health metrics for a single node. @kuralPatterns scoreShape */
type ScoreCard = {
  key: string;
  kind: CodeNode["kind"];
  name: string;
  fit: number | null;
  uniqueness: number;
  score: number | null;
  childrenFit: number | null;
  childrenUniqueness: number | null;
  childrenScore: number | null;
  subtreeFit: number | null;
  subtreeUniqueness: number | null;
  subtreeScore: number | null;
  overallScore: number | null;
  worstPair: [string, string] | null;
  bestUncle: { name: string; score: number } | null;
};

/** Pre-computed per-node metrics. */
type NodeMetrics = {
  fitMap: Map<string, number | null>;
  uniqMap: Map<string, number>;
  childrenFitMap: Map<string, number | null>;
  childrenUniqMap: Map<string, number>;
  worstPairs: Map<string, [string, string] | null>;
};

/**
 * Computes all per-node metrics in a single pass.
 * @param nodes - The flat node map to compute metrics for
 * @returns Pre-computed per-node metrics including fit, uniqueness, and worst pairs
 * @kuralPure
 */
function computeMetrics(nodes: NodeMap): NodeMetrics {
  const fitMap = new Map<string, number | null>();
  const uniqMap = new Map<string, number>();
  const childrenFitMap = new Map<string, number | null>();
  const childrenUniqMap = new Map<string, number>();
  const worstPairs = new Map<string, [string, string] | null>();

  for (const [key, node] of nodes) {
    fitMap.set(key, computeFit(node, nodes));
    childrenFitMap.set(key, computeChildrenFit(node));

    if (!isLeaf(node)) {
      const children = getEligibleChildren(node, nodes);
      if (children.length > NONE) {
        const perChild = computeUniqueness(node, children);
        for (const [childKey, val] of perChild) {
          uniqMap.set(childKey, val);
        }

        // Exclude outward-bound children from CV computation
        const forCV = children.filter((c) => c.bound !== "outward");
        const cvResult = computeChildrenUniqueness(node, forCV.length > NONE ? forCV : children);
        childrenUniqMap.set(key, cvResult.score);
        worstPairs.set(key, cvResult.worstPair);
      }
    }
  }

  return { fitMap, uniqMap, childrenFitMap, childrenUniqMap, worstPairs };
}

/**
 * Computes the self-placement score.
 * @param fit - The node's fit score, or null if unavailable
 * @param uniqueness - The node's uniqueness score
 * @returns Harmonic mean of fit and uniqueness, or null if inputs are insufficient
 * @kuralPure
 */
function computeScore(fit: number | null, uniqueness: number): number | null {
  if (fit === null || uniqueness === NO_SIBLINGS) {
    return null;
  }
  // uniqueness is mean pairwise distance ∈ [0, 2]; rescale to [0, 1].
  return harmonicMean(unitizeCosine(fit), unitizeDistance(uniqueness));
}

/**
 * Computes the children score.
 * @param childrenFit - The container's children fit score, or null if unavailable
 * @param childrenUniqueness - The container's children uniqueness score, or null if unavailable
 * @returns Harmonic mean of childrenFit and childrenUniqueness, or null if inputs are insufficient
 * @kuralPure
 */
function computeChildrenScore(
  childrenFit: number | null,
  childrenUniqueness: number | null,
): number | null {
  if (childrenFit === null || childrenUniqueness === null) {
    return null;
  }
  // childrenUniqueness is CV-derived ∈ [0, 1]; no rescale needed.
  return harmonicMean(unitizeCosine(childrenFit), childrenUniqueness);
}

/**
 * Builds a ScoreCard for a leaf node.
 * @param node - The leaf node to build a card for
 * @param metrics - Pre-computed per-node metrics
 * @param nodes - The flat node map for uncle lookups
 * @returns A complete ScoreCard for the leaf node
 * @kuralPatterns cardBuilder
 * @kuralPure
 */
function buildLeafCard(node: CodeNode, metrics: NodeMetrics, nodes: NodeMap): ScoreCard {
  const fit = metrics.fitMap.get(node.key) ?? null;
  const uniqueness = metrics.uniqMap.get(node.key) ?? NO_SIBLINGS;
  const selfScore = computeScore(fit, uniqueness);

  return {
    key: node.key,
    kind: node.kind,
    name: node.name,
    fit,
    uniqueness,
    score: selfScore,
    childrenFit: null,
    childrenUniqueness: null,
    childrenScore: null,
    subtreeFit: null,
    subtreeUniqueness: null,
    subtreeScore: null,
    overallScore: selfScore,
    worstPair: null,
    bestUncle: findBestUncle(node, nodes),
  };
}

/**
 * Computes subtree-level scores for a container.
 * @param key - The node key to compute subtree scores for
 * @param metrics - Pre-computed per-node metrics
 * @param nodes - The flat node map for traversal
 * @param subtreeCache - Memoization cache for subtree results
 * @returns Subtree fit, uniqueness, and combined score
 * @kuralPure
 */
function computeSubtreeScores(
  key: string,
  metrics: NodeMetrics,
  nodes: NodeMap,
): { subtreeFit: number | null; subtreeUniqueness: number | null; subtreeScore: number | null } {
  const cFit = metrics.childrenFitMap.get(key) ?? null;
  const cUniq = metrics.childrenUniqMap.get(key) ?? NO_SIBLINGS;

  const sub = collectSubtree(key, nodes, metrics.childrenFitMap, metrics.childrenUniqMap);
  const { subtreeFit, subtreeUniqueness } = descendantScores(sub, cFit, cUniq);

  // subtreeUniqueness is the mean of CV values ∈ [0, 1]; no rescale needed.
  const subtreeScore =
    subtreeFit === null || subtreeUniqueness === null
      ? null
      : harmonicMean(unitizeCosine(subtreeFit), subtreeUniqueness);

  return { subtreeFit, subtreeUniqueness, subtreeScore };
}

/**
 * Builds a ScoreCard for a container node.
 * @param key - The node key
 * @param node - The container node to build a card for
 * @param metrics - Pre-computed per-node metrics
 * @param nodes - The flat node map for traversal and uncle lookups
 * @returns A complete ScoreCard for the container node
 * @kuralPatterns cardBuilder
 * @kuralPure
 */
function buildContainerCard(
  key: string,
  node: CodeNode,
  metrics: NodeMetrics,
  nodes: NodeMap,
): ScoreCard {
  const fit = metrics.fitMap.get(key) ?? null;
  const uniqueness = metrics.uniqMap.get(key) ?? NO_SIBLINGS;
  const selfScore = computeScore(fit, uniqueness);

  const cFit = metrics.childrenFitMap.get(key) ?? null;
  const cUniq = metrics.childrenUniqMap.get(key) ?? NO_SIBLINGS;
  const cUniqOrNull = cUniq === NO_SIBLINGS ? null : cUniq;
  const cScore = computeChildrenScore(cFit, cUniqOrNull);

  const { subtreeFit, subtreeUniqueness, subtreeScore } = computeSubtreeScores(key, metrics, nodes);

  const overallScore =
    selfScore === null || subtreeScore === null
      ? (selfScore ?? subtreeScore ?? null)
      : harmonicMean(selfScore, subtreeScore);

  return {
    key,
    kind: node.kind,
    name: node.name,
    fit,
    uniqueness,
    score: selfScore,
    childrenFit: cFit,
    childrenUniqueness: cUniqOrNull,
    childrenScore: cScore,
    subtreeFit,
    subtreeUniqueness,
    subtreeScore,
    overallScore,
    worstPair: metrics.worstPairs.get(key) ?? null,
    bestUncle: findBestUncle(node, nodes),
  };
}

/**
 * Produces a ScoreCard for every node in the codebase tree.
 * @param result - Parsed codebase with files and directories
 * @returns Array of ScoreCards, one per node
 * @kuralPure
 */
function score(result: ParseResult): ScoreCard[] {
  const nodes = buildTree(result);
  const metrics = computeMetrics(nodes);
  const cards: ScoreCard[] = [];

  for (const [key, node] of nodes) {
    if (isLeaf(node)) {
      cards.push(buildLeafCard(node, metrics, nodes));
    } else {
      cards.push(buildContainerCard(key, node, metrics, nodes));
    }
  }

  return cards;
}

export { score };
export type { ScoreCard };
