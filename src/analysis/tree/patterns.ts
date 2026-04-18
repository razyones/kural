/**
 * Materializes `@kuralPatterns` groups as synthetic container nodes —
 * per file for leaves that share a tag in one place, then cross-file
 * for tags whose members are scattered across sibling files under a
 * common ancestor directory. It is the only module that creates
 * pattern nodes — no other module produces the invisible containers
 * that the rest of the tree sees.
 */

import type { NodeMap, PatternNode } from "./tree.ts";
import { centroid } from "../../utils/vectors.ts";
import { sha256 } from "../ingestion/embed/hash.ts";
import { stripKeyPrefix } from "../../utils/paths.ts";

const HASH_LENGTH = 8;
const NONE = 0;
const NEXT = 1;
const MIN_GROUP = 2;
const CROSS_FILE_MIN_FILES = 2;
const DROP_FILENAME = 1;

/**
 * Builds a PatternNode from a pattern group.
 * @param patternId - The @kuralPatterns tag value
 * @param parentKey - The parent node's key (file or directory)
 * @param memberKeys - Keys of the grouped nodes
 * @param nodes - The full node map for centroid computation
 * @returns A fully constructed PatternNode
 * @kuralPure
 */
function patternNode(
  patternId: string,
  parentKey: string,
  memberKeys: string[],
  nodes: NodeMap,
): PatternNode {
  const identities: number[][] = [];
  const leaves: number[][] = [];
  for (const k of memberKeys) {
    const member = nodes.get(k);
    if (member === undefined) {
      continue;
    }
    if (member.identity.length > NONE) {
      identities.push(member.identity);
    }
    if (member.leaf.length > NONE) {
      leaves.push(member.leaf);
    }
  }
  return {
    key: `pattern:${parentKey}:${patternId}`,
    kind: "pattern",
    name: patternId,
    identity: identities.length > NONE ? centroid(identities) : [],
    leaf: leaves.length > NONE ? centroid(leaves) : [],
    childKeys: memberKeys,
    parentKey,
    patterns: null,
    companion: null,
    util: false,
    helper: false,
    residuals: [],
    hash: sha256(["pattern", patternId, ...memberKeys].join("\0")).slice(NONE, HASH_LENGTH),
    exported: false,
    description: undefined,
    bound: null,
  };
}

/**
 * Groups children by a specific depth in their patterns array and
 * creates pattern nodes for groups with 2+ members. Recurses for
 * deeper nesting levels.
 * @param parentKey - Key of the parent node to group under
 * @param childKeys - Keys of children to consider for grouping
 * @param depth - Current nesting depth (index into the patterns array)
 * @param nodes - The flat node map to mutate
 * @returns Updated child keys with pattern nodes replacing grouped members
 * @kuralCauses inserts pattern nodes and rewires parent/child pointers
 */
function groupAtDepth(
  parentKey: string,
  childKeys: string[],
  depth: number,
  nodes: NodeMap,
): string[] {
  const groups = new Map<string, string[]>();
  const ungrouped: string[] = [];

  for (const childKey of childKeys) {
    const child = nodes.get(childKey);
    if (child === undefined || child.patterns === null || depth >= child.patterns.length) {
      ungrouped.push(childKey);
      continue;
    }
    const tag = child.patterns[depth];
    const bucket = groups.get(tag);
    if (bucket) {
      bucket.push(childKey);
    } else {
      groups.set(tag, [childKey]);
    }
  }

  const result = [...ungrouped];
  for (const [patternId, memberKeys] of groups) {
    if (memberKeys.length < MIN_GROUP) {
      result.push(...memberKeys);
      continue;
    }
    const pNode = patternNode(patternId, parentKey, memberKeys, nodes);
    nodes.set(pNode.key, pNode);

    for (const mk of memberKeys) {
      const member = nodes.get(mk);
      if (member) {
        member.parentKey = pNode.key;
      }
    }

    const nestedKeys = groupAtDepth(pNode.key, memberKeys, depth + NEXT, nodes);
    pNode.childKeys = nestedKeys;
    result.push(pNode.key);
  }

  return result;
}

/**
 * Returns the nearest common ancestor directory key for a set of file
 * keys, or null when no such directory node exists in the map.
 * @param fileKeys - File node keys (e.g. "file:/src/a.ts")
 * @param nodes - The flat node map for directory lookup
 * @returns NCA directory key, or null when absent
 * @kuralPure
 * @kuralHelper
 */
