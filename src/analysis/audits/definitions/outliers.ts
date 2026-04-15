/**
 * Surfaces the odd one out. Applies a robust statistical fence to
 * detect children whose affinity to their peer group is anomalously
 * low — flagging nodes that stand apart from an otherwise cohesive set.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import type { CodeNode, NodeMap } from "../../tree/tree.ts";
import { MIN_GROUP, isSuppressed } from "../context.ts";
import { avg, cosineSimilarity } from "../../../utils/vectors.ts";
import { buildLowerFence, median, quartile, robustSpread } from "../fence.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../../utils/format.ts";
import { getChildrenWithKeys } from "../children.ts";
import { isLeaf } from "../../tree/tree.ts";

const NONE = 0;
const NEXT = 1;
const LOWER_QUARTILE = 1;

/**
 * Renders the sibling similarity gap showing how semantically distant a child is from its group.
 * @param ctx - The formatting context with finding and display data
 * @returns The formatted list item
 * @kuralPatterns formatAudit
 * @kuralPure
 */
function formatOutlier({ finding, prefix, label, location }: FormatCtx): ListItem {
  return {
    heading: `${prefix} ${label}${location} has weak relevance`,
    details: [
      `Mean similarity to siblings: ${fmtPct(finding.value ?? NONE)} (group: ${fmtPct(finding.groupValue ?? NONE)})`,
    ],
  };
}

/**
 * Produces the per-child baseline that the outlier fence is computed
 * against — each child's average similarity to all its siblings.
 * @param leaves - Leaf embedding vectors for all children
 * @returns Array of mean similarities, aligned with the input
 * @kuralPure
 * @kuralHelper
 */
function meanSiblingSimPerChild(leaves: number[][]): number[] {
  const n = leaves.length;
  const means: number[] = [];
  for (let i = NONE; i < n; i++) {
    let totalSim = NONE;
    for (let j = NONE; j < n; j++) {
      if (i !== j) {
        totalSim += cosineSimilarity(leaves[i], leaves[j]);
      }
    }
    means.push(totalSim / (n - NEXT));
  }
  return means;
}

/** Per-parent inputs collected before fence computation. */
type ParentBatch = {
  parentKey: string;
  valid: { key: string; node: CodeNode }[];
  perChildMeans: number[];
  localMedian: number;
  localSpread: number;
};

/**
 * Walks every non-leaf parent and collects its child-mean-similarity vector
 * along with its local median and robust spread, skipping groups too small
 * for a meaningful fence.
 * @param nodes - The full node map
 * @returns Per-parent batches ready for fence application
 * @kuralPure
 * @kuralHelper
 */
function collectBatches(nodes: NodeMap): ParentBatch[] {
  const batches: ParentBatch[] = [];
  for (const [parentKey, parentNode] of nodes) {
    if (isLeaf(parentNode) || parentNode.util) {
      continue;
    }
    const cwk = getChildrenWithKeys(parentNode, nodes).filter(
      ({ node: c }) => !c.util && !c.helper && c.bound === null,
    );
    const valid = cwk.filter(({ node: c }) => c.leaf.length > NONE);
    if (valid.length < MIN_GROUP) {
      continue;
    }
    const perChildMeans = meanSiblingSimPerChild(valid.map(({ node: c }) => c.leaf));
    batches.push({
      parentKey,
      valid,
      perChildMeans,
      localMedian: median(perChildMeans),
      localSpread: robustSpread(perChildMeans),
    });
  }
  return batches;
}

/**
 * Computes the minimum-plausible within-group deviation by pooling
 * |value − group_median| across every collected batch and taking Q1.
 * Q1 represents the spread that the tightest-cohesion quartile of
 * sibling groups exhibits — any local spread below this is implausibly
 * tight and reflects an inlier-only MAD. Used to floor per-parent
 * spread without inflating it past what real groups in this codebase
 * demonstrate.
 * @param batches - Per-parent batches with their local medians
 * @returns Q1 of pooled within-group absolute deviations
 * @kuralPure
 * @kuralHelper
 */
function tightGroupDeviationFloor(batches: ParentBatch[]): number {
  const deviations: number[] = [];
  for (const b of batches) {
    for (const v of b.perChildMeans) {
      deviations.push(Math.abs(v - b.localMedian));
    }
  }
  if (deviations.length < MIN_GROUP) {
    return NONE;
  }
  const sorted = [...deviations].toSorted((a, b) => a - b);
  return quartile(sorted, LOWER_QUARTILE);
}

/**
 * Tests one batch against its fence and emits findings for children below it.
 * @param batch - One parent's children and their per-child means
 * @param fence - Effective lower fence for this batch
 * @returns Outlier findings for this parent
 * @kuralPure
 * @kuralHelper
 */
function findingsForBatch(batch: ParentBatch, fence: number): Finding[] {
  const { parentKey, valid, perChildMeans } = batch;
  const groupMean = avg(perChildMeans);
  const out: Finding[] = [];
  for (let i = NONE; i < valid.length; i++) {
    if (perChildMeans[i] < fence && !isSuppressed(valid[i].node, "outliers")) {
      out.push({
        audit: "outliers",
        key: valid[i].key,
        name: valid[i].node.name,
        hash: valid[i].node.hash,
        parentKey,
        value: perChildMeans[i],
        groupValue: groupMean,
      });
    }
  }
  return out;
}

export default defineAudit({
  name: "outliers",
  title: "Outliers",
  format: formatOutlier,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes, sensitivity } = ctx;
    const batches = collectBatches(nodes);
    const spreadFloor = tightGroupDeviationFloor(batches);

    const findings: Finding[] = [];
    for (const batch of batches) {
      const spread = Math.max(batch.localSpread, spreadFloor);
      const fence = buildLowerFence(batch.localMedian, spread, sensitivity);
      findings.push(...findingsForBatch(batch, fence));
    }

    ctx.outlierKeys = new Set(findings.map((f) => f.key));
    findings.sort((a, b) => (a.value ?? NONE) - (b.value ?? NONE));
    return findings;
  },
});
