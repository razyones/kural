/**
 * Detects util-scoped units whose embeddings exceed the merge fence
 * across file boundaries — surfacing duplicated logic in the utility
 * sandbox that the main duplicates rule does not cover.
 */

import type { AuditContext, Finding } from "../types.ts";
import { cosineSimilarity } from "../../utils/vectors.ts";
import { defineAudit } from "../types.ts";
import { formatDuplicate } from "./duplicates.ts";
import { isCallerCallee } from "../helpers.ts";
import { isLeaf } from "../../sost/tree.ts";
import { isSuppressed } from "../context.ts";

const NONE = 0;
const NEXT = 1;

export default defineAudit({
  name: "util-duplicates",
  title: "Util Duplicates",
  format: formatDuplicate,
  detect: (ctx: AuditContext): Finding[] => {
    const { nodes, leafMergeFence } = ctx;
    const utilLeaves = [...nodes.entries()].filter(
      ([, n]) => isLeaf(n) && n.util && n.leaf.length > NONE,
    );
    const findings: Finding[] = [];

    for (let i = NONE; i < utilLeaves.length; i++) {
      for (let j = i + NEXT; j < utilLeaves.length; j++) {
        const [, a] = utilLeaves[i];
        const [, b] = utilLeaves[j];
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
        if (
          sim > leafMergeFence &&
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

    findings.sort((a, b) => (b.value ?? NONE) - (a.value ?? NONE));
    return findings;
  },
});
