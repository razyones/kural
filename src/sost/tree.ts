/**
 * The cartographer. Builds a flat, navigable node map with parent-child
 * pointers from a parse result. It is the only module that transforms
 * parsed units into a scoring-ready tree — no other module constructs
 * the node graph.
 */

import { directoryNode, fileNode, functionNode, patternNode, typeNode } from "./builders.ts";
import type { ParseResult } from "../ingestion/parse/pipeline.ts";
import type { ResidualEntry } from "../ingestion/parse/types.ts";

const NONE = 0;
const NEXT = 1;
const CALLER_THRESHOLD = 2;

/** Shared properties across all node kinds. */
type BaseNode = {
  key: string;
  name: string;
  identity: number[];
  leaf: number[];
  parentKey: string | null;
  patterns: string | null;
  companion: string | null;
  util: boolean;
  helper: boolean;
  residuals: ResidualEntry[];
  hash: string;
  exported: boolean;
  description: string | undefined;
};

/** A function node in the scoring tree. */
type FunctionNode = BaseNode & {
  kind: "function";
  childKeys: [];
  calls: string[];
  returnsType: string;
  documentedParams: number;
  hasReturnDoc: boolean;
  pure: boolean;
  causes: string | undefined;
  paramNames: string[];
  paramTypes: string[];
};

/** A type node in the scoring tree. */
type TypeNode = BaseNode & {
  kind: "type";
  childKeys: [];
};

/** A file node in the scoring tree. */
type FileNode = BaseNode & {
  kind: "file";
  childKeys: string[];
};

/** A directory node in the scoring tree. */
type DirectoryNode = BaseNode & {
  kind: "directory";
  childKeys: string[];
};

/** A pattern group node — invisible folder materialised in memory. */
type PatternNode = BaseNode & {
  kind: "pattern";
  childKeys: string[];
};

/** A node in the scoring tree with parent-child pointers. */
type CodeNode = FunctionNode | TypeNode | FileNode | DirectoryNode | PatternNode;

/** Map of node keys to nodes. */
type NodeMap = Map<string, CodeNode>;

/**
 * Analyzes intra-file call graphs to identify unexported functions
 * referenced by two or more siblings — marking them as shared helpers.
 * @param nodes - The flat node map to scan for helpers
 * @kuralCauses marks functions as helpers based on caller count threshold
 */
function detectHelpers(nodes: NodeMap): void {
  for (const node of nodes.values()) {
    if (node.kind !== "file") {
      continue;
    }
    const children = getChildren(node, nodes);

    const callCounts = new Map<string, number>();
    for (const child of children) {
      if (child.kind === "function") {
        for (const call of child.calls) {
          callCounts.set(call, (callCounts.get(call) ?? NONE) + NEXT);
        }
      }
    }

    for (const child of children) {
      if (child.kind === "function" && !child.exported) {
        const count = callCounts.get(child.name) ?? NONE;
        if (count >= CALLER_THRESHOLD) {
          child.helper = true;
        }
      }
    }
  }
}

/**
 * Bubbles the util designation upward through the hierarchy — a
 * container becomes util when every one of its children is util.
 * @param nodes - The flat node map to propagate util flags on
 * @kuralCauses elevates containers to util status by child consensus
 */
function propagateUtil(nodes: NodeMap): void {
  for (const node of nodes.values()) {
    if (node.kind !== "file" && node.kind !== "directory") {
      continue;
    }
    if (node.childKeys.length === NONE) {
      continue;
    }
    const children = getChildren(node, nodes);
    if (children.length > NONE && children.every((c) => c.util)) {
      node.util = true;
    }
  }
}

/**
 * Wires parent pointers from directory children references.
 * @param nodes - The flat node map to wire parent pointers on
 * @param result - The parse result containing directory-child relationships
 * @kuralCauses mutates parent pointers on child nodes in place
 */
function wireParents(nodes: NodeMap, result: ParseResult): void {
  for (const [dirPath, dir] of Object.entries(result.directories)) {
    const dirKey = `dir:${dirPath}`;
    for (const childPath of dir.children) {
      const childKey = childPath in result.files ? `file:${childPath}` : `dir:${childPath}`;
      const child = nodes.get(childKey);
      if (child) {
        child.parentKey = dirKey;
      }
    }
  }
}

