/**
 * Reads kural-specific annotations and visibility modifiers
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
const FIRST = 0;
const AUDIT_NAME = 0;
const AUDIT_HASH = 1;
const LAST_BLOCK_OFFSET = 1;

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
 * Builds an empty JSDocInfo accumulator with all flags off.
 * @returns Fresh JSDocInfo with no description and no tags
 * @kuralPure
 * @kuralHelper
 */
function emptyInfo(): JSDocInfo {
  return {
    pure: false,
    util: false,
    helper: false,
    residuals: [],
    documentedParams: NONE,
    hasReturnDoc: false,
  };
}

/** Narrowed view of the @internal jsDoc array TypeScript hangs on AST nodes. */
type WithJSDoc = ts.Node & { jsDoc?: readonly ts.Node[] };

/**
 * Reads every JSDoc block attached to a node in source order. Reaches
 * past the public ts.getJSDocCommentsAndTags helper, which collapses
 * stacked blocks into the closest one — the underlying jsDoc array
 * preserves them, which is what callers here need to tell file-level
 * comments apart from declaration-level ones.
 * @param node - The AST node to read leading JSDoc blocks from
 * @returns Array of JSDoc blocks in source order, empty when none
 * @kuralPure
 * @kuralHelper
 */
function jsDocBlocks(node: ts.Node): ts.JSDoc[] {
  const blocks = (node as WithJSDoc).jsDoc ?? [];
  return blocks.filter((b): b is ts.JSDoc => ts.isJSDoc(b));
}

/**
 * Reads the description and kural tags from one JSDoc block into a fresh
 * JSDocInfo. Returns an empty accumulator when the block is undefined.
 * @param jsdoc - The single JSDoc block to read, or undefined
 * @returns Parsed JSDoc info derived from this block alone
 * @kuralPure
 * @kuralHelper
 */
function infoFromJSDoc(jsdoc: ts.JSDoc | undefined): JSDocInfo {
  const info = emptyInfo();
  if (jsdoc === undefined) {
    return info;
  }
  if (typeof jsdoc.comment === "string") {
    info.description = jsdoc.comment;
  }
  for (const tag of jsdoc.tags ?? []) {
    processTag(tag, info);
  }
  return info;
}

/**
 * Extracts kural-specific JSDoc tags and description for a declaration.
 * When multiple JSDoc blocks attach to the same node — which happens
 * when a file-level comment sits directly above the first declaration —
 * the block closest to the declaration wins so file metadata never
 * leaks into the declaration's identity.
 * @param node - The declaration node to inspect for JSDoc comments
 * @returns Parsed JSDoc info for the declaration's own block
 * @kuralPure
 */
function getJSDoc(node: ts.Node): JSDocInfo {
  const blocks = jsDocBlocks(node);
  return infoFromJSDoc(blocks[blocks.length - LAST_BLOCK_OFFSET]);
}

/**
 * Extracts the file-level JSDoc anchored on the first statement. When
 * the first statement is itself a JSDoc'd declaration the top-of-file
 * comment is the earlier of the two attached blocks; this picks that
 * one so the file description never collapses into the declaration's.
 * @param node - The first statement node of the source file
 * @returns Parsed JSDoc info for the top-of-file block
 * @kuralPure
 */
function getFileJSDoc(node: ts.Node): JSDocInfo {
  return infoFromJSDoc(jsDocBlocks(node)[FIRST]);
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

export { getFileJSDoc, getJSDoc, hasExportModifier, isUtilModule };
export type { JSDocInfo };
