/**
 * Detects parents where one child's dominance gap is an upper outlier —
 * the parent is essentially a wrapper around a single child.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import { num, str } from "../../utils/record.ts";
import type { CodeNode } from "../../sost/tree.ts";
import { cosineSimilarity } from "../../utils/vectors.ts";
import { deduplicateByGroup } from "../groups.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../utils/format.ts";
import { getChildrenWithKeys } from "../children.ts";
import { isLeaf } from "../../sost/tree.ts";
import { isSuppressed } from "../context.ts";
import { isTypeProducerPair } from "../siblings.ts";
import { upperFence } from "../fence.ts";

const NONE = 0;
const NEXT = 1;
const HALF = 2;

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

type DominanceEntry = {
  parentKey: string;
  dominantName: string;
  dominantSim: number;
  secondSim: number;
  gap: number;
  childCount: number;
};

function collectDominanceGaps(nodes: Map<string, CodeNode>): DominanceEntry[] {
  const entries: DominanceEntry[] = [];
  for (const [key, node] of nodes) {
    if (isLeaf(node) || node.util) {
      continue;
    }
    if (node.leaf.length === NONE) {
      continue;
    }
    const cwk = getChildrenWithKeys(node, nodes);
    const { reps } = deduplicateByGroup(cwk);
    const valid = reps.filter(({ node: c }) => c.leaf.length > NONE);
    if (valid.length < HALF) {
      continue;
    }
    const childSims: { name: string; similarity: number; node: CodeNode }[] = valid
      .map(({ node: c }) => ({
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
    const { nodes, sensitivity, containmentFloor } = ctx;
    const entries = collectDominanceGaps(nodes);
    const gaps = entries.map((e) => e.gap);
    const fence = upperFence(gaps, sensitivity);

    const findings: Finding[] = [];
    for (const e of entries) {
      const parent = nodes.get(e.parentKey);
      if (!parent) {
        continue;
      }
      if (
        e.gap > fence &&
        e.dominantSim > containmentFloor &&
        !isSuppressed(parent, "containments")
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
