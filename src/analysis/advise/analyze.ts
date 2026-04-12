/**
 * Simulates alternate groupings for a directory's children
 * by cutting a hierarchical clustering at multiple thresholds and projecting
 * the structural metrics each grouping would produce. It is the only module
 * that proposes reorganisation strategies — no other module evaluates
 * hypothetical folder structures against real vectors.
 */

import type { CodeNode, NodeMap } from "../tree/tree.ts";
import { HierarchicalClustering, Matrix, cosine, distance_matrix } from "@saehrimnir/druidjs";
import { avg, centroid, cosineSimilarity, harmonicMean, subtract } from "../../utils/vectors.ts";
import { collectMerges, isHCNode } from "../audits/cluster.ts";
import { getChildren } from "../tree/tree.ts";

const NONE = 0;
const NEXT = 1;
const HALF = 2;
const MIN_CHILDREN = 2;
const MIN_GROUP_SIZE = 2;

/** A proposed group of children at a given cut threshold. */
type ProposedGroup = {
  names: string[];
  childrenFit: number;
  childrenUniqueness: number;
  childrenScore: number;
};

/** A single cut-point evaluation. */
type CutEvaluation = {
  similarity: number;
  groups: ProposedGroup[];
  singletons: string[];
};

/** Named embedding vector for description mode. */
type NamedVector = {
  name: string;
  identity: number[];
  leaf: number[];
};

/** Full advise analysis result for one directory. */
type AdviseResult = {
  targetName: string;
  childCount: number;
  currentChildrenFit: number | null;
  currentChildrenUniqueness: number;
  currentChildrenScore: number | null;
  merges: number[];
  cuts: CutEvaluation[];
  bestCutIndex: number | null;
};

/**
 * Computes childrenUniqueness (CV) for a virtual parent and its children.
 * Reimplements the coefficient-of-variation formula on NamedVector pairs
 * rather than CodeNode objects.
 * @param parentIdentity - The parent's identity vector
 * @param children - The children to measure spread for
 * @returns CV-based uniqueness score in [0, 1]
 * @kuralPure
 */
function computeCV(parentIdentity: number[], children: NamedVector[]): number {
  const valid = children.filter((c) => c.identity.length > NONE);
  if (valid.length < MIN_CHILDREN) {
    return NEXT;
  }
  const deltas = valid.map((c) => subtract(c.identity, parentIdentity));
  const distances: number[] = [];
  for (let i = NONE; i < deltas.length; i++) {
    for (let j = i + NEXT; j < deltas.length; j++) {
      distances.push(NEXT - cosineSimilarity(deltas[i], deltas[j]));
    }
  }
  if (distances.length === NONE) {
    return NEXT;
  }
  return cvFromDistances(distances);
}

/**
 * Converts an array of pairwise distances into a CV-based score.
 * Applies the formula: 1 / (1 + stddev / mean).
 * @param distances - Array of pairwise distance values
 * @returns CV-based score in [0, 1], or 0 if mean is zero
 * @kuralPure
 */
function cvFromDistances(distances: number[]): number {
  const meanDist = avg(distances);
  if (meanDist === NONE) {
    return NONE;
  }
  const sumSq = distances.reduce((sum, d) => sum + (d - meanDist) * (d - meanDist), NONE);
  const besselCorrection = NEXT;
  const stddev =
    distances.length > NEXT ? Math.sqrt(sumSq / (distances.length - besselCorrection)) : NONE;
  return NEXT / (NEXT + stddev / meanDist);
}

/**
 * Simulates the structural metrics a proposed group would produce.
 * Computes childrenFit, childrenUniqueness, and their harmonic mean
 * from the group members' identity and leaf vectors.
 * @param members - The named vectors that form the proposed group
 * @returns A ProposedGroup with projected metric scores
 * @kuralPure
 */
function simulateGroup(members: NamedVector[]): ProposedGroup {
  const groupIdentity = centroid(members.map((m) => m.identity));
  const groupLeaf = centroid(members.map((m) => m.leaf));
  const childrenFit = cosineSimilarity(groupIdentity, groupLeaf);
  const childrenUniqueness = computeCV(groupIdentity, members);
  const childrenScore = harmonicMean(childrenFit, childrenUniqueness);
  return {
    names: members.map((m) => m.name),
    childrenFit,
    childrenUniqueness,
    childrenScore,
  };
}

/**
 * Evaluates a single distance threshold, producing the groups and singletons
 * that result from cutting the dendrogram at that point.
 * @param hc - The hierarchical clustering instance
 * @param threshold - The distance value to cut at
 * @param items - The original named vectors indexed by position
 * @returns A CutEvaluation with similarity, groups, and singletons
 * @kuralPure
 */
