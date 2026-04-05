/**
 * The blueprint. Defines the shape of every placement result — suggestions,
 * trail entries, bridge info, and related concepts. It is the only module
 * that owns the placement output contract — no other module defines what
 * the placement engine returns.
 */

/** A single step in the conditional probability chain trail. */
type TrailEntry = {
  node: string;
  choice: string;
  probability: number;
};

/** A ranked path from chain search. */
type RankedPath = {
  parentKey: string;
  parentName: string;
  confidence: number;
  depth: number;
  trail: TrailEntry[];
};

/** Axis classification result. */
type AxisResult = {
  classification: "domain" | "capability";
  domainFit: number;
  capabilityFit: number;
};

/** Bridge type classification result. */
type BridgeResult = {
  type: string;
  layer: string;
  confidence: number;
  gap: number;
  confident: boolean;
  alternatives: { type: string; similarity: number }[];
};

/** A neighborhood shown when the system asks the user. */
type Neighborhood = {
  name: string;
  description: string;
  confidence: number;
};

/** Placement suggestion: either auto-place or ask the user. */
type PlacementSuggestion =
  | {
      action: "add-to-directory";
      target: string;
      name: string;
      method: string;
      bridgeType?: string;
      bridgeLayer?: string;
    }
  | {
      action: "ask-user";
      reason: string;
      method: string;
      bestLeafMatch?: { name: string; similarity: number };
      neighborhoods?: Neighborhood[];
      bridgeType?: string;
      candidates?: { name: string; confidence: number }[];
    };

/** Related concept grouped by file. */
type RelatedGroup = {
  file: string;
  path: string;
  items: { name: string; kind: string; similarity: number }[];
};

/** Complete placement result. */
type PlacementResult = {
  query: string;
  axis: AxisResult;
  detection: {
    alienFence: number;
    probeCount: number;
    bestLeafMatch: { name: string; similarity: number };
    chainGap: number;
    globalAlien: boolean;
    levelAlien: string | null;
  };
  suggestion: PlacementSuggestion;
  confidence: number;
  topPaths: { parentName: string; confidence: number; trail: TrailEntry[] }[];
  bridge: BridgeResult | null;
  relatedConcepts: RelatedGroup[];
};

export type {
  AxisResult,
  BridgeResult,
  Neighborhood,
  PlacementResult,
  PlacementSuggestion,
  RankedPath,
  RelatedGroup,
  TrailEntry,
};
