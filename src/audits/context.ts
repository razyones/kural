/**
 * The stage. Provides shared, lazily-computed data to all audits via a
 * single context object. It is the only module that owns cross-audit
 * state — no other module caches sibling pairs or merge fences.
 */

import type { AuditContext, SiblingPair } from "./types.ts";
import type { CodeNode, NodeMap } from "../sost/tree.ts";
import type { AuditsConfig } from "../config/audits.ts";
import { collectSiblingPairs } from "./siblings.ts";
import { findRootNode } from "./types.ts";
import { upperFence } from "./fence.ts";

/** Sibling-pair similarities partitioned by level. */
type PartitionedSims = { leaf: number[]; file: number[] };

/**
 * Partitions sibling-pair similarities into leaf-level and file-level buckets.
 * @param pairs - All sibling pairs to partition
 * @returns Object with leaf and file similarity arrays
 * @kuralPure
 */
function partitionSims(pairs: SiblingPair[]): PartitionedSims {
  const leaf: number[] = [];
  const file: number[] = [];
  for (const p of pairs) {
    if (p.level === "leaf") {
      leaf.push(p.similarity);
    } else {
      file.push(p.similarity);
    }
  }
  return { leaf, file };
}

/**
 * Builds the lazily-computed property accessors for the audit context.
 * @param nodes - The code tree
 * @param config - Audit sensitivity and tuning parameters
 * @returns Object with lazy siblingPairs, leafMergeFence, fileMergeFence
 * @kuralPure
 */
function buildLazyAccessors(
  nodes: NodeMap,
  config: AuditsConfig,
): { pairs: () => SiblingPair[]; leafFence: () => number; fileFence: () => number } {
  let cachedPairs: SiblingPair[] | undefined;
  let cachedSims: PartitionedSims | undefined;
  let cachedLeafFence: number | undefined;
  let cachedFileFence: number | undefined;

  function pairs(): SiblingPair[] {
    cachedPairs ??= collectSiblingPairs(nodes);
    return cachedPairs;
  }

  function sims(): PartitionedSims {
    cachedSims ??= partitionSims(pairs());
    return cachedSims;
  }

  function leafFence(): number {
    cachedLeafFence ??= upperFence(sims().leaf, config.sensitivity);
    return cachedLeafFence;
  }

  function fileFence(): number {
    cachedFileFence ??= upperFence(sims().file, config.sensitivity);
    return cachedFileFence;
  }

  return { pairs, leafFence, fileFence };
}

/**
 * Creates an AuditContext with lazy computation of shared data.
 * @param nodes - The code tree
 * @param config - Audit sensitivity and tuning parameters
 * @param axisScores - Pre-computed is-does axis scores (optional)
 * @returns A fully initialized AuditContext
 * @kuralPure
 */
function createContext(
  nodes: NodeMap,
  config: AuditsConfig,
  axisScores: Record<string, number> | null = null,
): AuditContext {
  const lazy = buildLazyAccessors(nodes, config);

  return {
    nodes,
    sensitivity: config.sensitivity,
    containmentFloor: config.containmentFloor,
    minGroup: config.minGroup,
    rootKey: findRootNode(nodes)?.key ?? null,
    axisScores,
    outlierKeys: new Set<string>(),

    get siblingPairs(): SiblingPair[] {
      return lazy.pairs();
    },

    get leafMergeFence(): number {
      return lazy.leafFence();
    },

    get fileMergeFence(): number {
      return lazy.fileFence();
    },
  };
}

/**
 * Checks if a node's residuals suppress a given audit.
 * @param node - The node to check
 * @param auditName - The audit to check suppression for
 * @returns True if the node suppresses the given audit
 * @kuralPure
 */
function isSuppressed(node: CodeNode, auditName: string): boolean {
  for (const r of node.residuals) {
    if (r.audit !== auditName) {
      continue;
    }
    if (r.hash === undefined) {
      return true;
    }
    if (r.hash === node.hash) {
      return true;
    }
  }
  return false;
}

export { createContext, isSuppressed };
