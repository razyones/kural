/**
 * The interpreter. Reads kural-specific annotations and visibility modifiers
 * from AST nodes. It is the only module that understands the @kural tag
 * vocabulary — no other part of the system inspects JSDoc semantics.
 */

import type { BoundDirection, ResidualEntry } from "./types.ts";
import ts from "typescript";

/** Parsed kural-relevant JSDoc information from an AST node. */
type JSDocInfo = {
  description?: string;
  pure: boolean;
  util: boolean;
  helper: boolean;
  residuals: ResidualEntry[];
  causes?: string;
  patterns?: string[];
  companion?: string;
  /** Number of @param tags that have a non-empty description */
  documentedParams: number;
  /** Whether a @returns tag with a non-empty description exists */
  hasReturnDoc: boolean;
  /** Bound direction from @kuralBound */
  bound?: BoundDirection;
};

const NONE = 0;
const AUDIT_NAME = 0;
const AUDIT_HASH = 1;

/**
 * Parses a @kuralResidual tag into a ResidualEntry and appends it.
 * @param tag - The JSDoc tag node
 * @param residuals - Array to push the parsed entry into
 * @kuralPure
 * @kuralHelper
 */
function parseResidualTag(tag: ts.JSDocTag, residuals: ResidualEntry[]): void {
  if (typeof tag.comment !== "string") {
    return;
  }
  const parts = tag.comment.trim().split(/\s+/);
  if (parts.length > AUDIT_NAME && parts[AUDIT_NAME] !== "") {
    const rawHash = parts[AUDIT_HASH];
    residuals.push({ audit: parts[AUDIT_NAME], hash: rawHash?.replaceAll(/[[\]]/g, "") });
  }
}

/**
 * Checks whether a JSDoc tag has a non-empty string comment.
 * @param tag - The JSDoc tag to check
 * @returns True if the tag has a non-empty description
 * @kuralPure
 * @kuralHelper
 */
function hasTagComment(tag: ts.JSDocTag): boolean {
  return typeof tag.comment === "string" && tag.comment.trim().length > NONE;
}

/**
 * Processes a single JSDoc tag, updating the info accumulator in place.
 * @param tag - The JSDoc tag to process
 * @param info - The JSDocInfo accumulator to update
 * @kuralPure
 * @kuralHelper
 */
function processTag(tag: ts.JSDocTag, info: JSDocInfo): void {
  const tagName = tag.tagName.text;
  if (tagName === "kuralPure") {
    info.pure = true;
  } else if (tagName === "kuralUtil") {
    info.util = true;
  } else if (tagName === "kuralHelper") {
    info.helper = true;
  } else if (tagName === "kuralResidual") {
    parseResidualTag(tag, info.residuals);
  } else if (tagName === "kuralCauses" && typeof tag.comment === "string") {
    info.causes = tag.comment;
  } else if (tagName === "kuralPatterns" && typeof tag.comment === "string") {
    info.patterns ??= [];
    for (const part of tag.comment.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length > NONE) {
        info.patterns.push(trimmed);
      }
    }
  } else if (tagName === "kuralCompanion" && typeof tag.comment === "string") {
    info.companion = tag.comment.trim();
  } else if (tagName === "kuralBound" && typeof tag.comment === "string") {
    const trimmed = tag.comment.trim();
    if (trimmed === "inward" || trimmed === "outward") {
      info.bound = trimmed;
    }
  } else if (tagName === "param" && hasTagComment(tag)) {
    info.documentedParams++;
  } else if (tagName === "returns" && hasTagComment(tag)) {
    info.hasReturnDoc = true;
  }
}

/**
 * Extracts kural-specific JSDoc tags and description from an AST node.
 * Reads @kuralPure, @kuralUtil, @kuralResidual, @kuralCauses, @kuralBound, @param, and @returns.
 * @param node - The AST node to inspect for JSDoc comments
 * @returns Parsed JSDoc info with description, kural tags, and doc completeness
 * @kuralPure
 */
function getJSDoc(node: ts.Node): JSDocInfo {
  const jsDocNodes = ts.getJSDocCommentsAndTags(node);
  const info: JSDocInfo = {
    pure: false,
    util: false,
    helper: false,
    residuals: [],
    documentedParams: NONE,
    hasReturnDoc: false,
  };

  for (const jsdoc of jsDocNodes) {
    if (ts.isJSDoc(jsdoc)) {
      if (typeof jsdoc.comment === "string") {
        info.description = jsdoc.comment;
      }
      for (const tag of jsdoc.tags ?? []) {
        processTag(tag, info);
      }
    }
  }

  return info;
}

/**
 * Checks whether an AST node has the `export` keyword modifier.
 * @param node - The AST node to check for export visibility
 * @returns True if the node is exported, false otherwise
 * @kuralPure
 */
function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;

  if (!modifiers) {
    return false;
  }

  return modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/**
 * Detects whether a file belongs to a utility module by path conventions
 * or by a file-level @kuralUtil tag on the first statement.
 * @param filePath - Absolute path to the source file
 * @param fileJSDoc - Parsed JSDoc from the file's first statement
 * @returns True if the file is a utility module
 * @kuralPure
 */
function isUtilModule(filePath: string, fileJSDoc: JSDocInfo): boolean {
  if (fileJSDoc.util) {
    return true;
  }
  const normalized = filePath.replaceAll("\\", "/");
  return (
    normalized.includes("/utils/") ||
    normalized.includes("/helpers/") ||
    normalized.includes(".utils.")
  );
}

export { getJSDoc, hasExportModifier, isUtilModule };
export type { JSDocInfo };
