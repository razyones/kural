/**
 * Detects nodes whose identity-content similarity is a lower outlier —
 * their name/description diverges from what they actually contain.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import { getChildren, isLeaf } from "../../sost/tree.ts";
import { cosineSimilarity } from "../../utils/vectors.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../utils/format.ts";
import { isSuppressed } from "../context.ts";
import { lowerFence } from "../fence.ts";
import { num } from "../../utils/record.ts";

const NONE = 0;
const INCOHERENT_CAP = 0.9;

function formatIncoherent({ finding, prefix, label }: FormatCtx): ListItem {
  const childCount = num(finding.details, "childCount");
  return {
    heading: `${prefix} ${label} has weak naming`,
    details: [
      `Identity-content similarity: ${fmtPct(finding.value ?? NONE)} (${childCount} children)`,
    ],
  };
}

function collectLabelFits(
  nodes: Map<string, import("../../sost/tree.ts").CodeNode>,
  utilMode: boolean,
): { key: string; labelFit: number; childCount: number }[] {
  const entries: { key: string; labelFit: number; childCount: number }[] = [];
  for (const [key, node] of nodes) {
    if (isLeaf(node)) {
      continue;
    }
    if (utilMode ? !node.util : node.util) {
      continue;
    }
    if (node.identity.length === NONE || node.leaf.length === NONE) {
      continue;
    }
    const children = getChildren(node, nodes);
    if (children.length === NONE) {
      continue;
    }
    entries.push({
      key,
      labelFit: cosineSimilarity(node.identity, node.leaf),
      childCount: children.length,
    });
  }
  return entries;
}

function detectIncoherent(ctx: AuditContext, utilMode: boolean): Finding[] {
  const { nodes, sensitivity } = ctx;
  const entries = collectLabelFits(nodes, utilMode);
  const fits = entries.map((e) => e.labelFit);
  const fence = Math.min(lowerFence(fits, sensitivity), INCOHERENT_CAP);
  const auditName = utilMode ? "incoherent-utils" : "incoherent";

  const findings: Finding[] = [];
  for (const e of entries) {
    const node = nodes.get(e.key);
    if (!node) {
      continue;
    }
    if (e.labelFit < fence && !isSuppressed(node, auditName)) {
      findings.push({
        audit: auditName,
        key: e.key,
        name: node.name,
        hash: node.hash,
        value: e.labelFit,
        fence,
        details: { childCount: e.childCount },
      });
    }
  }

  findings.sort((a, b) => (a.value ?? NONE) - (b.value ?? NONE));
  return findings;
}

export const incoherent = defineAudit({
  name: "incoherent",
  title: "Incoherent Units",
  format: formatIncoherent,
  detect: (ctx) => detectIncoherent(ctx, false),
});

export const incoherentUtils = defineAudit({
  name: "incoherent-utils",
  title: "Incoherent Utils",
  format: formatIncoherent,
  detect: (ctx) => detectIncoherent(ctx, true),
});
