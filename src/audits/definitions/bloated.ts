/**
 * Detects bloated directories and files via dendrogram gap analysis.
 * A bloated container has children that cluster into distinct groups —
 * suggesting a natural split point for reorganization.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import { buildDendrogram, hasSignificantGap } from "../cluster.ts";
import type { CodeNode } from "../../sost/tree.ts";
import { defineAudit } from "../types.ts";
import { getChildrenWithKeys } from "../children.ts";
import { isSuppressed } from "../context.ts";
import { num } from "../../utils/record.ts";

const NONE = 0;
const NEXT = 1;
const MIN_SUBSTANTIAL_CLUSTERS = 2;

/**
 * Renders cluster composition details showing which children should split into separate containers.
 * @param ctx - The formatting context with finding and display data
 * @returns The formatted list item
 * @kuralPatterns formatAudit
 * @kuralPure
 */
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

/**
 * Distinguishes trivial type-vs-function splits from meaningful semantic clusters worth reporting.
 * @param clusters - The cluster index groups from dendrogram analysis
 * @param valid - The valid child nodes with their code nodes
 * @returns True if only one cluster contains non-type nodes
 * @kuralPure
 */
function isTypeOnlySplit(clusters: number[][], valid: { node: CodeNode }[]): boolean {
  const nonTypeClusters = clusters.filter(
    (cluster) => !cluster.every((idx) => valid[idx].node.kind === "type"),
  );
  return nonTypeClusters.length <= NEXT;
}

/**
 * Discovers containers whose children form distinct semantic clusters that would be better split into separate siblings.
 * @param ctx - The shared audit context with node map and configuration
 * @param kind - Whether to scan directories or files
 * @param auditName - The audit name used for suppression checks
 * @returns Findings for containers whose children cluster into distinct groups
 * @kuralPure
 */
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
    const cwk = getChildrenWithKeys(node, nodes).filter(({ node: c }) => !c.util && !c.helper);
    const valid = cwk.filter(({ node: c }) => c.leaf.length > NONE);
    if (valid.length < minGroup) {
      continue;
    }
    const result = buildDendrogram(valid.map(({ node: c }) => c.leaf));
    if (!result || !hasSignificantGap(result.merges, sensitivity)) {
      continue;
    }
    const substantialClusters = result.clusters.filter((c) => c.length > NEXT);
    if (substantialClusters.length < MIN_SUBSTANTIAL_CLUSTERS) {
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
