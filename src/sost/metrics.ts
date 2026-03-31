/**
 * The measurer. Computes placement metrics from two perspectives — as a
 * child (fit, uniqueness) and as a parent (childrenFit, childrenUniqueness).
 * It is the only module that evaluates a node against its neighborhood —
 * no other module compares identity and leaf vectors.
 */

import type { CodeNode, NodeMap } from "./tree.ts";
import { avg, centroid, cosineSimilarity, subtract } from "../utils/vectors.ts";
import { getChildren } from "./tree.ts";

const NO_SIBLINGS = 2;
const NONE = 0;
const NEXT = 1;
const MIN_PAIR_COUNT = 2;

/**
 * Computes fit as a child: how well this node's content matches its
 * parent's declared identity.
 * @param node - The node to compute fit for
 * @param nodes - The flat node map for parent lookup
 * @returns cosineSimilarity(parent.identity, N.leaf), or null if no parent or util container
 * @kuralPure
 */
function computeFit(node: CodeNode, nodes: NodeMap): number | null {
  if (node.util && (node.kind === "file" || node.kind === "directory")) {
    return null;
  }
  if (node.parentKey === null) {
    return null;
  }
  const parent = nodes.get(node.parentKey);
  if (parent === undefined) {
    return null;
  }
  if (parent.identity.length === NONE || node.leaf.length === NONE) {
    return NEXT;
  }
  return cosineSimilarity(parent.identity, node.leaf);
}

/**
 * Computes childrenFit as a parent: how well this container's content
 * matches its own declared identity.
 * @param node - The node to compute children fit for
 * @returns cosineSimilarity(N.identity, N.leaf), or null for leaves/util containers
 * @kuralPure
 */
function computeChildrenFit(node: CodeNode): number | null {
  if (node.kind === "type" || node.kind === "function") {
    return null;
  }
  if (node.util) {
    return null;
  }
  if (node.identity.length === NONE || node.leaf.length === NONE) {
    return NEXT;
  }
  return cosineSimilarity(node.identity, node.leaf);
}

/** Lightweight projection for uniqueness computation. */
type IdentityRef = { name: string; identity: number[] };

/**
 * Deduplicates children by pattern or companion group, replacing groups
 * with their identity centroid.
 * @param children - Array of child nodes to deduplicate
 * @returns Array of identity references with groups collapsed to centroids
 * @kuralPure
 */
function deduplicateByGroup(children: CodeNode[]): IdentityRef[] {
  const groups = new Map<string, CodeNode[]>();
  const ungrouped: IdentityRef[] = [];

  for (const child of children) {
    const groupId = child.patterns ?? child.companion;
    if (groupId === null) {
      ungrouped.push({ name: child.name, identity: child.identity });
    } else {
      const group = groups.get(groupId);
      if (group) {
        group.push(child);
      } else {
        groups.set(groupId, [child]);
      }
    }
  }

  const reps: IdentityRef[] = [...ungrouped];
  for (const group of groups.values()) {
    const identities = group.map((n) => n.identity).filter((v) => v.length > NONE);
    reps.push({
      name: group[NONE].name,
      identity: identities.length > NONE ? centroid(identities) : group[NONE].identity,
    });
  }

  return reps;
}

/**
 * Computes per-node uniqueness: mean cosine distance from this node to
 * all siblings, after subtracting parent identity.
 * @param parent - The parent node
 * @param children - All eligible children of the parent
 * @returns Map from child key to uniqueness score
 * @kuralPure
 */
function computeUniqueness(parent: CodeNode, children: CodeNode[]): Map<string, number> {
  const result = new Map<string, number>();
  const reps = deduplicateByGroup(children);
  const validReps = reps.filter((r) => r.identity.length > NONE);

  if (validReps.length < MIN_PAIR_COUNT) {
    for (const child of children) {
      result.set(child.key, NO_SIBLINGS);
    }
    return result;
  }

  const deltas = validReps.map((r) => subtract(r.identity, parent.identity));

  for (let i = NONE; i < validReps.length; i++) {
    const distances: number[] = [];
    for (let j = NONE; j < deltas.length; j++) {
      if (i !== j) {
        distances.push(NEXT - cosineSimilarity(deltas[i], deltas[j]));
      }
    }
    const child = children.find((c) => c.name === validReps[i].name);
    if (child) {
      result.set(child.key, distances.length > NONE ? avg(distances) : NO_SIBLINGS);
    }
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
 * @param parent - The parent node
 * @param children - All eligible children of the parent
 * @returns CV score and the closest child pair names
 * @kuralPure
 */
function computeChildrenUniqueness(
  parent: CodeNode,
  children: CodeNode[],
): { score: number; worstPair: [string, string] | null } {
  const reps = deduplicateByGroup(children);
  const validReps = reps.filter((r) => r.identity.length > NONE);

  if (validReps.length < MIN_PAIR_COUNT) {
    return { score: NO_SIBLINGS, worstPair: null };
  }

  const deltas = validReps.map((r) => subtract(r.identity, parent.identity));
  const distances: number[] = [];
  let minDistance = Infinity;
  let worstPair: [string, string] | null = null;

  for (let i = NONE; i < deltas.length; i++) {
    for (let j = i + NEXT; j < deltas.length; j++) {
      const distance = NEXT - cosineSimilarity(deltas[i], deltas[j]);
      distances.push(distance);
      if (distance < minDistance) {
        minDistance = distance;
        worstPair = [validReps[i].name, validReps[j].name];
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
