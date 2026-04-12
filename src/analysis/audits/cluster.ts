/**
 * Computes hierarchical distance trees for diagnostic
 * split detection — the core algorithm behind bloat analysis. It is the
 * only module in the diagnostic suite that constructs merge-gap dendrograms
 * for issue detection — no other audit infrastructure performs hierarchical
 * clustering.
 */

import { HierarchicalClustering, Matrix, cosine, distance_matrix } from "@saehrimnir/druidjs";

const NONE = 0;
const MIN_EMBEDDINGS = 2;
const NEXT = 1;
const HALF = 2;

/** Result of cutting a dendrogram at its largest gap. */
type DendrogramResult = {
  clusters: number[][];
  gap: number;
  merges: number[];
};

/** Shape of a hierarchical clustering tree node. */
type HCNode = {
  isLeaf: boolean;
  dist: number;
  left: unknown;
  right: unknown;
};

/**
 * Type guard for hierarchical clustering tree nodes.
 * @param value - The value to check
 * @returns True if the value is an HCNode
 * @kuralPure
 */
function isHCNode(value: unknown): value is HCNode {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return "isLeaf" in value && "dist" in value && "left" in value && "right" in value;
}

/**
 * Collects merge distances from a hierarchical clustering tree.
 * @param node - The current tree node
 * @param out - Accumulator array for merge distances
 * @returns Array of merge distances
 * @kuralPure
 */
function collectMerges(node: HCNode, out: number[] = []): number[] {
  if (node.isLeaf) {
    return out;
  }
  out.push(node.dist);
  if (isHCNode(node.left)) {
    collectMerges(node.left, out);
  }
  if (isHCNode(node.right)) {
    collectMerges(node.right, out);
  }
  return out;
}

/**
 * Tests if the largest dendrogram gap stands out from other gaps.
 * @param merges - Array of merge distances
 * @param sensitivity - Multiplier controlling how far the largest gap must exceed the median
 * @returns True if the largest gap is statistically significant
 * @kuralPure
 */
function hasSignificantGap(merges: number[], sensitivity: number): boolean {
  const sorted = [...merges].toSorted((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = NONE; i < sorted.length - NEXT; i++) {
    gaps.push(sorted[i + NEXT] - sorted[i]);
  }
  if (gaps.length < MIN_EMBEDDINGS) {
    return false;
  }
  gaps.sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / HALF)];
  const maxGap = gaps[gaps.length - NEXT];
  return medianGap > NONE && maxGap > medianGap * (NEXT + sensitivity);
}

/**
 * Builds a hierarchical clustering from embedding vectors, cuts at the
 * largest merge gap, and returns the resulting clusters.
 * @param embeddings - Array of embedding vectors (all same dimension)
 * @returns Clusters, gap size, and sorted merge distances, or null if fewer than 2 embeddings
 * @kuralPure
 */
function buildDendrogram(embeddings: number[][]): DendrogramResult | null {
  if (embeddings.length < MIN_EMBEDDINGS) {
    return null;
  }
  try {
    const matrix = Matrix.from(embeddings);
    const distMat = distance_matrix(matrix, cosine);
    const hc = new HierarchicalClustering(distMat, {
      linkage: "average",
      metric: "precomputed",
    });

    const root: unknown = hc.root;
    const merges = (isHCNode(root) ? collectMerges(root) : []).toSorted((a, b) => a - b);
    if (merges.length < MIN_EMBEDDINGS) {
      return { clusters: hc.get_clusters(Infinity, "distance"), gap: NONE, merges };
    }

    let maxGap = NONE;
    let cutIdx = NONE;
    for (let i = NONE; i < merges.length - NEXT; i++) {
      const gap = merges[i + NEXT] - merges[i];
      if (gap > maxGap) {
        maxGap = gap;
        cutIdx = i;
      }
    }

    const cutDist = merges[cutIdx] + maxGap / HALF;
    const clusters = hc.get_clusters(cutDist, "distance");
    return { clusters, gap: maxGap, merges };
  } catch {
    return null;
  }
}

export { buildDendrogram, collectMerges, hasSignificantGap, isHCNode };
export type { DendrogramResult, HCNode };
