/**
 * Lays out the row and card primitives shared by every brief
 * section — width measurement, score formatting, header rows, and the
 * multi-line code card. It is the only module that owns these layout
 * helpers — no other module composes brief rows or builds the dim
 * sub-line stack.
 * @kuralHelper
 */

import type { ListItem } from "../../ui/list.ts";
import { collapseSignature } from "../../../analysis/brief/helpers.ts";
import { colors } from "../../ui/log.ts";
import { fmtPct } from "../../../utils/format.ts";
import { highlightSignature } from "./highlight.ts";

const NONE = 0;
const COL_GAP = "  ";
const SPACE_WIDTH = 1;
const GUTTER_OVERHEAD = 3;
const TERM_DEFAULT = 100;

/**
 * Word-wraps a description across as many lines as needed to fit the
 * terminal width, so the full content the author wrote stays visible
 * without truncation. The prefix length covers everything before the
 * description on the row (including the section gutter).
 * @param text - Description text to wrap
 * @param prefix - Visible width of everything that precedes the description
 * @returns Zero or more wrapped lines
 * @kuralPure
 */
function wrapDesc(text: string, prefix: number): string[] {
  if (text.length === NONE) {
    return [];
  }
  const cols = process.stdout.columns || TERM_DEFAULT;
  const budget = cols - GUTTER_OVERHEAD - prefix;
  if (budget <= NONE) {
    return [];
  }
  const flat = text.replaceAll(/\s+/g, " ").trim();
  if (flat.length === NONE) {
    return [];
  }
  const words = flat.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === NONE) {
      current = word;
      continue;
    }
    if (current.length + SPACE_WIDTH + word.length <= budget) {
      current += ` ${word}`;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current.length > NONE) {
    lines.push(current);
  }
  return lines;
}

/**
 * Builds a header row for a facet card — bold name plus optional dim
 * kind tag and cyan similarity badge.
 * @param name - Bold label shown first
 * @param kind - Optional node kind (function, type, file, directory)
 * @param similarity - Optional similarity score shown as a badge
 * @returns A single styled header line
 * @kuralPure
 */
function headerRow(name: string, kind?: string, similarity?: number): string {
  const parts: string[] = [colors.bold(name)];
  if (kind !== undefined && kind.length > NONE) {
    parts.push(colors.dim(kind));
  }
  if (similarity !== undefined) {
    parts.push(colors.cyan(fmtPct(similarity)));
  }
  return parts.join(COL_GAP);
}

/**
 * Builds a code-leaf list item — header row plus detail lines for the
 * wrapped description, signature, location, and trailing tags.
 * @param name - Symbol name shown bold in the heading
 * @param kind - Node kind annotation for the heading
 * @param similarity - Similarity score shown as a badge, or undefined to hide
 * @param description - Full description text, possibly empty
 * @param signature - Reconstructed signature, possibly empty
 * @param file - Relative file path
 * @param startLine - 1-based first line
 * @param endLine - 1-based last line
 * @param tags - Trait labels and pattern/companion tags, possibly empty
 * @returns One ListItem representing the card
 * @kuralPure
 */
function codeCard(
  name: string,
  kind: string,
  similarity: number | undefined,
  description: string,
  signature: string,
  file: string,
  startLine: number,
  endLine: number,
  tags: string[],
): ListItem {
  const details: string[] = [...wrapDesc(description, NONE)];
  if (signature.length > NONE) {
    details.push(highlightSignature(collapseSignature(signature)));
  }
  details.push(formatLocation(file, startLine, endLine));
  if (tags.length > NONE) {
    details.push(tags.join(" \u00B7 "));
  }
  return { heading: headerRow(name, kind, similarity), details };
}

/**
 * Builds a member list item for pattern and companion expansions —
 * anchor-tagged heading plus wrapped description, signature, and
 * location details.
 * @param name - Member name
 * @param kind - Node kind annotation
 * @param tagText - Already-formatted tag string (e.g. "pattern:foo · anchor bar")
 * @param description - Full description text, possibly empty
 * @param signature - Reconstructed signature, possibly empty
 * @param file - Relative file path
 * @param startLine - 1-based first line
 * @param endLine - 1-based last line
 * @returns One ListItem representing the member card
 * @kuralPure
 */
function memberCard(
  name: string,
  kind: string,
  tagText: string,
  description: string,
  signature: string,
  file: string,
  startLine: number,
  endLine: number,
): ListItem {
  const heading = `${headerRow(name, kind)}${COL_GAP}${colors.dim(tagText)}`;
  const details: string[] = [...wrapDesc(description, NONE)];
  if (signature.length > NONE) {
    details.push(highlightSignature(collapseSignature(signature)));
  }
  details.push(formatLocation(file, startLine, endLine));
  return { heading, details };
}

/**
 * Builds the relative-path location label, collapsing single-line
 * spans to "path:line" and showing "path:start-end" for ranges.
 * @param file - Relative file path
 * @param startLine - 1-based first line
 * @param endLine - 1-based last line
 * @returns A short location string
 * @kuralPure
 */
function formatLocation(file: string, startLine: number, endLine: number): string {
  if (endLine <= startLine) {
    return `${file}:${String(startLine)}`;
  }
  return `${file}:${String(startLine)}-${String(endLine)}`;
}

/**
 * Builds compact trait tags for helper / pure / exported flags. Omits
 * false flags so rows don't show negative traits.
 * @param helper - Whether the unit is marked @kuralHelper
 * @param pure - Whether the function is marked @kuralPure
 * @param exported - Whether the symbol is exported from its file
 * @returns Trait tags that should appear on the card
 * @kuralPure
 * @kuralHelper
 */
function traitTags(helper: boolean, pure: boolean, exported: boolean): string[] {
  const tags: string[] = [];
  if (helper) {
    tags.push("helper");
  }
  if (pure) {
    tags.push("pure");
  }
  if (exported) {
    tags.push("exported");
  }
  return tags;
}

export { COL_GAP, codeCard, headerRow, memberCard, traitTags, wrapDesc };
