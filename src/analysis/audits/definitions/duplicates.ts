/**
 * Detects semantically identical units separated by module boundaries —
 * cross-file leaves, cross-directory files, cross-population
 * util-domain straddles, and util-to-util duplicates that exceed the
 * sibling merge fence.
 * @kuralResidual containments [bd40cfa6]
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import type { CodeNode } from "../../tree/tree.ts";
import { cosineSimilarity } from "../../../utils/vectors.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../../utils/format.ts";
import { isCallerCallee } from "../helpers.ts";
import { isLeaf } from "../../tree/tree.ts";
import { isSuppressed } from "../context.ts";

const NONE = 0;
const NEXT = 1;

/**
 * True when both nodes share at least one pattern ID.
 * @param source - The node whose patterns are iterated
 * @param candidate - The node checked for a matching pattern
 * @returns True if the two nodes have at least one overlapping pattern ID
 * @kuralPure
 * @kuralHelper
 */
function sharesPattern(source: CodeNode, candidate: CodeNode): boolean {
  if (source.patterns === null || candidate.patterns === null) {
    return false;
  }
  return source.patterns.some((p) => candidate.patterns?.includes(p) === true);
}

/**
 * True when both nodes live under different pattern groups in the same file.
 * @param a - First node to check
 * @param b - Second node to check
 * @param nodes - The code tree node map for parent lookup
 * @returns True if both parents are pattern nodes sharing the same file parent
 * @kuralPure
 * @kuralHelper
 */
function isSameFileViaPatterns(a: CodeNode, b: CodeNode, nodes: Map<string, CodeNode>): boolean {
  const fa = a.parentKey === null ? undefined : nodes.get(a.parentKey);
  const fb = b.parentKey === null ? undefined : nodes.get(b.parentKey);
  return fa?.kind === "pattern" && fb?.kind === "pattern" && fa.parentKey === fb.parentKey;
}

/**
 * Shared formatter for both duplicates and util-duplicates audits.
 * @param ctx - The formatting context with finding and display data
 * @returns The formatted list item
 * @kuralPatterns formatAudit
 * @kuralPure
 */
function formatDuplicate({ finding, label, labelNode }: FormatCtx): ListItem {
  const pairLabel =
    finding.pairKey === undefined ? (finding.pairName ?? "") : `"${labelNode(finding.pairKey)}"`;
  return {
    heading: `${label} and ${pairLabel} are cross-module duplicates`,
    details: [`Similarity: ${fmtPct(finding.value ?? NONE)}`],
  };
}

/**
 * Finds functions or types in separate files whose embeddings are statistically closer than any same-parent siblings.
 * @param entries - Leaf node entries to compare pairwise
 * @param nodes - The code tree node map
 * @param fence - The similarity threshold above which a pair is flagged
 * @returns Findings for cross-file leaf duplicates
 * @kuralPatterns crossScan
 * @kuralPure
 */
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
      if (sharesPattern(a, b)) {
        continue;
      }
      if (isCallerCallee(a, b)) {
        continue;
      }
      if (isSameFileViaPatterns(a, b, nodes)) {
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

/**
 * Finds structurally similar units that straddle the util-domain boundary, surfacing misclassified utilities.
 * @param nonUtil - Non-util leaf node entries
 * @param util - Util leaf node entries
 * @param nodes - The code tree node map
 * @param fence - The similarity threshold above which a pair is flagged
 * @returns Findings for cross-population duplicates
 * @kuralPatterns crossScan
 * @kuralPure
 */
function scanCrossPopDuplicates(
  nonUtil: [string, CodeNode][],
  util: [string, CodeNode][],
  nodes: Map<string, CodeNode>,
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
      if (sharesPattern(a, b)) {
        continue;
      }
      if (isCallerCallee(a, b)) {
        continue;
      }
      if (isSameFileViaPatterns(a, b, nodes)) {
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

/**
 * Finds util-scoped units in separate files whose embeddings exceed the merge fence, covering the util-to-util gap.
 * @param entries - Util leaf node entries to compare pairwise
 * @param nodes - The code tree node map
 * @param fence - The similarity threshold above which a pair is flagged
 * @returns Findings for cross-file util duplicates
 * @kuralPatterns crossScan
 * @kuralPure
 */
function scanUtilCrossFile(
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
      if (sharesPattern(a, b)) {
        continue;
      }
      if (isCallerCallee(a, b)) {
        continue;
      }
      if (isSameFileViaPatterns(a, b, nodes)) {
        continue;
      }
      const sim = cosineSimilarity(a.leaf, b.leaf);
      if (
        sim > fence &&
        !isSuppressed(a, "util-duplicates") &&
        !isSuppressed(b, "util-duplicates")
      ) {
        findings.push({
          audit: "util-duplicates",
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

/**
 * Finds files in separate directories whose embeddings are statistically closer than any same-parent siblings.
 * @param entries - File node entries to compare pairwise
 * @param fence - The similarity threshold above which a pair is flagged
 * @returns Findings for cross-directory file duplicates
 * @kuralPatterns crossScan
 * @kuralPure
 */
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

const duplicates = defineAudit({
  name: "duplicates",
  title: "Duplicates",
  format: formatDuplicate,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes, leafMergeFence, fileMergeFence } = ctx;
    const all = [...nodes.entries()];
    const leafEntries = all.filter(
      ([, n]) => isLeaf(n) && !n.util && !n.helper && n.leaf.length > NONE,
    );
    const utilEntries = all.filter(
      ([, n]) => isLeaf(n) && n.util && !n.helper && n.leaf.length > NONE,
    );
    const fileEntries = all.filter(([, n]) => n.kind === "file" && !n.util && n.leaf.length > NONE);
    const findings = [
      ...scanLeafCrossFile(leafEntries, nodes, leafMergeFence),
      ...scanCrossPopDuplicates(leafEntries, utilEntries, nodes, leafMergeFence),
      ...scanFileCrossDir(fileEntries, fileMergeFence),
    ];
    findings.sort((a, b) => (b.value ?? NONE) - (a.value ?? NONE));
    return findings;
  },
});

const utilDuplicates = defineAudit({
  name: "util-duplicates",
  title: "Util Duplicates",
  format: formatDuplicate,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes, leafMergeFence } = ctx;
    const utilLeaves = [...nodes.entries()].filter(
      ([, n]) => isLeaf(n) && n.util && n.leaf.length > NONE,
    );
    const findings = scanUtilCrossFile(utilLeaves, nodes, leafMergeFence);
    findings.sort((a, b) => (b.value ?? NONE) - (a.value ?? NONE));
    return findings;
  },
});
export { duplicates as default, formatDuplicate, isSameFileViaPatterns, utilDuplicates };
