/**
 * Detects cross-parent pairs that exceed the sibling merge fence —
 * duplicated code across module boundaries.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import type { CodeNode } from "../../sost/tree.ts";
import { cosineSimilarity } from "../../utils/vectors.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../utils/format.ts";
import { isCallerCallee } from "../helpers.ts";
import { isLeaf } from "../../sost/tree.ts";
import { isSuppressed } from "../context.ts";

const NONE = 0;
const NEXT = 1;

/** Shared formatter for both duplicates and duplicate-utils audits. */
function formatDuplicate({ finding, label, labelNode }: FormatCtx): ListItem {
  const pairLabel =
    finding.pairKey === undefined ? (finding.pairName ?? "") : `"${labelNode(finding.pairKey)}"`;
  return {
    heading: `${label} and ${pairLabel} are cross-module duplicates`,
    details: [`Similarity: ${fmtPct(finding.value ?? NONE)}`],
  };
}

function scanLeafCrossFile(
  entries: [string, CodeNode][],
  nodes: Map<string, CodeNode>,
  fence: number,
): Finding[] {
  const findings: Finding[] = [];
  for (let i = NONE; i < entries.length; i++) {
    for (let j = i + NEXT; j < entries.length; j++) {
      const [, a] = entries[i];
      const [, b] = entries[j];
      if (a.parentKey === b.parentKey) {
        continue;
      }
      if (a.patterns !== null && b.patterns !== null) {
        continue;
      }
      if (isCallerCallee(a, b)) {
        continue;
      }
      const fa = a.parentKey === null ? undefined : nodes.get(a.parentKey);
      const fb = b.parentKey === null ? undefined : nodes.get(b.parentKey);
      if (fa !== undefined && fa.companion !== null && fa.companion === fb?.companion) {
        continue;
      }
      const sim = cosineSimilarity(a.leaf, b.leaf);
      if (sim > fence && !isSuppressed(a, "duplicates") && !isSuppressed(b, "duplicates")) {
        findings.push({
          audit: "duplicates",
          key: a.key,
          name: a.name,
          hash: a.hash,
          pairKey: b.key,
          pairName: b.name,
          value: sim,
        });
      }
    }
  }
  return findings;
}

function scanCrossPopDuplicates(
  nonUtil: [string, CodeNode][],
  util: [string, CodeNode][],
  fence: number,
): Finding[] {
  const findings: Finding[] = [];
  for (let i = NONE; i < nonUtil.length; i++) {
    for (let j = NONE; j < util.length; j++) {
      const [, a] = nonUtil[i];
      const [, b] = util[j];
      if (a.parentKey === b.parentKey) {
        continue;
      }
      if (a.patterns !== null && b.patterns !== null) {
        continue;
      }
      if (isCallerCallee(a, b)) {
        continue;
      }
      const sim = cosineSimilarity(a.leaf, b.leaf);
      if (sim > fence && !isSuppressed(a, "duplicates") && !isSuppressed(b, "duplicates")) {
        findings.push({
          audit: "duplicates",
          key: a.key,
          name: a.name,
          hash: a.hash,
          pairKey: b.key,
          pairName: b.name,
          value: sim,
        });
      }
    }
  }
  return findings;
}

function scanFileCrossDir(entries: [string, CodeNode][], fence: number): Finding[] {
  const findings: Finding[] = [];
  for (let i = NONE; i < entries.length; i++) {
    for (let j = i + NEXT; j < entries.length; j++) {
      const [, a] = entries[i];
      const [, b] = entries[j];
      if (a.parentKey === b.parentKey) {
        continue;
      }
      if (a.companion !== null && a.companion === b.companion) {
        continue;
      }
      if (isCallerCallee(a, b)) {
        continue;
      }
      const sim = cosineSimilarity(a.leaf, b.leaf);
      if (sim > fence) {
        findings.push({
          audit: "duplicates",
          key: a.key,
          name: a.name,
          hash: a.hash,
          pairKey: b.key,
          pairName: b.name,
          value: sim,
        });
      }
    }
  }
  return findings;
}

export { formatDuplicate };

export default defineAudit({
  name: "duplicates",
  title: "Duplicates",
  format: formatDuplicate,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes, leafMergeFence, fileMergeFence } = ctx;
    const leafEntries = [...nodes.entries()].filter(
      ([, n]) => isLeaf(n) && !n.util && !n.helper && n.leaf.length > NONE,
    );
    const utilLeafEntries = [...nodes.entries()].filter(
      ([, n]) => isLeaf(n) && n.util && !n.helper && n.leaf.length > NONE,
    );
    const fileEntries = [...nodes.entries()].filter(
      ([, n]) => n.kind === "file" && !n.util && n.leaf.length > NONE,
    );

    const findings = [
      ...scanLeafCrossFile(leafEntries, nodes, leafMergeFence),
      ...scanCrossPopDuplicates(leafEntries, utilLeafEntries, leafMergeFence),
      ...scanFileCrossDir(fileEntries, fileMergeFence),
    ];

    findings.sort((a, b) => (b.value ?? NONE) - (a.value ?? NONE));
    return findings;
  },
});