function evaluateCut(
  hc: HierarchicalClustering,
  threshold: number,
  items: NamedVector[],
): CutEvaluation {
  const indexGroups: number[][] = hc.get_clusters(threshold, "distance");
  const groups: ProposedGroup[] = [];
  const singletons: string[] = [];
  for (const indices of indexGroups) {
    if (indices.length >= MIN_GROUP_SIZE) {
      const members = indices.map((idx) => items[idx]);
      groups.push(simulateGroup(members));
    } else {
      for (const idx of indices) {
        singletons.push(items[idx].name);
      }
    }
  }
  const similarity = Math.cos(threshold);
  return { similarity, groups, singletons };
}

/**
 * Generates midpoint thresholds from sorted merge distances.
 * Each threshold sits halfway between consecutive merge values.
 * @param merges - Sorted array of merge distances
 * @returns Array of midpoint distance thresholds
 * @kuralPure
 */
function generateThresholds(merges: number[]): number[] {
  const thresholds: number[] = [];
  for (let i = NONE; i < merges.length - NEXT; i++) {
    thresholds.push((merges[i] + merges[i + NEXT]) / HALF);
  }
  return thresholds;
}

/**
 * Selects the best cut index: the one whose average group childrenScore
 * is highest and improves over the current score.
 * @param cuts - Array of evaluated cuts
 * @param currentScore - The current childrenScore to beat, or null
 * @returns Index of the best cut, or null if none improves
 * @kuralPure
 */
function selectBestCut(cuts: CutEvaluation[], currentScore: number | null): number | null {
  let bestIndex: number | null = null;
  let bestAvg = currentScore ?? NONE;
  for (let i = NONE; i < cuts.length; i++) {
    const cut = cuts[i];
    if (cut.groups.length === NONE) {
      continue;
    }
    const groupAvg = avg(cut.groups.map((g) => g.childrenScore));
    if (groupAvg > bestAvg) {
      bestAvg = groupAvg;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * Core analysis engine. Builds a hierarchical clustering from identity
 * vectors, evaluates cuts at every merge-gap midpoint, and projects
 * what the structural metrics would look like for each proposed grouping.
 * @param items - Named vectors representing directory children
 * @param parentIdentity - The parent's identity vector for metric computation
 * @returns Full advise result with cuts and best recommendation, or null
 * @kuralPure
 */
function analyzeVectors(items: NamedVector[], parentIdentity: number[]): AdviseResult | null {
  if (items.length < MIN_CHILDREN) {
    return null;
  }
  const matrix = Matrix.from(items.map((it) => it.identity));
  const distMat = distance_matrix(matrix, cosine);
  const hc = new HierarchicalClustering(distMat, {
    linkage: "average",
    metric: "precomputed",
  });
  const root: unknown = hc.root;
  const merges = (isHCNode(root) ? collectMerges(root) : []).toSorted((a, b) => a - b);
  const leafVecs = items.map((it) => it.leaf);
  const currentFit = cosineSimilarity(parentIdentity, centroid(leafVecs));
  const currentUniqueness = computeCV(parentIdentity, items);
  const currentScore = harmonicMean(currentFit, currentUniqueness);
  const thresholds = generateThresholds(merges);
  const cuts = thresholds.map((t) => evaluateCut(hc, t, items));
  const bestCutIndex = selectBestCut(cuts, currentScore);
  return {
    targetName: "",
    childCount: items.length,
    currentChildrenFit: currentFit,
    currentChildrenUniqueness: currentUniqueness,
    currentChildrenScore: currentScore,
    merges,
    cuts,
    bestCutIndex,
  };
}

/**
 * Analyzes a directory node from the snapshot tree. Extracts directory
 * children with valid identity vectors and delegates to the core engine.
 * @param node - The directory node to analyze
 * @param nodes - The full node map for child resolution
 * @param useLeaf - When true, use leaf vectors instead of identity vectors
 * @returns Full advise result, or null if fewer than two eligible children
 * @kuralPure
 */
function analyzeFromTree(node: CodeNode, nodes: NodeMap, useLeaf: boolean): AdviseResult | null {
  const children = getChildren(node, nodes).filter(
    (c) => c.kind === "directory" && c.identity.length > NONE,
  );
  const items: NamedVector[] = children.map((c) => ({
    name: c.name,
    identity: useLeaf ? c.leaf : c.identity,
    leaf: c.leaf,
  }));
  const result = analyzeVectors(items, node.identity);
  if (result === null) {
    return null;
  }
  result.targetName = node.name;
  return result;
}

/**
 * Analyzes raw name-embedding pairs without a snapshot tree. Computes
 * a virtual parent identity from the centroid of all items and delegates
 * to the core engine.
 * @param items - Named vectors with identity and leaf embeddings
 * @returns Full advise result, or null if fewer than two items
 * @kuralPure
 */
function analyzeFromDescriptions(items: NamedVector[]): AdviseResult | null {
  const parentIdentity = centroid(items.map((it) => it.identity));
  const result = analyzeVectors(items, parentIdentity);
  if (result === null) {
    return null;
  }
  result.targetName = "descriptions";
  return result;
}

export { analyzeFromDescriptions, analyzeFromTree };
export type { AdviseResult, CutEvaluation, NamedVector, ProposedGroup };
