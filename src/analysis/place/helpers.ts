/**
 * The compass needle. Shared constants and node helpers used across every
 * placement module. It is the only module that defines the placement
 * tuning parameters — no other placement file declares thresholds.
 */

import type { CodeNode, NodeMap } from "../tree/tree.ts";
import { getChildren } from "../tree/tree.ts";

const NONE = 0;
const STRUCT_WEIGHT = 0.75;
const VOCAB_WEIGHT = 0.25;
const SENSITIVITY = 2.0;
const TEMPERATURE = 0.1;
const BRIDGE_THRESHOLD = 0.55;
const SAFETY_GATE = 0.6;
const HARD_ALIEN_RATIO = 0.88;
const TOP_K_RELATED = 10;
const TOP_PATHS = 5;
const DISPLAY_PATHS = 3;
const DECIMAL_PLACES = 4;
const PERCENT_SCALE = 100;
const HALF_BLEND = 0.5;

/** Embedder function type for query and probe embedding. */
type PlacementEmbedder = (texts: string[]) => Promise<number[][]>;

/**
 * Blended vector: 75% structural (leaf) + 25% vocabulary (identity).
 * @param node - The code node to compute the blended vector for.
 * @returns The weighted combination of leaf and identity vectors.
 * @kuralPure
 */
function vecOf(node: CodeNode): number[] {
  if (node.leaf.length === NONE) {
    return node.identity;
  }
  return node.leaf.map((v, d) => v * STRUCT_WEIGHT + (node.identity[d] ?? NONE) * VOCAB_WEIGHT);
}

/**
 * Locates the tree's entry point for placement chain traversal, failing
 * loudly if absent since the chain cannot start without a root.
 * @param tree - The node map to search for the root directory.
 * @returns The key and node of the root directory.
 * @kuralPure
 */
function findRoot(tree: NodeMap): { key: string; node: CodeNode } {
  for (const [key, node] of tree) {
    if (node.kind === "directory" && node.parentKey === null) {
      return { key, node };
    }
  }
  throw new Error("No root directory found in the tree");
}

/**
 * Finds the util root for capability axis routing.
 * @param root - The root directory entry containing its key and node.
 * @param nodes - The node map to search for top-level util directories.
 * @returns The key of the first util directory, or null if none exists.
 * @kuralPure
 */
function findCapabilityRoot(root: { key: string; node: CodeNode }, nodes: NodeMap): string | null {
  const topLevel = getChildren(root.node, nodes);
  const utils = topLevel.filter((c) => c.util && c.kind === "directory");
  return utils.length > NONE ? utils[NONE].key : null;
}

export {
  BRIDGE_THRESHOLD,
  DECIMAL_PLACES,
  DISPLAY_PATHS,
  HALF_BLEND,
  HARD_ALIEN_RATIO,
  NONE,
  PERCENT_SCALE,
  SAFETY_GATE,
  SENSITIVITY,
  TEMPERATURE,
  TOP_K_RELATED,
  TOP_PATHS,
  findCapabilityRoot,
  findRoot,
  vecOf,
};
export type { PlacementEmbedder };
