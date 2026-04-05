/**
 * The vocabulary. Defines the shared types for the audit system — findings,
 * definitions, and context. It is the only module that owns audit type
 * contracts — no other module defines what an audit looks like.
 */

import type { CodeNode, NodeMap } from "../tree/tree.ts";
import type { ListItem } from "../../shell/ui/list.ts";

/** Maximum findings displayed per audit. */
const MAX_DISPLAY = 15;

/** A single audit finding. */
type Finding = {
  audit: string;
  key: string;
  name: string;
  hash: string;
  parentKey?: string;
  pairKey?: string;
  pairName?: string;
  value?: number;
  groupValue?: number;
  delta?: number;
  fence?: number;
  clusters?: string[][];
  missing?: string[];
  details?: Record<string, unknown>;
};

/** The context passed to every audit's detect function. */
type AuditContext = {
  readonly nodes: NodeMap;
  readonly sensitivity: number;
  readonly containmentFloor: number;
  readonly minGroup: number;
  readonly rootKey: string | null;
  readonly siblingPairs: SiblingPair[];
  readonly leafMergeFence: number;
  readonly fileMergeFence: number;
  readonly axisScores: Record<string, number> | null;
  outlierKeys: Set<string>;
};

/** A pairwise similarity measurement between two siblings under the same parent. */
type SiblingPair = {
  parentKey: string;
  aNode: CodeNode;
  bNode: CodeNode;
  similarity: number;
  level: "file" | "leaf";
};

/** Pre-resolved context for formatting a single finding. */
type FormatCtx = {
  finding: Finding;
  label: string;
  prefix: string;
  location: string;
  labelNode: (key: string) => string;
  rootPath: string | null;
};

/** Definition of a single audit. */
type AuditDefinition = {
  /** Unique audit name used for filtering, suppression, and config. */
  name: string;
  /** Display title for the audit section. */
  title: string;
  /** The detection function. */
  detect: (ctx: AuditContext) => Finding[];
  /** Converts a finding into a displayable list item. */
  format: (ctx: FormatCtx) => ListItem;
};

/**
 * Identity function that defines an audit with type checking.
 * @param def - The audit definition
 * @returns The same definition, typed
 * @kuralPure
 */
function defineAudit(def: AuditDefinition): AuditDefinition {
  return def;
}

/**
 * Finds the root directory node in a node map.
 * @param nodes - The code tree
 * @returns The root directory node, or null
 * @kuralPure
 */
function findRootNode(nodes: NodeMap): CodeNode | null {
  for (const [, node] of nodes) {
    if (node.kind === "directory" && node.parentKey === null) {
      return node;
    }
  }
  return null;
}

export { MAX_DISPLAY, defineAudit, findRootNode };
export type { AuditContext, AuditDefinition, Finding, FormatCtx, ListItem, SiblingPair };
