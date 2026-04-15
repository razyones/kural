/**
 * Assembles the hierarchical node map that every
 * downstream consumer operates on — wiring parent-child pointers,
 * detecting helpers, propagating util flags, and materializing patterns.
 * It is the only module that constructs this graph — no other module
 * shapes the structural backbone from parsed units.
 */

import type { BorrowsEntry, BoundDirection, ResidualEntry } from "../ingestion/parse/types.ts";
import {
  directoryNode,
  fileNode,
  functionNode,
  materializePatterns,
  typeNode,
} from "./builders.ts";
import type { ParseResult } from "../ingestion/parse/pipeline.ts";

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
  patterns: string[] | null;
  companion: string | null;
  util: boolean;
  helper: boolean;
  residuals: ResidualEntry[];
  hash: string;
  exported: boolean;
  description: string | undefined;
  bound: BoundDirection | null;
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
  /** Cross-layer borrowing declaration from @kuralBorrows */
  borrows?: BorrowsEntry;
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
 * Returns eligible children for domain scoring: excludes util and
 * inward-bound nodes from domain parents. Util parents include all
 * children (sandbox).
 * @param node - The parent node whose eligible children to resolve
 * @param nodes - The flat node map to look up children in
 * @returns Array of eligible child CodeNode instances
 * @kuralPure
 */
function getEligibleChildren(node: CodeNode, nodes: NodeMap): CodeNode[] {
  const children = getChildren(node, nodes);
  return node.util ? children : children.filter((c) => !c.util && c.bound !== "inward");
}

/**
 * Identifies the terminal nodes of the scoring tree — types and
 * functions, the units the tree is built around as opposed to file
 * and directory containers.
 * @param node - The tree node to classify
 * @returns True when the node sits at the bottom of the hierarchy
 * @kuralPure
 */
function isLeaf(node: CodeNode): boolean {
  return node.kind === "type" || node.kind === "function";
}

export { buildTree, getChildren, getEligibleChildren, isLeaf };
export type { CodeNode, DirectoryNode, FileNode, FunctionNode, NodeMap, PatternNode, TypeNode };
