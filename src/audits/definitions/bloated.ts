/**
 * Detects bloated directories and files via dendrogram gap analysis.
 * A bloated container has children that cluster into distinct groups —
 * suggesting a natural split point for reorganization.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import { buildDendrogram, hasSignificantGap } from "../cluster.ts";
import type { CodeNode } from "../../sost/tree.ts";
import { deduplicateByGroup } from "../groups.ts";
import { defineAudit } from "../types.ts";
import { getChildrenWithKeys } from "../children.ts";
import { isSuppressed } from "../context.ts";
import { num } from "../../utils/record.ts";

const NONE = 0;
const NEXT = 1;

function formatBloated({ finding, prefix, label }: FormatCtx): ListItem {
  const clusterCount = num(finding.details, "clusterCount");
  const details: string[] = [];
  if (finding.clusters) {
    for (let i = NONE; i < finding.clusters.length; i++) {
      details.push(`${i + NEXT}. ${finding.clusters[i].join(", ")}`);
    }
  }
  return { heading: `${prefix} ${label} has split identity (${clusterCount} clusters)`, details };
}

function isTypeOnlySplit(clusters: number[][], valid: { node: CodeNode }[]): boolean {
  const nonTypeClusters = clusters.filter(
    (cluster) => !cluster.every((idx) => valid[idx].node.kind === "type"),
  );
  return nonTypeClusters.length <= NEXT;
}

function detectBloated(
  ctx: AuditContext,
  kind: "directory" | "file",
  auditName: string,
): Finding[] {
  const { nodes, sensitivity, minGroup } = ctx;
  const findings: Finding[] = [];
  const entries = [...nodes.entries()].filter(
    ([, n]) => n.kind === kind && !n.util && !isSuppressed(n, auditName),
  );

  for (const [key, node] of entries) {
    const cwk = getChildrenWithKeys(node, nodes).filter(({ node: c }) => !c.util);
    const { reps } = deduplicateByGroup(cwk);
    const valid = reps.filter(({ node: c }) => c.leaf.length > NONE);
    if (valid.length < minGroup) {
      continue;
    }
    const result = buildDendrogram(valid.map(({ node: c }) => c.leaf));
    if (!result || !hasSignificantGap(result.merges, sensitivity)) {
      continue;
    }
    if (result.clusters.length >= valid.length) {
      continue;
    }
    if (kind === "file" && isTypeOnlySplit(result.clusters, valid)) {
      continue;
    }
    findings.push({
      audit: auditName,
      key,
      name: node.name,
      hash: node.hash,
      value: result.gap,
      clusters: result.clusters.map((c) => c.map((idx) => valid[idx].node.name)),
      details: {
        rawCount: cwk.length,
        effectiveCount: reps.length,
        clusterCount: result.clusters.length,
      },
    });
  }

  return findings;
}

export const bloatedDirectories = defineAudit({
  name: "bloated-directories",
  title: "Bloated Directories",
  detect: (ctx) => detectBloated(ctx, "directory", "bloated-directories"),
  format: formatBloated,
});

export const bloatedFiles = defineAudit({
  name: "bloated-files",
  title: "Bloated Files",
  detect: (ctx) => detectBloated(ctx, "file", "bloated-files"),
  format: formatBloated,
});
