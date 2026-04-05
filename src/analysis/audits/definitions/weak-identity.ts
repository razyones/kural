/**
 * Detects containers whose identity fails to anchor the majority of
 * their children — more than half fit a competing uncle better than
 * their own parent, signaling a description that does not represent
 * what the directory actually contains.
 */

import type { AuditContext, Finding, FormatCtx, ListItem } from "../types.ts";
import { getChildren, isLeaf } from "../../tree/tree.ts";
import type { CodeNode } from "../../tree/tree.ts";
import { cosineSimilarity } from "../../../utils/vectors.ts";
import { defineAudit } from "../types.ts";
import { fmtPct } from "../../../utils/format.ts";
import { isSuppressed } from "../context.ts";
import { num } from "../../../utils/record.ts";
import { upperFence } from "../fence.ts";

const NONE = 0;
const NEXT = 1;
const HALF_RATIO = 0.5;

/**
 * Renders the weak-identity finding showing how many children drift away.
 * @param ctx - The formatting context with finding and display data
 * @returns The formatted list item
 * @kuralPatterns formatAudit
 * @kuralPure
 */
function formatWeakIdentity({ finding, prefix, label }: FormatCtx): ListItem {
  const driftCount = num(finding.details, "driftCount");
  const childCount = num(finding.details, "childCount");
  const worstUncle = finding.pairKey ?? "unknown";
  return {
    heading: `${prefix} ${label} has weak identity (${driftCount}/${childCount} children drift)`,
    details: [
      `Parent fit: ${fmtPct(finding.value ?? NONE)}, strongest competing uncle: ${worstUncle} (${fmtPct(finding.groupValue ?? NONE)})`,
    ],
  };
}

/** Measurement for a single container's identity weakness. */
type WeakIdentityCandidate = {
  key: string;
  node: CodeNode;
  driftRatio: number;
  driftCount: number;
  childCount: number;
  avgParentFit: number;
  worstUncleName: string;
  worstUncleFit: number;
};

/**
 * For a single parent, counts how many children fit an uncle better.
 * @param parentNode - The container to evaluate
 * @param nodes - The full node map
 * @returns Candidate measurement, or null if not applicable
 * @kuralPure
 */
function measureDrift(
  parentNode: CodeNode,
  nodes: Map<string, CodeNode>,
): WeakIdentityCandidate | null {
  if (parentNode.parentKey === null || parentNode.identity.length === NONE) {
    return null;
  }
  const grandparent = nodes.get(parentNode.parentKey);
  if (grandparent === undefined) {
    return null;
  }
  const uncles = getChildren(grandparent, nodes).filter(
    (s) => s.kind === "directory" && s.key !== parentNode.key && s.identity.length > NONE,
  );
  if (uncles.length === NONE) {
    return null;
  }

  const children = getChildren(parentNode, nodes).filter(
    (c) => !c.util && !isLeaf(c) && c.leaf.length > NONE,
  );
  if (children.length < NEXT + NEXT) {
    return null;
  }

  return evaluateChildren(parentNode, children, uncles);
}

/**
 * Evaluates how many children fit an uncle better than their parent.
 * @param parentNode - The parent being evaluated
 * @param children - Eligible non-util, non-leaf children with vectors
 * @param uncles - Sibling directories of the parent
 * @returns Candidate measurement with drift ratio and worst uncle
 * @kuralPure
 */
function evaluateChildren(
  parentNode: CodeNode,
  children: CodeNode[],
  uncles: CodeNode[],
): WeakIdentityCandidate {
  let driftCount = NONE;
  let totalParentFit = NONE;
  let worstUncleName = "";
  let worstUncleFit = NONE;

  for (const child of children) {
    const parentFit = cosineSimilarity(parentNode.identity, child.leaf);
    totalParentFit += parentFit;
    let bestUncleFit = NONE;
    let bestUncleName = "";
    for (const uncle of uncles) {
      const uncleFit = cosineSimilarity(uncle.identity, child.leaf);
      if (uncleFit > bestUncleFit) {
        bestUncleFit = uncleFit;
        bestUncleName = uncle.name;
      }
    }
    if (bestUncleFit > parentFit) {
      driftCount++;
    }
    if (bestUncleFit > worstUncleFit) {
      worstUncleFit = bestUncleFit;
      worstUncleName = bestUncleName;
    }
  }

  return {
    key: parentNode.key,
    node: parentNode,
    driftRatio: driftCount / children.length,
    driftCount,
    childCount: children.length,
    avgParentFit: totalParentFit / children.length,
    worstUncleName,
    worstUncleFit,
  };
}

export default defineAudit({
  name: "weak-identity",
  title: "Weak Identity",
  format: formatWeakIdentity,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes, sensitivity } = ctx;
    const allCandidates: WeakIdentityCandidate[] = [];

    for (const [, node] of nodes) {
      if (isLeaf(node) || node.util) {
        continue;
      }
      const candidate = measureDrift(node, nodes);
      if (candidate !== null) {
        allCandidates.push(candidate);
      }
    }

    const allRatios = allCandidates.map((c) => c.driftRatio);
    const fence = upperFence(allRatios, sensitivity);
    const findings: Finding[] = [];

    for (const c of allCandidates) {
      if (
        c.driftRatio > HALF_RATIO &&
        c.driftRatio >= fence &&
        !isSuppressed(c.node, "weak-identity")
      ) {
        findings.push({
          audit: "weak-identity",
          key: c.key,
          name: c.node.name,
          hash: c.node.hash,
          pairKey: c.worstUncleName,
          value: c.avgParentFit,
          groupValue: c.worstUncleFit,
          details: {
            driftCount: c.driftCount,
            childCount: c.childCount,
            driftRatio: c.driftRatio,
          },
        });
      }
    }

    findings.sort((a, b) => (b.delta ?? NONE) - (a.delta ?? NONE));
    return findings;
  },
});
