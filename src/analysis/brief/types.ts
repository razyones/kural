/**
 * Defines the shape of every brief — the facet index that tells
 * a coding agent which existing code to consult before implementing. It
 * is the only module that owns the brief output contract — no other
 * module describes what the brief engine returns.
 */

/** A single ancestor directory in the placement's lineage. */
type AncestorFacet = {
  name: string;
  path: string;
  description: string;
};

/** A sibling inside the placement directory — file or subdirectory. */
type SiblingFacet = {
  name: string;
  kind: string;
  path: string;
  description: string;
  similarity: number;
};

/** A utility leaf available from capability subtrees. */
type UtilityFacet = {
  name: string;
  kind: string;
  file: string;
  startLine: number;
  endLine: number;
  description: string;
  signature: string;
  helper: boolean;
  pure: boolean;
  similarity: number;
};

/** A function or type leaf ranked by relevance to the query. */
type SymbolFacet = {
  name: string;
  kind: string;
  file: string;
  startLine: number;
  endLine: number;
  description: string;
  signature: string;
  helper: boolean;
  pure: boolean;
  exported: boolean;
  patterns: string[];
  companion: string | null;
  similarity: number;
};

/** A related concept from the existing placement engine. */
type RelatedFacet = {
  name: string;
  kind: string;
  file: string;
  description: string;
  similarity: number;
};

/** An additional member of the same @kuralPatterns group as a surfaced unit. */
type PatternMemberFacet = {
  patternId: string;
  anchor: string;
  name: string;
  kind: string;
  file: string;
  startLine: number;
  endLine: number;
  signature: string;
  description: string;
};

/** An additional member of the same @kuralCompanion group as a surfaced unit. */
type CompanionMemberFacet = {
  companionId: string;
  anchor: string;
  name: string;
  kind: string;
  file: string;
  startLine: number;
  endLine: number;
  signature: string;
  description: string;
};

/** Placement facet for confident auto-placement — carries chain confidence. */
type AddToDirectoryFacet = {
  action: "add-to-directory";
  target: string;
  name: string;
  path: string;
  confidence: number;
  method: string;
  bridgeType: string | null;
  bridgeLayer: string | null;
};

/**
 * Placement facet for ask-user outcomes — confidence is intentionally
 * omitted because the chain score belongs to the leaf the engine
 * rejected, not to the parent neighborhood the brief actually scopes
 * around. Surfacing it would mislead programmatic consumers.
 */
type AskUserFacet = {
  action: "ask-user";
  target: string;
  name: string;
  path: string;
  method: string;
  reason: string | null;
  bridgeType: string | null;
};

/** Placement facet — where the new code lands plus routing metadata. */
type PlacementFacet = AddToDirectoryFacet | AskUserFacet;

/** Per-section caps that bound the brief's output size. */
type BriefCaps = {
  siblings: number;
  utilities: number;
  symbols: number;
  related: number;
  ancestors: number;
  patternMembers: number;
  companionMembers: number;
};

/** The complete brief — a facet index for an implementation query. */
type Brief = {
  query: string;
  placement: PlacementFacet;
  ancestors: AncestorFacet[];
  siblings: SiblingFacet[];
  utilities: UtilityFacet[];
  symbols: SymbolFacet[];
  related: RelatedFacet[];
  patternMembers: PatternMemberFacet[];
  companionMembers: CompanionMemberFacet[];
};

export type {
  AncestorFacet,
  Brief,
  BriefCaps,
  CompanionMemberFacet,
  PatternMemberFacet,
  PlacementFacet,
  RelatedFacet,
  SiblingFacet,
  SymbolFacet,
  UtilityFacet,
};
