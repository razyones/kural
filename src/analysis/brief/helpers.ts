/**
 * Shared constants and facet-shaping helpers used across every
 * brief module. It is the only module that defines the default caps and
 * signature formatting for the brief — no other brief file declares
 * them.
 */

import type { BriefCaps } from "./types.ts";
import type { CodeNode } from "../tree/tree.ts";

const NONE = 0;
const NOT_FOUND = -1;
const FIRST_AFTER_SCHEME = 1;
const FIRST_LINE = 1;
const DEFAULT_SIBLINGS = 5;
const DEFAULT_UTILITIES = 3;
const DEFAULT_SYMBOLS = 5;
const DEFAULT_RELATED = 3;
const DEFAULT_ANCESTORS = 3;
const DEFAULT_PATTERN_MEMBERS = 3;
const DEFAULT_COMPANION_MEMBERS = 2;
const DECIMAL_PLACES = 4;
const SCHEME_SEPARATOR = ":";
const PATH_SEPARATOR = "/";
const FILE_SCHEME = "file:";

/** Default caps that bound each section of the brief. */
const DEFAULT_CAPS: BriefCaps = {
  siblings: DEFAULT_SIBLINGS,
  utilities: DEFAULT_UTILITIES,
  symbols: DEFAULT_SYMBOLS,
  related: DEFAULT_RELATED,
  ancestors: DEFAULT_ANCESTORS,
  patternMembers: DEFAULT_PATTERN_MEMBERS,
  companionMembers: DEFAULT_COMPANION_MEMBERS,
};

/**
 * Returns a node description trimmed of leading and trailing whitespace.
 * Preserves every sentence and internal formatting so display can show
 * the full content the author wrote, including any exclusivity clause.
 * @param description - The full description text, possibly undefined
 * @returns The trimmed description, or an empty string when missing
 * @kuralPure
 */
function fullDescription(description: string | undefined): string {
  if (description === undefined) {
    return "";
  }
  return description.trim();
}

/**
 * Formats a function signature from the node's param and return metadata.
 * @param node - The code node whose signature to format
 * @returns A human-readable signature, or an empty string for non-functions
 * @kuralPure
 */
function signatureOf(node: CodeNode): string {
  if (node.kind !== "function") {
    return "";
  }
  const parts: string[] = [];
  for (let i = NONE; i < node.paramNames.length; i++) {
    const pName = node.paramNames[i] ?? "";
    const pType = node.paramTypes[i] ?? "unknown";
    parts.push(`${pName}: ${pType}`);
  }
  return `(${parts.join(", ")}) => ${node.returnsType}`;
}

/**
 * Returns the source line for a leaf node, falling back to line 1
 * for non-leaf kinds where line numbers don't apply.
 * @param node - Code node whose source line is needed
 * @returns 1-based line number
 * @kuralPure
 * @kuralHelper
 */
function leafStartLine(node: CodeNode): number {
  if (node.kind === "function" || node.kind === "type") {
    return node.startLine;
  }
  return FIRST_LINE;
}

/**
 * Returns the closing source line for a leaf node, falling back to
 * line 1 for non-leaf kinds where line numbers don't apply.
 * @param node - Code node whose closing line is needed
 * @returns 1-based line number
 * @kuralPure
 * @kuralHelper
 */
function leafEndLine(node: CodeNode): number {
  if (node.kind === "function" || node.kind === "type") {
    return node.endLine;
  }
  return FIRST_LINE;
}

/**
 * Rounds a similarity to the shared decimal places constant.
 * @param similarity - Raw cosine similarity
 * @returns Rounded similarity, safe for JSON serialization
 * @kuralPure
 */
function roundSim(similarity: number): number {
  return Number(similarity.toFixed(DECIMAL_PLACES));
}

/**
 * Strips the node-key scheme prefix and project root so the path
 * reads as a short relative location. Falls back to the cleaned
 * absolute path when the key is outside the root.
 * @param key - A node key like "file:/abs/path" or a bare path
 * @param root - Project root used to compute the relative segment
 * @returns A clean relative or absolute path with no scheme prefix
 * @kuralPure
 */
function relPath(key: string, root: string): string {
  let path: string;
  const fileIdx = key.indexOf(FILE_SCHEME);
  if (fileIdx === NOT_FOUND) {
    const colonIdx = key.indexOf(SCHEME_SEPARATOR);
    path = colonIdx === NOT_FOUND ? key : key.slice(colonIdx + FIRST_AFTER_SCHEME);
  } else {
    const after = key.slice(fileIdx + FILE_SCHEME.length);
    const tail = after.indexOf(SCHEME_SEPARATOR);
    path = tail === NOT_FOUND ? after : after.slice(NONE, tail);
  }
  if (path.startsWith(root)) {
    path = path.slice(root.length);
    if (path.startsWith(PATH_SEPARATOR)) {
      path = path.slice(FIRST_AFTER_SCHEME);
    }
  }
  return path;
}

/**
 * Collapses block-typed params (object literal types) inside a
 * signature to "{…}" so multi-property param shapes don't wrap the
 * terminal. Outer arrow and return type are preserved.
 * @param signature - A reconstructed function signature
 * @returns A single-line signature with nested object types collapsed
 * @kuralPure
 */
function collapseSignature(signature: string): string {
  let depth = NONE;
  let result = "";
  for (let i = NONE; i < signature.length; i++) {
    const ch = signature[i];
    if (ch === "{") {
      if (depth === NONE) {
        result += "{\u2026}";
      }
      depth++;
      continue;
    }
    if (ch === "}") {
      if (depth > NONE) {
        depth--;
      }
      continue;
    }
    if (depth === NONE) {
      result += ch;
    }
  }
  return result;
}

export {
  DECIMAL_PLACES,
  DEFAULT_CAPS,
  NONE,
  collapseSignature,
  fullDescription,
  leafEndLine,
  leafStartLine,
  relPath,
  roundSim,
  signatureOf,
};