/**
 * Materializes pattern groups as in-memory container nodes. For each
 * file, leaves sharing a `patterns` tag are reparented under a synthetic
 * PatternNode whose identity is the centroid of its members.
 * @param nodes - The flat node map to mutate
 * @kuralCauses inserts pattern nodes and rewires parent/child pointers
 */
function materializePatterns(nodes: NodeMap): void {
  const MIN_GROUP = 2;
  for (const [, node] of nodes) {
    if (node.kind !== "file") {
      continue;
    }
    const groups = new Map<string, string[]>();
    for (const childKey of node.childKeys) {
      const child = nodes.get(childKey);
      if (child === undefined || child.patterns === null) {
        continue;
      }
      const bucket = groups.get(child.patterns);
      if (bucket) {
        bucket.push(childKey);
      } else {
        groups.set(child.patterns, [childKey]);
      }
    }

    for (const [patternId, memberKeys] of groups) {
      if (memberKeys.length < MIN_GROUP) {
        continue;
      }
      const pNode = patternNode(patternId, node.key, memberKeys, nodes);
      nodes.set(pNode.key, pNode);

      for (const mk of memberKeys) {
        const member = nodes.get(mk);
        if (member) {
          member.parentKey = pNode.key;
        }
      }

      const kept = node.childKeys.filter((k) => !memberKeys.includes(k));
      kept.push(pNode.key);
      node.childKeys = kept;
    }
  }
}

/**
 * Builds the complete scoring tree from a parse result.
 * @param result - Parsed codebase with files and directories
 * @returns Flat node map with parent-child pointers
 * @kuralPure
 */
function buildTree(result: ParseResult): NodeMap {
  const nodes: NodeMap = new Map();

  for (const [filePath, file] of Object.entries(result.files)) {
    const leafKeys: string[] = [];

    for (const [, fn] of Object.entries(file.functions)) {
      const node = functionNode(fn, filePath);
      nodes.set(node.key, node);
      leafKeys.push(node.key);
    }

    for (const [, type] of Object.entries(file.types)) {
      const node = typeNode(type, filePath);
      nodes.set(node.key, node);
      leafKeys.push(node.key);
    }

    const fNode = fileNode(file, filePath, leafKeys);
    nodes.set(fNode.key, fNode);
  }

  for (const [dirPath, dir] of Object.entries(result.directories)) {
    const childKeys = dir.children.map((childPath) =>
      childPath in result.files ? `file:${childPath}` : `dir:${childPath}`,
    );
    const dNode = directoryNode(dir, dirPath, childKeys);
    nodes.set(dNode.key, dNode);
  }

  wireParents(nodes, result);
  detectHelpers(nodes);
  propagateUtil(nodes);
  materializePatterns(nodes);

  return nodes;
}

/**
 * Resolves child keys to CodeNode instances.
 * @param node - The parent node whose children to resolve
 * @param nodes - The flat node map to look up children in
 * @returns Array of resolved child CodeNode instances
 * @kuralPure
 */
function getChildren(node: CodeNode, nodes: NodeMap): CodeNode[] {
  return node.childKeys.map((k) => nodes.get(k)).filter((n): n is CodeNode => n !== undefined);
}

/**
 * Returns eligible children for domain scoring: excludes util nodes
 * from domain parents. Util parents include all children (sandbox).
 * @param node - The parent node whose eligible children to resolve
 * @param nodes - The flat node map to look up children in
 * @returns Array of eligible child CodeNode instances
 * @kuralPure
 */
function getEligibleChildren(node: CodeNode, nodes: NodeMap): CodeNode[] {
  const children = getChildren(node, nodes);
  return node.util ? children : children.filter((c) => !c.util);
}

/**
 * Returns true if the node is a leaf (type or function).
 * @param node - The node to check
 * @returns True if the node is a type or function node
 * @kuralPure
 */
function isLeaf(node: CodeNode): boolean {
  return node.kind === "type" || node.kind === "function";
}

export { buildTree, getChildren, getEligibleChildren, isLeaf };
export type { CodeNode, DirectoryNode, FileNode, FunctionNode, NodeMap, PatternNode, TypeNode };
