/**
 * The cartographer. Builds a flat, navigable node map with parent-child
 * pointers from a parse result. It is the only module that transforms
 * parsed units into a scoring-ready tree — no other module constructs
 * the node graph.
 */

import { directoryNode, fileNode, functionNode, typeNode } from "./builders.ts";
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

/** A node in the scoring tree with parent-child pointers. */
type CodeNode = FunctionNode | TypeNode | FileNode | DirectoryNode;

/** Map of node keys to nodes. */
type NodeMap = Map<string, CodeNode>;

/**
 * Detects helper functions: unexported functions called by 2+ siblings.
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
 * Propagates util flag upward: if all children are util, parent becomes util.
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
 * Builds the complete scoring tree from a parse result.
 * @param result - Parsed codebase with files and directories
 * @returns Flat node map with parent-child pointers
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

  return nodes;
}

/**
 * Resolves child keys to CodeNode instances.
 */
function getChildren(node: CodeNode, nodes: NodeMap): CodeNode[] {
  return node.childKeys.map((k) => nodes.get(k)).filter((n): n is CodeNode => n !== undefined);
}

/**
 * Returns eligible children for domain scoring: excludes util nodes.
 */
function getEligibleChildren(node: CodeNode, nodes: NodeMap): CodeNode[] {
  return getChildren(node, nodes).filter((c) => !c.util);
}

/**
 * Returns true if the node is a leaf (type or function).
 */
function isLeaf(node: CodeNode): boolean {
  return node.kind === "type" || node.kind === "function";
}

export { buildTree, getChildren, getEligibleChildren, isLeaf };
export type { CodeNode, DirectoryNode, FileNode, FunctionNode, NodeMap, TypeNode };
