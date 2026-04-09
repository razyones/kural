/**
 * Detects parents where one child's dominance gap is an upper outlier —
 * the parent is essentially a wrapper around a single child.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import { num, str } from "../../../utils/record.ts";
import { robustLowerFence, upperFence } from "../fence.ts";
import type { CodeNode } from "../../tree/tree.ts";
import { cosineSimilarity } from "../../../utils/vectors.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../../utils/format.ts";
import { getChildrenWithKeys } from "../children.ts";
import { isLeaf } from "../../tree/tree.ts";
import { isSuppressed } from "../context.ts";
import { isTypeProducerPair } from "../siblings.ts";

const NONE = 0;
const NEXT = 1;
const HALF = 2;

/**
 * Renders the dominance gap showing which child overwhelms its parent's identity.
 * @param ctx - The formatting context with finding and display data
 * @returns The formatted list item
 * @kuralPatterns formatAudit
 * @kuralPure
 */
function formatContainment({ finding, prefix, label }: FormatCtx): ListItem {
  const dominantName = str(finding.details, "dominantName");
  const dominantSim = num(finding.details, "dominantSim");
  const secondSim = num(finding.details, "secondSim");
  const childCount = num(finding.details, "childCount");
  return {
    heading: `${prefix} ${label} is dominated by "${dominantName}"`,
    details: [
      `Dominant: ${fmtPct(dominantSim)}, next: ${fmtPct(secondSim)} (${childCount} children)`,
    ],
  };
}

/** A parent-child dominance measurement for containment detection. */
type DominanceEntry = {
  parentKey: string;
  dominantKey: string;
  dominantName: string;
  dominantSim: number;
  secondSim: number;
  gap: number;
  childCount: number;
};

/**
 * Measures how much each parent's identity is dominated by a single child versus evenly distributed across all children.
 * @param nodes - The code tree node map
 * @returns Dominance entries for each parent with enough valid children
 * @kuralPure
 */
function collectDominanceGaps(nodes: Map<string, CodeNode>): DominanceEntry[] {
  const entries: DominanceEntry[] = [];
  for (const [key, node] of nodes) {
    if (isLeaf(node) || node.util) {
      continue;
    }
    if (node.leaf.length === NONE) {
      continue;
    }
    const cwk = getChildrenWithKeys(node, nodes).filter(({ node: c }) => !c.util && !c.helper);
    const valid = cwk.filter(({ node: c }) => c.leaf.length > NONE);
    if (valid.length < HALF) {
      continue;
    }
    const childSims: { key: string; name: string; similarity: number; node: CodeNode }[] = valid
      .map(({ key: childKey, node: c }) => ({
        key: childKey,
        name: c.name,
        similarity: cosineSimilarity(node.leaf, c.leaf),
        node: c,
      }))
      .toSorted((a, b) => b.similarity - a.similarity);
    const dominantEntry = childSims[NONE];
    const independent = childSims.filter(
      (c) => c.node === dominantEntry.node || !isTypeProducerPair(c.node, dominantEntry.node),
    );
    if (independent.length < HALF) {
      continue;
    }
    const gap = independent[NONE].similarity - independent[NEXT].similarity;
    entries.push({
      parentKey: key,
      dominantKey: independent[NONE].key,
      dominantName: independent[NONE].name,
      dominantSim: independent[NONE].similarity,
      secondSim: independent[NEXT].similarity,
      gap,
      childCount: independent.length,
    });
  }
  return entries;
}

export default defineAudit({
  name: "containments",
  title: "Containments",
  format: formatContainment,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes, sensitivity } = ctx;
    const entries = collectDominanceGaps(nodes);
    const gaps = entries.map((e) => e.gap);
    const fence = upperFence(gaps, sensitivity);

    const dominantSims = entries.map((e) => e.dominantSim);
    const computedFloor = robustLowerFence(dominantSims, sensitivity);
    const containmentFloor = Number.isFinite(computedFloor) ? computedFloor : NONE;

    const findings: Finding[] = [];
    for (const e of entries) {
      const parent = nodes.get(e.parentKey);
      if (!parent) {
        continue;
      }
      const dominantChild = nodes.get(e.dominantKey);
      if (
        e.gap > fence &&
        e.dominantSim > containmentFloor &&
        !isSuppressed(parent, "containments") &&
        dominantChild?.bound !== "outward"
      ) {
        findings.push({
          audit: "containments",
          key: e.parentKey,
          name: parent.name,
          hash: parent.hash,
          value: e.gap,
          details: {
            dominantName: e.dominantName,
            dominantSim: e.dominantSim,
            secondSim: e.secondSim,
            childCount: e.childCount,
            fence,
          },
        });
      }
    }

    findings.sort((a, b) => (b.value ?? NONE) - (a.value ?? NONE));
    return findings;
  },
});
