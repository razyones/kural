/**
 * Detects directories whose identity embedding is closer to a non-sibling
 * than to their weakest sibling — vocabulary that bleeds across modules.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import type { CodeNode } from "../../tree/tree.ts";
import { cosineSimilarity } from "../../../utils/vectors.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../../utils/format.ts";
import { isSuppressed } from "../context.ts";
import { num } from "../../../utils/record.ts";
import { relative } from "node:path";
import { robustUpperFence } from "../fence.ts";
import { stripKeyPrefix } from "../../../utils/paths.ts";

const NONE = 0;
const HALF = 2;
const MAX_CROSS_PULLS = 3;

/**
 * Tests whether a directory's identity embedding drifts closer to a non-sibling module than to its nearest sibling.
 * @param item - The value to check
 * @returns True if the item is a valid cross-pull measurement
 * @kuralPure
 */
function isCrossPull(item: unknown): item is { path: string; sim: number } {
  if (typeof item !== "object" || item === null) {
    return false;
  }
  if (!("path" in item) || !("sim" in item)) {
    return false;
  }
  return typeof item.path === "string" && typeof item.sim === "number";
}

/**
 * Gathers all non-sibling modules whose identity is closer to the candidate than any of its actual siblings.
 * @param details - The finding details record containing cross-pull data
 * @returns An array of validated cross-pull measurements
 * @kuralPure
 */
function crossPulls(details: Record<string, unknown> | undefined): { path: string; sim: number }[] {
  const v = details?.["crossPulls"];
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((item) => isCrossPull(item));
}

/**
 * Renders the cross-module pull showing which non-sibling a directory's vocabulary drifts toward.
 * @param ctx - The formatting context with finding and display data
 * @returns The formatted list item
 * @kuralPatterns formatAudit
 * @kuralPure
 */
function formatVocabBleed({ finding, prefix, label, rootPath }: FormatCtx): ListItem {
  const minSiblingSim = num(finding.details, "minSiblingSim");
  const pulls = crossPulls(finding.details);
  const details = pulls.map((cp) => {
    const path = stripKeyPrefix(cp.path);
    const display = rootPath === null ? path : relative(rootPath, path) || path;
    return `Closer to non-sibling: ${display} (${fmtPct(cp.sim)} vs weakest sibling ${fmtPct(minSiblingSim)})`;
  });
  return {
    heading: `${prefix} ${label} uses cross-module vocabulary`,
    details,
  };
}

/** A vocabulary bleed candidate with cross-pull measurements. */
type VocabCandidate = {
  key: string;
  node: CodeNode;
  minSiblingSim: number;
  maxDelta: number;
  crossPulls: { path: string; sim: number }[];
};

/**
 * Identifies directories whose KURAL.md descriptions use vocabulary that pulls them into another module's semantic space.
 * @param nodes - The code tree node map
 * @param allDirs - All directory entries with identity embeddings
 * @returns Candidates with cross-pull measurements for fence filtering
 * @kuralPure
 */
function collectVocabCandidates(
  nodes: Map<string, CodeNode>,
  allDirs: [string, CodeNode][],
): VocabCandidate[] {
  const candidates: VocabCandidate[] = [];
  for (const [key, node] of allDirs) {
    if (isSuppressed(node, "vocabulary-bleed")) {
      continue;
    }
    const parent = node.parentKey === null ? undefined : nodes.get(node.parentKey);
    if (!parent || parent.kind !== "directory") {
      continue;
    }
    const siblings = parent.childKeys
      .filter((p) => p !== key)
      .map((p) => nodes.get(p))
      .filter(
        (s): s is CodeNode => s !== undefined && s.kind === "directory" && s.identity.length > NONE,
      );
    if (siblings.length === NONE) {
      continue;
    }
    const sibSims = siblings.map((s) => cosineSimilarity(node.identity, s.identity));
    const minSiblingSim = Math.min(...sibSims);
    const siblingPaths = new Set([key, ...siblings.map((s) => s.key), parent.key]);
    const nodePulls: { path: string; sim: number }[] = [];
    for (const [otherKey, otherNode] of allDirs) {
      if (siblingPaths.has(otherKey) || otherNode.parentKey === key) {
        continue;
      }
      const s = cosineSimilarity(node.identity, otherNode.identity);
      if (s > minSiblingSim) {
        nodePulls.push({ path: otherNode.key, sim: s });
      }
    }
    nodePulls.sort((a, b) => b.sim - a.sim);
    const maxDelta = nodePulls.length > NONE ? nodePulls[NONE].sim - minSiblingSim : NONE;
    candidates.push({ key, node, minSiblingSim, maxDelta, crossPulls: nodePulls });
  }
  return candidates;
}

export default defineAudit({
  name: "vocabulary-bleed",
  title: "Vocabulary Bleed",
  format: formatVocabBleed,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes, sensitivity } = ctx;
    const allDirs = [...nodes.entries()].filter(
      ([, n]) => n.kind === "directory" && n.identity.length > NONE,
    );
    const candidates = collectVocabCandidates(nodes, allDirs);
    const allDeltas = candidates.map((c) => c.maxDelta);
    const findings: Finding[] = [];

    for (const candidate of candidates) {
      if (candidate.crossPulls.length === NONE) {
        continue;
      }
      const others = allDeltas.filter((_, i) => candidates[i] !== candidate);
      if (others.length < HALF) {
        continue;
      }
      const fence = robustUpperFence(others, sensitivity);
      if (candidate.maxDelta > fence) {
        findings.push({
          audit: "vocabulary-bleed",
          key: candidate.key,
          name: candidate.node.name,
          hash: candidate.node.hash,
          value: candidate.maxDelta,
          fence,
          details: {
            minSiblingSim: candidate.minSiblingSim,
            crossPulls: candidate.crossPulls.slice(NONE, MAX_CROSS_PULLS),
          },
        });
      }
    }

    findings.sort((a, b) => (b.value ?? NONE) - (a.value ?? NONE));
    return findings;
  },
});
