/**
 * Constructs the scored node structures that carry
 * embedding vectors, identity hashes, and placement metadata. It is the
 * only module that shapes the raw material the scoring engine evaluates —
 * no other module creates the nodes that metrics are computed over.
 */

import type {
  DirectoryNode,
  FileNode,
  FunctionNode,
  NodeMap,
  PatternNode,
  TypeNode,
} from "./tree.ts";
import type {
  KuralDirectory,
  KuralFile,
  KuralFunction,
  KuralType,
} from "../ingestion/parse/types.ts";
import { centroid } from "../../utils/vectors.ts";
import { sha256 } from "../ingestion/embed/hash.ts";

const HASH_LENGTH = 8;
const NONE = 0;

/**
 * Returns the truncated facet hash set during embedding, falling back to
 * a name+path hash for units that were never embedded.
 * @param unit - The unit to read the hash from
 * @param fallbackParts - Fallback strings when facetHash is absent
 * @returns 8-character hex digest
 * @kuralPure
 * @kuralHelper
 */
function unitHash(
  unit: { facetHash?: string; name: string; path: string },
  ...fallbackParts: string[]
): string {
  if (unit.facetHash !== undefined) {
    return unit.facetHash.slice(NONE, HASH_LENGTH);
  }
  // Fallback: embedded units always have facetHash set by resolveCache.
  // This path only covers units skipped during embedding (e.g. tests or
  // dry-run mode) where param-type coverage is not required for correctness.
  return sha256([unit.name, unit.path, ...fallbackParts].join("\0")).slice(NONE, HASH_LENGTH);
}

/**
 * Builds a FunctionNode from a KuralFunction.
 * @param fn - The parsed function data
 * @param filePath - The source file path containing the function
 * @returns A fully constructed FunctionNode
 * @kuralPure
 */
function functionNode(fn: KuralFunction, filePath: string): FunctionNode {
  return {
    key: `func:${filePath}:${fn.name}`,
    kind: "function",
    name: fn.name,
    identity: fn.identityEmbedding,
    leaf: fn.leafEmbedding,
    childKeys: [],
    parentKey: `file:${filePath}`,
    patterns: fn.patterns ?? null,
    companion: null,
    util: fn.util,
    helper: fn.helper,
    residuals: fn.residuals,
    hash: unitHash(fn),
    exported: fn.exported,
    description: fn.description,
    bound: fn.bound ?? null,
    calls: fn.calls,
    returnsType: fn.returns,
    documentedParams: fn.documentedParams,
    hasReturnDoc: fn.hasReturnDoc,
    pure: fn.pure,
    causes: fn.causes,
    paramNames: fn.paramNames,
    paramTypes: fn.params,
  };
}

/**
 * Builds a TypeNode from a KuralType.
 * @param type - The parsed type data
 * @param filePath - The source file path containing the type
 * @returns A fully constructed TypeNode
 * @kuralPure
 */
function typeNode(type: KuralType, filePath: string): TypeNode {
  return {
    key: `type:${filePath}:${type.name}`,
    kind: "type",
    name: type.name,
    identity: type.identityEmbedding,
    leaf: type.leafEmbedding,
    childKeys: [],
    parentKey: `file:${filePath}`,
    patterns: type.patterns ?? null,
    companion: null,
    util: type.util,
    helper: type.helper,
    residuals: type.residuals,
    hash: unitHash(type),
    exported: type.exported,
    description: type.description,
    bound: type.bound ?? null,
  };
}

/**
 * Builds a FileNode from a KuralFile.
 * @param file - The parsed file data
 * @param filePath - The source file path
 * @param childKeys - Keys of child nodes (functions and types) in this file
 * @returns A fully constructed FileNode
 * @kuralPure
 */
function fileNode(file: KuralFile, filePath: string, childKeys: string[]): FileNode {
  return {
    key: `file:${filePath}`,
    kind: "file",
    name: file.name,
    identity: file.identityEmbedding,
    leaf: file.leafEmbedding,
    childKeys,
    parentKey: null,
    patterns: null,
    companion: file.companion ?? null,
    util: false,
    helper: file.helper,
    residuals: file.residuals,
    hash: unitHash(file),
    exported: false,
    description: file.description,
    bound: file.bound ?? null,
  };
}

/**
 * Builds a DirectoryNode from a KuralDirectory.
 * @param dir - The parsed directory data
 * @param dirPath - The directory path
 * @param childKeys - Keys of child nodes (files and subdirectories)
 * @returns A fully constructed DirectoryNode
 * @kuralPure
 */
function directoryNode(dir: KuralDirectory, dirPath: string, childKeys: string[]): DirectoryNode {
  return {
    key: `dir:${dirPath}`,
    kind: "directory",
    name: dir.name,
    identity: dir.identityEmbedding,
    leaf: dir.leafEmbedding,
    childKeys,
    parentKey: null,
    patterns: null,
    companion: null,
    util: false,
    helper: false,
    residuals: dir.residuals,
    hash: unitHash(dir),
    exported: false,
    description: dir.description,
    bound: null,
    borrows: dir.borrows,
  };
}

/**
 * Builds a PatternNode from a pattern group.
 * @param patternId - The @kuralPatterns tag value
 * @param fileKey - The parent file's key
 * @param memberKeys - Keys of the grouped leaf nodes
 * @param nodes - The full node map for centroid computation
 * @returns A fully constructed PatternNode
 * @kuralPure
 */
function patternNode(
  patternId: string,
  fileKey: string,
  memberKeys: string[],
  nodes: NodeMap,
): PatternNode {
  const identities = memberKeys
    .map((k) => nodes.get(k)?.identity)
    .filter((v): v is number[] => v !== undefined && v.length > NONE);
  const leaves = memberKeys
    .map((k) => nodes.get(k)?.leaf)
    .filter((v): v is number[] => v !== undefined && v.length > NONE);
  return {
    key: `pattern:${fileKey}:${patternId}`,
    kind: "pattern",
    name: patternId,
    identity: identities.length > NONE ? centroid(identities) : [],
    leaf: leaves.length > NONE ? centroid(leaves) : [],
    childKeys: memberKeys,
    parentKey: fileKey,
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

const NEXT = 1;
const MIN_GROUP = 2;

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
 * Materializes pattern groups as in-memory container nodes. For each
 * file, leaves sharing a `patterns` tag are reparented under a synthetic
 * PatternNode whose identity is the centroid of its members. Supports
 * nested patterns via multiple `@kuralPatterns` tags.
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
}

export { directoryNode, fileNode, functionNode, materializePatterns, patternNode, typeNode };
