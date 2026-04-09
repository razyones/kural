/**
 * Surfaces the odd one out. Applies a robust statistical fence to
 * detect children whose affinity to their peer group is anomalously
 * low — flagging nodes that stand apart from an otherwise cohesive set.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import { MIN_GROUP, isSuppressed } from "../context.ts";
import { avg, cosineSimilarity } from "../../../utils/vectors.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../../utils/format.ts";
import { getChildrenWithKeys } from "../children.ts";
import { isLeaf } from "../../tree/tree.ts";
import { robustLowerFence } from "../fence.ts";

const NONE = 0;
const NEXT = 1;

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

export default defineAudit({
  name: "outliers",
  title: "Outliers",
  format: formatOutlier,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes, sensitivity } = ctx;
    const findings: Finding[] = [];

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
      const fence = robustLowerFence(perChildMeans, sensitivity);
      const groupMean = avg(perChildMeans);
      for (let i = NONE; i < valid.length; i++) {
        if (perChildMeans[i] < fence && !isSuppressed(valid[i].node, "outliers")) {
          findings.push({
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
    }

    // Populate context for downstream audits (misplaced uses outlierKeys)
    ctx.outlierKeys = new Set(findings.map((f) => f.key));

    findings.sort((a, b) => (a.value ?? NONE) - (b.value ?? NONE));
    return findings;
  },
});
