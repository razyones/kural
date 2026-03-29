/**
 * The measurer. Computes the three core placement metrics — label-fit,
 * label-uniqueness (V2 CV-based), and uncle-fit. It is the only module
 * that evaluates a node against its immediate neighborhood — no other
 * module compares identity and leaf vectors to judge placement quality.
 */

import type { CodeNode, NodeMap } from "./tree.ts";
import { avg, centroid, cosineSimilarity, subtract } from "../utils/vectors.ts";
import { getChildren } from "./tree.ts";

const NO_SIBLINGS = 2;
const NONE = 0;
const NEXT = 1;
const MIN_PAIR_COUNT = 2;

/**
 * Computes label-fit: how well a node's declared identity matches its content.
 * Returns null for capability containers (util nodes).
 * @param node - The node to evaluate
 * @returns Cosine similarity between identity and leaf, or null for util containers
 */
function computeLabelFit(node: CodeNode): number | null {
  if (node.util && (node.kind === "file" || node.kind === "directory")) {
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
 * with their identity centroid. Returns lightweight projections to avoid
 * sharing mutable arrays from the original nodes.
 * @param children - Child nodes to deduplicate
 * @returns Representative projections (one per group, centroids for grouped)
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
 * Computes label-uniqueness using CV (Coefficient of Variation) of pairwise
 * distances after subtracting parent identity.
 *
 * V2 formula: uniqueness = mean == 0 ? 0 : 1 / (1 + cv)
 * where cv = stddev(distances) / mean(distances)
 *
 * @param parent - The parent node whose identity is subtracted
 * @param children - Child nodes to evaluate (pre-filtered for eligibility)
 * @returns Uniqueness score and the least-unique pair names
 */
function computeLabelUniqueness(
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
      const similarity = cosineSimilarity(deltas[i], deltas[j]);
      const distance = NEXT - similarity;
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
  const score = NEXT / (NEXT + cv);

  return { score, worstPair };
}

/**
 * Finds the best-fitting uncle for a node: the uncle where this node's
 * content embedding has the highest similarity to the uncle's identity.
 * @param node - The node to evaluate for misplacement
 * @param nodes - The complete node map
 * @returns Best uncle name and score, or null if no valid uncles
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

export { computeLabelFit, computeLabelUniqueness, findBestUncle, NO_SIBLINGS };
