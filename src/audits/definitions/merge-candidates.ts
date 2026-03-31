/**
 * Detects sibling pairs whose similarity exceeds the upper fence —
 * near-duplicates that may warrant merging.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../utils/format.ts";
import { isCallerCallee } from "../helpers.ts";
import { isSuppressed } from "../context.ts";

const NONE = 0;

/**
 * Renders the similarity measurement between two siblings that are too close to justify separate existence.
 * @param ctx - The formatting context with finding and display data
 * @returns The formatted list item
 * @kuralPure
 */
function formatMerge({ finding, label, location, labelNode }: FormatCtx): ListItem {
  const pairLabel =
    finding.pairKey === undefined ? (finding.pairName ?? "") : `"${labelNode(finding.pairKey)}"`;
  return {
    heading: `${label} and ${pairLabel} are near-duplicates${location}`,
    details: [`Similarity: ${fmtPct(finding.value ?? NONE)}`],
  };
}

export default defineAudit({
  name: "merge-candidates",
  title: "Merge Candidates",
  format: formatMerge,
  detect: (ctx: AuditContext): Finding[] => {
    const { siblingPairs, fileMergeFence, leafMergeFence } = ctx;
    const findings: Finding[] = [];

    for (const p of siblingPairs) {
      const fence = p.level === "file" ? fileMergeFence : leafMergeFence;
      if (
        p.similarity > fence &&
        !isCallerCallee(p.aNode, p.bNode) &&
        !isSuppressed(p.aNode, "merge-candidates") &&
        !isSuppressed(p.bNode, "merge-candidates")
      ) {
        findings.push({
          audit: "merge-candidates",
          key: p.aNode.key,
          name: p.aNode.name,
          hash: p.aNode.hash,
          parentKey: p.parentKey,
          pairKey: p.bNode.key,
          pairName: p.bNode.name,
          value: p.similarity,
        });
      }
    }

    findings.sort((a, b) => (b.value ?? NONE) - (a.value ?? NONE));
    return findings;
  },
});
