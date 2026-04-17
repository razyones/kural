/**
 * Expands pattern and companion groups around already-surfaced
 * symbols so the agent sees how a pattern is done here. It is the only
 * module that expands @kuralPatterns and @kuralCompanion groups — no
 * other module reveals dedup-collapsed family members.
 */

import type { CodeNode, NodeMap } from "../tree/tree.ts";
import type { CompanionMemberFacet, PatternMemberFacet, SymbolFacet } from "./types.ts";
import { NONE, fullDescription, leafEndLine, leafStartLine, signatureOf } from "./helpers.ts";

const DEFAULT_ID_UNKNOWN = "unknown";

/**
 * Expands pattern groups for symbols that declare @kuralPatterns
 * membership, returning the other members the symbol ranking didn't
 * surface. Caps the total number of expansions.
 * @param anchors - Symbol facets to expand from
 * @param nodes - The full node map
 * @param cap - Maximum number of member facets to return
 * @returns Pattern member facets tagged with their anchor
 * @kuralPure
 */
function expandPatternMembers(
  anchors: SymbolFacet[],
  nodes: NodeMap,
  cap: number,
): PatternMemberFacet[] {
  const result: PatternMemberFacet[] = [];
  const seen = new Set(anchors.map((a) => nodeKey(a.file, a.name, a.kind)));
  for (const anchor of anchors) {
    if (result.length >= cap) {
      break;
    }
    for (const patternId of anchor.patterns) {
      collectPatternMembers(anchor, patternId, nodes, seen, result, cap);
      if (result.length >= cap) {
        break;
      }
    }
  }
  return result;
}

/**
 * Collects other leaves that share a @kuralPatterns tag with the
 * anchor, skipping already-seen nodes.
 * @param anchor - Symbol whose pattern group is being expanded
 * @param patternId - The shared pattern tag
 * @param nodes - The full node map
 * @param seen - Set of node keys already surfaced elsewhere
 * @param out - Output accumulator (mutated in place)
 * @param cap - Maximum number of member facets to collect
 * @kuralCauses mutates out and seen
 */
function collectPatternMembers(
  anchor: SymbolFacet,
  patternId: string,
  nodes: NodeMap,
  seen: Set<string>,
  out: PatternMemberFacet[],
  cap: number,
): void {
  for (const [, node] of nodes) {
    if (out.length >= cap) {
      return;
    }
    if (!sharesPattern(node, patternId)) {
      continue;
    }
    const key = nodeKey(node.parentKey ?? "", node.name, node.kind);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(toPatternFacet(anchor, patternId, node));
  }
}

/**
 * Checks whether a node participates in a given pattern tag.
 * @param node - The node under consideration
 * @param patternId - The pattern tag to match against
 * @returns True when the node's patterns array contains the tag
 * @kuralPure
 * @kuralHelper
 */
function sharesPattern(node: CodeNode, patternId: string): boolean {
  return node.patterns !== null && node.patterns.includes(patternId);
}

/**
 * Projects a pattern-group member into its facet shape.
 * @param anchor - The originating symbol facet
 * @param patternId - The shared pattern tag
 * @param node - The member node
 * @returns Pattern member facet ready for the brief output
 * @kuralPure
 */
function toPatternFacet(
  anchor: SymbolFacet,
  patternId: string,
  node: CodeNode,
): PatternMemberFacet {
  return {
    patternId,
    anchor: anchor.name,
    name: node.name,
    kind: node.kind,
    file: node.parentKey ?? "",
    startLine: leafStartLine(node),
    endLine: leafEndLine(node),
    signature: signatureOf(node),
    description: fullDescription(node.description),
  };
}

/**
 * Expands companion groups for anchors that declare @kuralCompanion
 * membership, returning the other members sharing the companion tag.
 * @param anchors - Symbol facets to expand from
 * @param nodes - The full node map
 * @param cap - Maximum number of companion facets to return
 * @returns Companion member facets tagged with their anchor
 * @kuralPure
 */
function expandCompanionMembers(
  anchors: SymbolFacet[],
  nodes: NodeMap,
  cap: number,
): CompanionMemberFacet[] {
  const result: CompanionMemberFacet[] = [];
  const seen = new Set(anchors.map((a) => nodeKey(a.file, a.name, a.kind)));
  for (const anchor of anchors) {
    if (anchor.companion === null) {
      continue;
    }
    collectCompanionMembers(anchor, anchor.companion, nodes, seen, result, cap);
    if (result.length >= cap) {
      break;
    }
  }
  return result;
}

/**
 * Collects other nodes that share a @kuralCompanion tag with the anchor.
 * @param anchor - Symbol whose companion group is being expanded
 * @param companionId - The shared companion tag
 * @param nodes - The full node map
 * @param seen - Set of node keys already surfaced elsewhere
 * @param out - Output accumulator (mutated in place)
 * @param cap - Maximum number of companion facets to collect
 * @kuralCauses mutates out and seen
 */
function collectCompanionMembers(
  anchor: SymbolFacet,
  companionId: string,
  nodes: NodeMap,
  seen: Set<string>,
  out: CompanionMemberFacet[],
  cap: number,
): void {
  for (const [, node] of nodes) {
    if (out.length >= cap) {
      return;
    }
    if (node.companion !== companionId) {
      continue;
    }
    const key = nodeKey(node.parentKey ?? "", node.name, node.kind);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      companionId,
      anchor: anchor.name,
      name: node.name,
      kind: node.kind,
      file: node.parentKey ?? "",
      startLine: leafStartLine(node),
      endLine: leafEndLine(node),
      signature: signatureOf(node),
      description: fullDescription(node.description),
    });
  }
}

/**
 * Builds a stable deduplication key for a node facet.
 * @param file - Parent file key, or empty string
 * @param name - Node name
 * @param kind - Node kind
 * @returns Compound key suitable for set membership
 * @kuralPure
 * @kuralHelper
 */
function nodeKey(file: string, name: string, kind: string): string {
  const filePart = file.length === NONE ? DEFAULT_ID_UNKNOWN : file;
  return `${filePart}|${name}|${kind}`;
}

export { expandCompanionMembers, expandPatternMembers };