function ncaDirKey(fileKeys: string[], nodes: NodeMap): string | null {
  const parts = fileKeys.map((k) => stripKeyPrefix(k).split("/").slice(NONE, -DROP_FILENAME));
  let prefix = parts[NONE] ?? [];
  for (let i = NEXT; i < parts.length; i++) {
    const limit = Math.min(prefix.length, parts[i].length);
    let common = NONE;
    while (common < limit && prefix[common] === parts[i][common]) {
      common++;
    }
    prefix = prefix.slice(NONE, common);
  }
  const key = `dir:${prefix.join("/")}`;
  return nodes.has(key) ? key : null;
}

/**
 * Collects per-file representatives keyed by pattern tag. A file
 * contributes either its in-file pattern node (when the in-file pass
 * grouped ≥2 tagged members) or a singleton leaf still directly under
 * the file. Leaves already consumed into an in-file pattern are
 * skipped because their parent is the pattern, not the file.
 * @param nodes - The flat node map scanned after the in-file pass
 * @returns patternId → fileKey → representative key
 * @kuralPure
 * @kuralHelper
 */
function collectCrossFileGroups(nodes: NodeMap): Map<string, Map<string, string>> {
  const groups = new Map<string, Map<string, string>>();
  for (const [key, node] of nodes) {
    const parent = node.parentKey === null ? undefined : nodes.get(node.parentKey);
    if (parent?.kind !== "file") {
      continue;
    }
    let tag: string | undefined;
    if (node.kind === "pattern") {
      tag = node.name;
    } else if (
      (node.kind === "function" || node.kind === "type") &&
      node.patterns !== null &&
      node.patterns.length > NONE
    ) {
      tag = node.patterns[NONE];
    }
    if (tag === undefined) {
      continue;
    }
    const byFile = groups.get(tag) ?? new Map<string, string>();
    byFile.set(parent.key, key);
    groups.set(tag, byFile);
  }
  return groups;
}

/**
 * Attaches a cross-file pattern node at the NCA, removes each
 * representative from its file, and rewires parent pointers.
 * @param tag - Pattern ID
 * @param byFile - File key to representative key map
 * @param nodes - The flat node map to mutate
 * @kuralCauses inserts a cross-file pattern node and rewires representatives
 * @kuralHelper
 */
function attachCrossFilePattern(tag: string, byFile: Map<string, string>, nodes: NodeMap): void {
  const ncaKey = ncaDirKey([...byFile.keys()], nodes);
  if (ncaKey === null) {
    return;
  }
  const members = [...byFile.values()];
  const pNode = patternNode(tag, ncaKey, members, nodes);
  nodes.set(pNode.key, pNode);
  for (const [fileKey, memberKey] of byFile) {
    const file = nodes.get(fileKey);
    if (file?.kind === "file") {
      file.childKeys = file.childKeys.filter((k) => k !== memberKey);
    }
    const member = nodes.get(memberKey);
    if (member) {
      member.parentKey = pNode.key;
    }
  }
  const nca = nodes.get(ncaKey);
  if (nca?.kind === "directory") {
    nca.childKeys = [...nca.childKeys, pNode.key];
  }
}

/**
 * Materializes pattern groups as in-memory container nodes. Runs two
 * passes: per-file grouping of leaves sharing a `patterns` tag, then a
 * cross-file pass that lifts groups spanning multiple files under their
 * nearest common ancestor directory. Each file contributes one
 * representative to a cross-file group — an in-file pattern node when
 * present, otherwise a singleton leaf.
 * @param nodes - The flat node map to mutate
 * @kuralCauses inserts pattern nodes and rewires parent/child pointers
 */
function materializePatterns(nodes: NodeMap): void {
  for (const [, node] of nodes) {
    if (node.kind !== "file") {
      continue;
    }
    node.childKeys = groupAtDepth(node.key, node.childKeys, NONE, nodes);
  }
  const groups = collectCrossFileGroups(nodes);
  for (const [tag, byFile] of groups) {
    if (byFile.size < CROSS_FILE_MIN_FILES) {
      continue;
    }
    attachCrossFilePattern(tag, byFile, nodes);
  }
}

export { materializePatterns, patternNode };
