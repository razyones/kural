/**
 * Detects identity-metadata gaps across the node tree — descriptions,
 * @param coverage, @returns, purity annotation, or directory KURAL.md
 * fields the parser found absent. The only audit whose detector applies
 * a deterministic field-presence check rather than a statistical fence.
 * @kuralResidual outliers [84b4d079]
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import { defineAudit } from "../types.ts";
import { isSuppressed } from "../context.ts";

const NONE = 0;

/**
 * Renders the checklist of missing documentation items — description, params, returns, or purity annotation — for a code unit.
 * @param ctx - The formatting context with finding and display data
 * @returns A list item with heading and missing-doc details
 * @kuralPatterns formatAudit
 * @kuralPure
 */
function formatIncompleteDocs({ finding, prefix, label, location }: FormatCtx): ListItem {
  return {
    heading: `${prefix} ${label}${location}`,
    details: [`Missing: ${finding.missing?.join(", ")}`],
  };
}

/**
 * Collects the list of missing identity fields for a single node — empty
 * description, undocumented params, missing returns, absent purity tag,
 * or missing KURAL.md.
 * @param node - The code tree node to inspect
 * @returns Names of the metadata fields the node is missing
 * @kuralPure
 */
function collectMissingFields(node: import("../../tree/tree.ts").CodeNode): string[] {
  const missing: string[] = [];
  if (node.kind === "function") {
    if (node.description === undefined || node.description.trim().length === NONE) {
      missing.push("description");
    }
    if (node.paramNames.length > NONE && node.documentedParams < node.paramNames.length) {
      const undoc = node.paramNames.length - node.documentedParams;
      missing.push(`${undoc}/${node.paramNames.length} @param`);
    }
    if (node.returnsType !== "void" && node.returnsType.length > NONE && !node.hasReturnDoc) {
      missing.push("@returns");
    }
    if (!node.pure && node.causes === undefined) {
      missing.push("@kuralPure or @kuralCauses");
    }
  } else if (node.kind === "type" || node.kind === "file") {
    if (node.description === undefined || node.description.trim().length === NONE) {
      missing.push("description");
    }
  } else if (
    node.kind === "directory" &&
    (node.description === undefined || node.description.trim().length === NONE)
  ) {
    missing.push("description (KURAL.md)");
  }
  return missing;
}

/**
 * Walks every node in the tree and flags those with one or more missing
 * identity-metadata fields, surfacing each gap as a finding.
 * @param ctx - The shared audit context with node map and configuration
 * @returns Findings for nodes with incomplete identity metadata
 * @kuralPure
 */
function detectIncompleteDocs(ctx: AuditContext): Finding[] {
  const { nodes } = ctx;
  const findings: Finding[] = [];
  for (const [, node] of nodes) {
    const missing = collectMissingFields(node);
    if (missing.length > NONE && !isSuppressed(node, "incomplete-docs")) {
      findings.push({
        audit: "incomplete-docs",
        key: node.key,
        name: node.name,
        hash: node.hash,
        missing,
      });
    }
  }
  return findings;
}

export default defineAudit({
  name: "incomplete-docs",
  title: "Incomplete Documentation",
  format: formatIncompleteDocs,
  detect: detectIncompleteDocs,
});
