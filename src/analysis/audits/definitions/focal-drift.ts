/**
 * Detects outward-bound nodes that no longer dominate their parent's
 * identity — the file's purpose has shifted away from the declared focal.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import type { CodeNode, NodeMap } from "../../tree/tree.ts";
import { num, str } from "../../../utils/record.ts";
import type { ChildWithKey } from "../children.ts";
import { cosineSimilarity } from "../../../utils/vectors.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../../utils/format.ts";
import { getChildrenWithKeys } from "../children.ts";

const NONE = 0;

/**
 * Renders a focal drift finding showing which child has overtaken
 * the declared focal in parent similarity.
 * @param ctx - The formatting context with finding and display data
 * @returns The formatted list item
 * @kuralPatterns formatAudit
 * @kuralPure
 */
function formatFocalDrift({ finding, prefix, label, location }: FormatCtx): ListItem {
  const actualTop = str(finding.details, "actualTopName");
  const topSim = num(finding.details, "topSim");
  const selfSim = num(finding.details, "selfSim");
  return {
    heading: `${prefix} ${label}${location} is no longer the dominant child`,
    details: [
      `"${actualTop}" is now closest (${fmtPct(topSim)}) vs declared focal (${fmtPct(selfSim)})`,
    ],
  };
}

/** Pre-computed child similarities for a single parent. */
type ChildSim = { key: string; name: string; similarity: number };

/**
 * Computes cosine similarity between a parent and each eligible child.
 * Excludes util, helper, and inward-bound children from the competitor set.
 * @param parent - The parent node
 * @param nodes - The full code tree
 * @returns Array of child similarities sorted by descending similarity
 * @kuralPure
 * @kuralHelper
 */
function computeChildSims(parent: CodeNode, nodes: NodeMap): ChildSim[] {
  return getChildrenWithKeys(parent, nodes)
    .filter(({ node: c }) => c.leaf.length > NONE && !c.util && !c.helper && c.bound !== "inward")
    .map(({ key: ck, node: c }) => ({
      key: ck,
      name: c.name,
      similarity: cosineSimilarity(parent.leaf, c.leaf),
    }));
}

/**
 * Groups outward-bound nodes by their parent key.
 * @param nodes - The full code tree
 * @returns Map from parent key to outward children
 * @kuralPure
 * @kuralHelper
 */
function groupByParent(nodes: NodeMap): Map<string, ChildWithKey[]> {
  const byParent = new Map<string, ChildWithKey[]>();
  for (const [key, node] of nodes) {
    if (node.bound !== "outward" || node.parentKey === null) {
      continue;
    }
    const bucket = byParent.get(node.parentKey);
    if (bucket === undefined) {
      byParent.set(node.parentKey, [{ key, node }]);
    } else {
      bucket.push({ key, node });
    }
  }
  return byParent;
}

/**
 * Checks each outward node under a parent for drift, appending findings.
 * @param parentKey - The parent node's map key
 * @param outwardNodes - Outward-bound children of this parent
 * @param sims - Pre-computed child similarities for the parent
 * @param findings - Array to append drift findings to
 * @kuralPure
 * @kuralHelper
 */
function checkParentDrift(
  parentKey: string,
  outwardNodes: ChildWithKey[],
  sims: ChildSim[],
  findings: Finding[],
): void {
  for (const { key, node } of outwardNodes) {
    const selfEntry = sims.find((s) => s.key === key);
    if (selfEntry === undefined) {
      continue;
    }
    const selfSim = selfEntry.similarity;
    let topSim = selfSim;
    let topName = node.name;
    for (const s of sims) {
      if (s.key !== key && s.similarity > topSim) {
        topSim = s.similarity;
        topName = s.name;
      }
    }
    if (topName !== node.name) {
      findings.push({
        audit: "focal-drift",
        key,
        name: node.name,
        hash: node.hash,
        parentKey,
        value: topSim - selfSim,
        details: { actualTopName: topName, topSim, selfSim },
      });
    }
  }
}

export default defineAudit({
  name: "focal-drift",
  title: "Focal Drift",
  format: formatFocalDrift,
  detect: (ctx: AuditContext): Finding[] => {
    const findings: Finding[] = [];
    const byParent = groupByParent(ctx.nodes);
    for (const [parentKey, outwardNodes] of byParent) {
      const parent = ctx.nodes.get(parentKey);
      if (parent === undefined || parent.leaf.length === NONE) {
        continue;
      }
      const sims = computeChildSims(parent, ctx.nodes);
      if (sims.length > NONE) {
        checkParentDrift(parentKey, outwardNodes, sims, findings);
      }
    }
    findings.sort((a, b) => (b.value ?? NONE) - (a.value ?? NONE));
    return findings;
  },
});
