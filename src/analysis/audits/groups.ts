/**
 * The bouncer. Deduplicates sibling nodes by pattern or companion group,
 * keeping one representative per group so audits count distinct identities
 * rather than repeated instances. It is the only module that owns
 * group-based deduplication — no other module filters by pattern ID.
 */

import type { ChildWithKey } from "./children.ts";
import type { CodeNode } from "../tree/tree.ts";

const FIRST = 0;
const NEXT = 1;

/**
 * Returns the deduplication group ID for a node (pattern or companion).
 * @param node - The node to get the group ID for
 * @returns The group ID, or null if ungrouped
 * @kuralPure
 */
function groupId(node: CodeNode): string | null {
  return node.patterns?.[FIRST] ?? node.companion ?? null;
}

/**
 * Deduplicates children by pattern or companion group, keeping one representative per group.
 * @param cwk - Array of child-key pairs to deduplicate
 * @returns Representatives and group counts
 * @kuralPure
 */
function deduplicateByGroup(cwk: ChildWithKey[]): {
  reps: ChildWithKey[];
  groups: [string, number][];
} {
  const counts = new Map<string, number>();
  const reps: ChildWithKey[] = [];
  for (const item of cwk) {
    if (item.node.helper) {
      continue;
    }
    const gid = groupId(item.node);
    if (gid !== null) {
      const existing = counts.get(gid);
      if (existing !== undefined) {
        counts.set(gid, existing + NEXT);
        continue;
      }
      counts.set(gid, NEXT);
    }
    reps.push(item);
  }
  const groups: [string, number][] = [...counts.entries()];
  return { reps, groups };
}

export { deduplicateByGroup, groupId };
