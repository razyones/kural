/**
 * Detects nodes that fit better under a different parent — uncle-fit
 * exceeds parent-fit by a statistically significant delta.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import { getChildren, isLeaf } from "../../sost/tree.ts";
import type { CodeNode } from "../../sost/tree.ts";
import { cosineSimilarity } from "../../utils/vectors.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../utils/format.ts";
import { isSuppressed } from "../context.ts";
import { num } from "../../utils/record.ts";
import { upperFence } from "../fence.ts";

const NONE = 0;
const MISPLACED_HALVE = 2;

/**
 * Renders the uncle-fit comparison showing where a node would be better placed in the tree.
 * @param ctx - The formatting context with finding and display data
 * @returns The formatted list item
 * @kuralPatterns formatAudit
 * @kuralPure
 */
function formatMisplaced({ finding, prefix, label, labelNode }: FormatCtx): ListItem {
  const uncleFit = num(finding.details, "uncleFit");
  const uncle = finding.pairKey === undefined ? "unknown" : labelNode(finding.pairKey);
  return {
    heading: `${prefix} ${label} fits a sibling module better`,
    details: [
      `More relevant to sibling "${uncle}" (${fmtPct(uncleFit)}) than its own module (${fmtPct(finding.value ?? NONE)})`,
    ],
  };
}

/** Raw misplacement measurement before fence filtering. */
type MisplacedRaw = {
  nodeKey: string;
  parentKey: string;
  parentFit: number;
  uncleKey: string;
  uncleFit: number;
  delta: number;
};

/**
 * Walks the ancestor chain testing uncle directories and measures how much better each node would fit elsewhere.
 * @param nodes - The code tree node map
 * @returns Raw misplacement measurements for nodes with higher uncle-fit than parent-fit
 * @kuralPure
 */
function collectMisplacedCandidates(nodes: Map<string, CodeNode>): MisplacedRaw[] {
  const raw: MisplacedRaw[] = [];
  for (const [key, node] of nodes) {
    if (isLeaf(node) || node.util || node.parentKey === null) {
      continue;
    }
    const parent = nodes.get(node.parentKey);
    if (!parent || parent.parentKey === null) {
      continue;
    }
    const parentFit = cosineSimilarity(parent.identity, node.leaf);
    const parentCompanion = parent.companion ?? null;
    let ancestor: CodeNode | undefined = parent;
    while (ancestor !== undefined && ancestor.parentKey !== null) {
      const above = nodes.get(ancestor.parentKey);
      if (!above) {
        break;
      }
      const ancestorKey = ancestor.key;
      const candidates = getChildren(above, nodes).filter(
        (s) => s.kind === "directory" && s.key !== ancestorKey,
      );
      for (const uncle of candidates) {
        if (parentCompanion !== null && (uncle.companion ?? null) === parentCompanion) {
          continue;
        }
        const uncleFit = cosineSimilarity(uncle.identity, node.leaf);
        if (uncleFit > parentFit) {
          raw.push({
            nodeKey: key,
            parentKey: parent.key,
            parentFit,
            uncleKey: uncle.key,
            uncleFit,
            delta: uncleFit - parentFit,
          });
        }
      }
      ancestor = above;
    }
  }
  return raw;
}

export default defineAudit({
  name: "misplaced",
  title: "Misplaced Items",
  format: formatMisplaced,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes, sensitivity, outlierKeys } = ctx;
    const raw = collectMisplacedCandidates(nodes);
    const deltas = raw.map((m) => m.delta);
    const fence = upperFence(deltas, sensitivity);
    const findings: Finding[] = [];

    for (const m of raw) {
      const node = nodes.get(m.nodeKey);
      if (!node) {
        continue;
      }
      const effectiveFence = outlierKeys.has(m.nodeKey) ? fence / MISPLACED_HALVE : fence;
      if (m.delta >= effectiveFence && !isSuppressed(node, "misplaced")) {
        findings.push({
          audit: "misplaced",
          key: m.nodeKey,
          name: node.name,
          hash: node.hash,
          parentKey: m.parentKey,
          pairKey: m.uncleKey,
          value: m.parentFit,
          delta: m.delta,
          details: { uncleFit: m.uncleFit, fence },
        });
      }
    }

    findings.sort((a, b) => (b.delta ?? NONE) - (a.delta ?? NONE));
    return findings;
  },
});
