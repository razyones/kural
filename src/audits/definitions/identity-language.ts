/**
 * Detects directories whose KURAL.md description leans toward "is"
 * instead of "does" — identity-focused rather than behavior-focused.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import type { CodeNode } from "../../sost/tree.ts";
import { defineAudit } from "../types.ts";
import { fmt } from "../../utils/format.ts";
import { isSuppressed } from "../context.ts";
import { robustLowerFence } from "../fence.ts";

const NONE = 0;
const HALF = 2;

/**
 * Renders the is-does axis score showing linguistic misalignment in a directory's description.
 * @param ctx - The formatting context with finding and display data
 * @returns The formatted list item
 * @kuralPatterns formatAudit
 * @kuralPure
 */
function formatIdentityLanguage({ finding, prefix, label }: FormatCtx): ListItem {
  return {
    heading: `${prefix} ${label} description leans toward "is" instead of "does"`,
    details: [`Axis score: ${fmt(finding.value ?? NONE)} (fence: ${fmt(finding.fence ?? NONE)})`],
  };
}

export default defineAudit({
  name: "identity-language",
  title: "Identity Language",
  format: formatIdentityLanguage,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes, sensitivity, axisScores, rootKey } = ctx;
    if (!axisScores) {
      return [];
    }
    const allDirs = [...nodes.entries()].filter(
      ([, n]) => n.kind === "directory" && n.identity.length > NONE,
    );

    /** An axis score entry for a directory node. */
    type Entry = { key: string; node: CodeNode; score: number };
    const entries: Entry[] = [];
    for (const [key, node] of allDirs) {
      if (key === rootKey) {
        continue;
      }
      const score = axisScores[node.key];
      if (score === undefined) {
        continue;
      }
      entries.push({ key, node, score });
    }

    const scores = entries.map((e) => e.score);
    const findings: Finding[] = [];

    for (const entry of entries) {
      const others = scores.filter((_, i) => entries[i] !== entry);
      if (others.length < HALF) {
        continue;
      }
      const fence = robustLowerFence(others, sensitivity);
      if (entry.score < fence && !isSuppressed(entry.node, "identity-language")) {
        findings.push({
          audit: "identity-language",
          key: entry.key,
          name: entry.node.name,
          hash: entry.node.hash,
          value: entry.score,
          fence,
        });
      }
    }

    findings.sort((a, b) => (a.value ?? NONE) - (b.value ?? NONE));
    return findings;
  },
});
