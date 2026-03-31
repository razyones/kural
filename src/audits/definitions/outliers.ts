/**
 * Detects children whose mean similarity to siblings falls below a
 * robust lower fence — semantic outliers within their parent group.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import { avg, cosineSimilarity } from "../../utils/vectors.ts";
import { deduplicateByGroup } from "../groups.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../utils/format.ts";
import { getChildrenWithKeys } from "../children.ts";
import { isLeaf } from "../../sost/tree.ts";
import { isSuppressed } from "../context.ts";
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

export default defineAudit({
  name: "outliers",
  title: "Outliers",
  format: formatOutlier,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes, sensitivity, minGroup } = ctx;
    const findings: Finding[] = [];

    for (const [parentKey, parentNode] of nodes) {
      if (isLeaf(parentNode) || parentNode.util) {
        continue;
      }
      const cwk = getChildrenWithKeys(parentNode, nodes).filter(({ node: c }) => !c.util);
      const { reps } = deduplicateByGroup(cwk);
      const valid = reps.filter(({ node: c }) => c.leaf.length > NONE);
      if (valid.length < minGroup) {
        continue;
      }

      const n = valid.length;
      const perChildMeans: number[] = [];
      for (let i = NONE; i < n; i++) {
        let totalSim = NONE;
        for (let j = NONE; j < n; j++) {
          if (i !== j) {
            totalSim += cosineSimilarity(valid[i].node.leaf, valid[j].node.leaf);
          }
        }
        perChildMeans.push(totalSim / (n - NEXT));
      }

      const fence = robustLowerFence(perChildMeans, sensitivity);
      const groupMean = avg(perChildMeans);
      for (let i = NONE; i < n; i++) {
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
