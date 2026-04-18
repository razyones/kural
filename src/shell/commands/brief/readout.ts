/**
 * Renders a human-readable brief for terminal output — placement
 * header, ancestors, siblings, utilities, symbols, related, and group
 * expansions. It is the only module that owns the brief display
 * layout — no other module formats these sections for stdout.
 */

import type {
  AncestorFacet,
  Brief,
  CompanionMemberFacet,
  PatternMemberFacet,
  PlacementFacet,
  RelatedFacet,
  SiblingFacet,
  SymbolFacet,
  UtilityFacet,
} from "../../../analysis/brief/types.ts";
import { COL_GAP, codeCard, headerRow, memberCard, traitTags, wrapDesc } from "./cards.ts";
import type { ListItem, ListSection } from "../../ui/list.ts";
import { colors } from "../../ui/log.ts";
import { printListSections } from "../../ui/list.ts";
import { relPath } from "../../../analysis/brief/helpers.ts";
import { renderFooter } from "../../ui/footer.ts";

const NONE = 0;
const PERCENT_DECIMALS = 1;

/**
 * Shapes the placement section as a single list item — green heading
 * with confidence for confident placements, yellow heading without a
 * percentage for ask-user outcomes (the leaf score would mislead since
 * the brief lands at the parent neighborhood instead).
 * @param placement - Placement facet to render
 * @param root - Project root for path normalization
 * @returns One ListItem describing the placement decision
 * @kuralPure
 */
function placementItem(placement: PlacementFacet, root: string): ListItem {
  const target = relPath(placement.target, root);
  if (placement.action === "add-to-directory") {
    const confidence = `${placement.confidence.toFixed(PERCENT_DECIMALS)}%`;
    const heading = `${colors.green(placement.name)}${COL_GAP}${colors.cyan(confidence)}${COL_GAP}${colors.dim(`via ${placement.method}`)}`;
    const details: string[] = [target];
    if (placement.bridgeType !== null) {
      details.push(`bridge: ${placement.bridgeType} (${placement.bridgeLayer ?? ""})`);
    }
    return { heading, details };
  }
  const heading = `${colors.yellow(placement.name)}${COL_GAP}${colors.dim("likely belongs here \u2014 new concept")}`;
  const details: string[] = [];
  if (placement.reason !== null) {
    details.push(placement.reason);
  }
  details.push(target);
  return { heading, details };
}

/**
 * Builds a compact list item for sections whose items only need header,
 * description, and a location — lineage, siblings, and related.
 * Similarity is omitted for structural sections where ranking doesn't
 * apply.
 * @param name - Bold label shown first
 * @param kind - Node kind annotation
 * @param description - Full description text, possibly empty
 * @param path - Node key or file path to render relative to root
 * @param root - Project root for path normalization
 * @param similarity - Optional similarity badge
 * @returns One ListItem
 * @kuralPure
 * @kuralHelper
 */
function simpleItem(
  name: string,
  kind: string,
  description: string,
  path: string,
  root: string,
  similarity?: number,
): ListItem {
  const details: string[] = [...wrapDesc(description, NONE), relPath(path, root)];
  return { heading: headerRow(name, kind, similarity), details };
}

/**
 * Shapes the lineage section items from ancestor facets.
 * @param ancestors - Ancestor facets in nearest-to-furthest order
 * @param root - Project root for path normalization
 * @returns One item per ancestor
 * @kuralPure
 */
function lineageItems(ancestors: AncestorFacet[], root: string): ListItem[] {
  return ancestors.map((a) => simpleItem(a.name, "directory", a.description, a.path, root));
}

/**
 * Shapes the siblings section items from sibling facets.
 * @param siblings - Sibling facets sorted by similarity
 * @param root - Project root for path normalization
 * @returns One item per sibling
 * @kuralPure
 */
function siblingItems(siblings: SiblingFacet[], root: string): ListItem[] {
  return siblings.map((s) => simpleItem(s.name, s.kind, s.description, s.path, root, s.similarity));
}

/**
 * Shapes the utilities section items from utility facets.
 * @param utilities - Utility facets sorted by similarity
 * @param root - Project root for path normalization
 * @returns One item per utility
 * @kuralPure
 */
function utilityItems(utilities: UtilityFacet[], root: string): ListItem[] {
  return utilities.map((u) =>
    codeCard(
      u.name,
      u.kind,
      u.similarity,
      u.description,
      u.signature,
      relPath(u.file, root),
      u.startLine,
      u.endLine,
      traitTags(u.helper, u.pure, false),
    ),
  );
}

