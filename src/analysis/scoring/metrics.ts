/**
 * The measurer. Computes placement metrics from two perspectives — as a
 * child (fit, uniqueness) and as a parent (childrenFit, childrenUniqueness).
 * It is the only module that evaluates a node against its neighborhood —
 * no other module compares identity and leaf vectors.
 */

import type { CodeNode, NodeMap } from "../tree/tree.ts";
import { avg, centroid, cosineSimilarity, subtract } from "../../utils/vectors.ts";
import { getChildren } from "../tree/tree.ts";

const NO_SIBLINGS = 2;
const NONE = 0;
const NEXT = 1;
const MIN_PAIR_COUNT = 2;

/**
 * Computes fit as a child: how well this node's content matches its
 * parent's declared identity. Util containers only get fit when their
 * parent is also util (scored within the util tree).
 * @param node - The node to compute fit for
 * @param nodes - The flat node map for parent lookup
 * @returns cosineSimilarity(parent.identity, N.leaf), or null if no parent
 * @kuralPatterns fitMetric
 * @kuralPure
 */
function computeFit(node: CodeNode, nodes: NodeMap): number | null {
  if (node.parentKey === null) {
    return null;
  }
  const parent = nodes.get(node.parentKey);
  if (parent === undefined) {
    return null;
  }
  if (node.util && !parent.util && (node.kind === "file" || node.kind === "directory")) {
    return null;
  }
  if (parent.identity.length === NONE || node.leaf.length === NONE) {
    return NEXT;
  }
  if (node.bound === "inward") {
    // Representativeness: how well does this node represent its siblings?
    const siblings = getChildren(parent, nodes).filter(
      (c) => c.key !== node.key && !c.util && c.bound !== "inward" && c.identity.length > NONE,
    );
    if (siblings.length === NONE) {
      return NEXT;
    }
    const siblingIdentities = siblings.map((s) => s.identity);
    const sibCentroid = centroid(siblingIdentities);
    return cosineSimilarity(sibCentroid, node.identity);
  }
  return cosineSimilarity(parent.identity, node.leaf);
}

/**
 * Computes childrenFit as a parent: how well this container's content
 * matches its own declared identity. Applicable to all containers
 * including util — every container tree has meaningful self-alignment.
 * @param node - The node to compute children fit for
 * @returns cosineSimilarity(N.identity, N.leaf), or null for leaves
 * @kuralPatterns fitMetric
 * @kuralPure
 */
function computeChildrenFit(node: CodeNode): number | null {
  if (node.kind === "type" || node.kind === "function") {
    return null;
  }
  if (node.identity.length === NONE || node.leaf.length === NONE) {
    return NEXT;
  }
  return cosineSimilarity(node.identity, node.leaf);
}

/**
 * Computes per-node uniqueness: mean cosine distance from this node to
 * all siblings, after subtracting parent identity. Pattern groups are
 * already materialised as tree nodes, so no deduplication is needed.
 * @param parent - The parent node
 * @param children - All eligible children of the parent
 * @returns Map from child key to uniqueness score
 * @kuralPatterns uniquenessMetric
 * @kuralPure
 */
function computeUniqueness(parent: CodeNode, children: CodeNode[]): Map<string, number> {
  const result = new Map<string, number>();
  const valid = children.filter((c) => c.identity.length > NONE);

  if (valid.length < MIN_PAIR_COUNT) {
    for (const child of children) {
      result.set(child.key, NO_SIBLINGS);
    }
    return result;
  }

  const deltas = valid.map((c) => subtract(c.identity, parent.identity));

  for (let i = NONE; i < valid.length; i++) {
    const distances: number[] = [];
    for (let j = NONE; j < deltas.length; j++) {
      if (i !== j) {
        distances.push(NEXT - cosineSimilarity(deltas[i], deltas[j]));
      }
    }
    result.set(valid[i].key, distances.length > NONE ? avg(distances) : NO_SIBLINGS);
  }

  for (const child of children) {
    if (!result.has(child.key)) {
      result.set(child.key, NO_SIBLINGS);
    }
  }

  return result;
}

/**
 * Computes childrenUniqueness (CV) for a parent's children.
 * Measures spread quality — how evenly distributed children are.
 * Pattern groups are already materialised as tree nodes, so no
 * deduplication is needed.
 * @param parent - The parent node
 * @param children - All eligible children of the parent
 * @returns CV score and the closest child pair names
 * @kuralPatterns uniquenessMetric
 * @kuralPure
 */
function computeChildrenUniqueness(
  parent: CodeNode,
  children: CodeNode[],
): { score: number; worstPair: [string, string] | null } {
  const valid = children.filter((c) => c.identity.length > NONE);

  if (valid.length < MIN_PAIR_COUNT) {
    return { score: NO_SIBLINGS, worstPair: null };
  }

  const deltas = valid.map((c) => subtract(c.identity, parent.identity));
  const distances: number[] = [];
  let minDistance = Infinity;
  let worstPair: [string, string] | null = null;

  for (let i = NONE; i < deltas.length; i++) {
    for (let j = i + NEXT; j < deltas.length; j++) {
      const distance = NEXT - cosineSimilarity(deltas[i], deltas[j]);
      distances.push(distance);
      if (distance < minDistance) {
        minDistance = distance;
        worstPair = [valid[i].name, valid[j].name];
      }
    }
  }

  if (distances.length === NONE) {
    return { score: NO_SIBLINGS, worstPair: null };
  }

  const meanDist = avg(distances);
  if (meanDist === NONE) {
    return { score: NONE, worstPair };
  }

  const sumSq = distances.reduce((sum, d) => sum + (d - meanDist) * (d - meanDist), NONE);
  const besselCorrection = NEXT;
  const stddev =
    distances.length > NEXT ? Math.sqrt(sumSq / (distances.length - besselCorrection)) : NONE;
  const cv = stddev / meanDist;
  return { score: NEXT / (NEXT + cv), worstPair };
}

/**
 * Finds the best-fitting uncle for a node.
 * @param node - The node to find the best uncle for
 * @param nodes - The flat node map for parent and grandparent lookups
 * @returns The best uncle's name and fit score, or null if none found
 * @kuralPure
 */
function findBestUncle(node: CodeNode, nodes: NodeMap): { name: string; score: number } | null {
  if (node.parentKey === null) {
    return null;
  }
  const parent = nodes.get(node.parentKey);
  if (parent === undefined || parent.parentKey === null) {
    return null;
  }
  const grandparent = nodes.get(parent.parentKey);
  if (grandparent === undefined) {
    return null;
  }

  const uncles = getChildren(grandparent, nodes).filter((c) => c.key !== parent.key);
  const companionKeys =
    parent.companion === null
      ? new Set<string>()
      : new Set(uncles.filter((u) => u.companion === parent.companion).map((u) => u.key));

  let bestName: string | null = null;
  let bestScore = -Infinity;

  for (const uncle of uncles) {
    if (companionKeys.has(uncle.key)) {
      continue;
    }
    if (uncle.identity.length === NONE || node.leaf.length === NONE) {
      continue;
    }
    const fit = cosineSimilarity(uncle.identity, node.leaf);
    if (fit > bestScore) {
      bestScore = fit;
      bestName = uncle.name;
    }
  }

  if (bestName === null) {
    return null;
  }
  return { name: bestName, score: bestScore };
}

export {
  NO_SIBLINGS,
  computeChildrenFit,
  computeChildrenUniqueness,
  computeFit,
  computeUniqueness,
  findBestUncle,
};
