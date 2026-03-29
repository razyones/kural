/**
 * The judge. Orchestrates the complete scoring pipeline to produce a
 * ScoreCard for every non-leaf node. It is the only entry point for
 * structural health evaluation — no other module triggers scoring.
 */

import type { CodeNode, NodeMap } from "./tree.ts";
import { NO_SIBLINGS, computeLabelFit, computeLabelUniqueness, findBestUncle } from "./metrics.ts";
import { buildTree, getEligibleChildren, isLeaf } from "./tree.ts";
import { collectSubtree, descendantScores } from "./subtree.ts";
import type { ParseResult } from "../ingestion/parse/pipeline.ts";
import type { SubtreeResult } from "./subtree.ts";
import { harmonicMean } from "../utils/vectors.ts";

const NONE = 0;

/** Structural health metrics for a single non-leaf node. */
type ScoreCard = {
  key: string;
  kind: CodeNode["kind"];
  name: string;
  labelFit: number | null;
  labelUniqueness: number;
  subtreeFit: number;
  subtreeUniqueness: number;
  subtreeMinFit: number;
  subtreeMinUniqueness: number;
  overallScore: number | null;
  worstPair: [string, string] | null;
  bestUncle: { name: string; score: number } | null;
};

/** Pre-computed per-node metrics needed before card building. */
type NodeMetrics = {
  fitMap: Map<string, number | null>;
  uniqMap: Map<string, number>;
  worstPairs: Map<string, [string, string] | null>;
};

/**
 * Computes label-fit, label-uniqueness, and worst-pair for all
 * eligible non-leaf nodes.
 */
function computeMetrics(nodes: NodeMap): NodeMetrics {
  const fitMap = new Map<string, number | null>();
  const uniqMap = new Map<string, number>();
  const worstPairs = new Map<string, [string, string] | null>();

  for (const [key, node] of nodes) {
    if (isLeaf(node)) {
      continue;
    }
    const children = getEligibleChildren(node, nodes);
    if (children.length === NONE) {
      continue;
    }

    fitMap.set(key, computeLabelFit(node));

    const { score: uniq, worstPair } = computeLabelUniqueness(node, children);
    uniqMap.set(key, uniq);
    worstPairs.set(key, worstPair);
  }

  return { fitMap, uniqMap, worstPairs };
}

/**
 * Builds ScoreCards for all non-leaf nodes using pre-computed metrics.
 */
function buildCards(nodes: NodeMap, metrics: NodeMetrics): ScoreCard[] {
  const { fitMap, uniqMap, worstPairs } = metrics;
  const subtreeCache = new Map<string, SubtreeResult>();
  const cards: ScoreCard[] = [];

  for (const [key, node] of nodes) {
    if (isLeaf(node)) {
      continue;
    }

    const localFit = fitMap.get(key) ?? null;
    const localUniq = uniqMap.get(key) ?? NO_SIBLINGS;

    const sub = memoizedCollectSubtree(key, nodes, fitMap, uniqMap, subtreeCache);
    const { subtreeFit, subtreeUniqueness, subtreeMinFit, subtreeMinUniqueness } = descendantScores(
      sub,
      localFit,
      localUniq,
    );

    const overallScore =
      localFit === null || subtreeUniqueness === NO_SIBLINGS
        ? null
        : harmonicMean(subtreeFit, subtreeUniqueness);

    cards.push({
      key,
      kind: node.kind,
      name: node.name,
      labelFit: localFit,
      labelUniqueness: localUniq,
      subtreeFit,
      subtreeUniqueness,
      subtreeMinFit,
      subtreeMinUniqueness,
      overallScore,
      worstPair: worstPairs.get(key) ?? null,
      bestUncle: findBestUncle(node, nodes),
    });
  }

  return cards;
}

/**
 * Produces a ScoreCard for every non-leaf node in the codebase tree.
 *
 * Pipeline:
 * 1. Build tree from ParseResult
 * 2. Compute label-fit for all non-leaf nodes
 * 3. Compute label-uniqueness (V2 CV-based) for all non-leaf nodes
 * 4. Collect subtree aggregations (memoized, single traversal)
 * 5. Compute overall harmonic mean
 *
 * @param result - Parsed codebase with embedded units
 * @returns Array of score cards, one per non-leaf node
 */
function score(result: ParseResult): ScoreCard[] {
  const nodes = buildTree(result);
  const metrics = computeMetrics(nodes);
  return buildCards(nodes, metrics);
}

/**
 * Memoized wrapper around collectSubtree to avoid redundant traversals.
 */
function memoizedCollectSubtree(
  key: string,
  nodes: NodeMap,
  fitMap: Map<string, number | null>,
  uniqMap: Map<string, number>,
  cache: Map<string, SubtreeResult>,
): SubtreeResult {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const result = collectSubtree(key, nodes, fitMap, uniqMap);
  cache.set(key, result);
  return result;
}

export { score };
export type { ScoreCard };