/**
 * Shapes the symbols section items from symbol facets, appending
 * pattern and companion tags to the trait tag list.
 * @param symbols - Symbol facets sorted by similarity
 * @param root - Project root for path normalization
 * @returns One item per symbol
 * @kuralPure
 */
function symbolItems(symbols: SymbolFacet[], root: string): ListItem[] {
  return symbols.map((s) => {
    const tags: string[] = traitTags(s.helper, s.pure, s.exported);
    for (const p of s.patterns) {
      tags.push(`pattern:${p}`);
    }
    if (s.companion !== null) {
      tags.push(`companion:${s.companion}`);
    }
    return codeCard(
      s.name,
      s.kind,
      s.similarity,
      s.description,
      s.signature,
      relPath(s.file, root),
      s.startLine,
      s.endLine,
      tags,
    );
  });
}

/**
 * Shapes the related-concepts section items.
 * @param related - Related facets sorted by similarity
 * @param root - Project root for path normalization
 * @returns One item per related concept
 * @kuralPure
 */
function relatedItems(related: RelatedFacet[], root: string): ListItem[] {
  return related.map((r) => simpleItem(r.name, r.kind, r.description, r.file, root, r.similarity));
}

/**
 * Shapes the pattern-members section items with anchor tagging.
 * @param members - Pattern member facets
 * @param root - Project root for path normalization
 * @returns One item per pattern member
 * @kuralPure
 */
function patternItems(members: PatternMemberFacet[], root: string): ListItem[] {
  return members.map((m) =>
    memberCard(
      m.name,
      m.kind,
      `pattern:${m.patternId} \u00B7 anchor ${m.anchor}`,
      m.description,
      m.signature,
      relPath(m.file, root),
      m.startLine,
      m.endLine,
    ),
  );
}

/**
 * Shapes the companion-members section items with anchor tagging.
 * @param members - Companion member facets
 * @param root - Project root for path normalization
 * @returns One item per companion member
 * @kuralPure
 */
function companionItems(members: CompanionMemberFacet[], root: string): ListItem[] {
  return members.map((m) =>
    memberCard(
      m.name,
      m.kind,
      `companion:${m.companionId} \u00B7 anchor ${m.anchor}`,
      m.description,
      m.signature,
      relPath(m.file, root),
      m.startLine,
      m.endLine,
    ),
  );
}

/**
 * Composes the brief command's eight facet sections — placement,
 * lineage, siblings, utilities, symbols, related, patterns,
 * companions — into yellow-titled bulleted lists for stdout.
 * @param result - The brief to render
 * @param root - Absolute project root for path normalization
 * @kuralCauses writes brief readout to stdout
 * @kuralPatterns commandPrinter
 */
function printBrief(result: Brief, root: string): void {
  const sections: ListSection[] = [
    { title: "place", items: [placementItem(result.placement, root)] },
    { title: "lineage", items: lineageItems(result.ancestors, root) },
    { title: "siblings", items: siblingItems(result.siblings, root) },
    { title: "utilities", items: utilityItems(result.utilities, root) },
    { title: "symbols", items: symbolItems(result.symbols, root) },
    { title: "related", items: relatedItems(result.related, root) },
    { title: "patterns", items: patternItems(result.patternMembers, root) },
    { title: "companions", items: companionItems(result.companionMembers, root) },
  ];
  printListSections(sections);
}

/**
 * Renders the brief footer with glossary and next-step hints.
 * @kuralPatterns commandFooter
 * @kuralCauses writes footer to stdout
 */
function printBriefFooter(): void {
  renderFooter(
    [
      { term: "place", definition: "where the new code is recommended to live" },
      { term: "lineage", definition: "ancestor directories from placement target up to root" },
      { term: "siblings", definition: "existing peers at the placement target to imitate" },
      { term: "utilities", definition: "helpers in capability subtrees the agent can reuse" },
      { term: "symbols", definition: "function and type leaves ranked by query relevance" },
      { term: "related", definition: "functions and types the new code would likely depend on" },
      { term: "patterns", definition: "other units sharing a @kuralPatterns tag with a symbol" },
      {
        term: "companions",
        definition: "other units sharing a @kuralCompanion tag with a symbol",
      },
    ],
    [
      { command: "kural brief -p <provider>", description: "use a specific embedding provider" },
      { command: "kural brief --json", description: "output brief as JSON for agent consumption" },
      { command: "kural place", description: "ask only where the new code should live" },
      { command: "kural audit", description: "check structural health after changes" },
    ],
  );
}

export { printBrief, printBriefFooter };
