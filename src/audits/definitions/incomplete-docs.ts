/**
 * Detects units missing required documentation — description, parameter
 * docs, return docs, or purity annotations. It surfaces gaps that weaken
 * the embedding signal before they affect scoring accuracy.
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

export default defineAudit({
  name: "incomplete-docs",
  title: "Incomplete Documentation",
  format: formatIncompleteDocs,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes } = ctx;
    const findings: Finding[] = [];

    for (const [, node] of nodes) {
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
      } else if (node.kind === "type") {
        if (node.description === undefined || node.description.trim().length === NONE) {
          missing.push("description");
        }
      } else if (node.kind === "file") {
        if (node.description === undefined || node.description.trim().length === NONE) {
          missing.push("description");
        }
      } else if (
        node.kind === "directory" &&
        (node.description === undefined || node.description.trim().length === NONE)
      ) {
        missing.push("description (KURAL.md)");
      }

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
  },
});
