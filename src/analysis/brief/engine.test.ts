import type { PlacementResult, PlacementSuggestion } from "../place/types.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeDir, toNodeMap } from "../../../tests/helpers/audits.ts";
import { placementKey, toPlacementFacet } from "./engine.ts";

const NONE = 0;
const CONFIDENCE = 42.5;

/** Builds a minimal PlacementResult shell for exercising the internal helpers. */
function buildPlacement(
  suggestion: PlacementSuggestion,
  topPaths: PlacementResult["topPaths"],
): PlacementResult {
  return {
    query: "q",
    queryVec: [],
    axis: { classification: "domain", domainFit: NONE, capabilityFit: NONE },
    detection: {
      alienFence: NONE,
      probeCount: NONE,
      bestLeafMatch: { name: "", similarity: NONE },
      chainGap: NONE,
      globalAlien: false,
      levelAlien: null,
    },
    suggestion,
    confidence: CONFIDENCE,
    topPaths,
    bridge: null,
    relatedConcepts: [],
  };
}

describe("placementKey", () => {
  test("returns suggestion target for add-to-directory", () => {
    const result = buildPlacement(
      { action: "add-to-directory", target: "dir:/src/auth", name: "auth", method: "chain-search" },
      [],
    );
    expect(placementKey(result, toNodeMap())).toBe("dir:/src/auth");
  });

  test("steps up from ask-user leaf to its parent directory", () => {
    const root = makeDir({ key: "dir:/src", name: "src", parentKey: null });
    const analysis = makeDir({
      key: "dir:/src/analysis",
      name: "analysis",
      parentKey: "dir:/src",
    });
    const leaf = makeDir({
      key: "dir:/src/analysis/place",
      name: "place",
      parentKey: "dir:/src/analysis",
    });
    const nodes = toNodeMap(root, analysis, leaf);
    const result = buildPlacement(
      { action: "ask-user", reason: "low confidence", method: "safety-gate" },
      [
        {
          parentKey: "dir:/src/analysis/place",
          parentName: "place",
          confidence: CONFIDENCE,
          trail: [],
        },
      ],
    );

    expect(placementKey(result, nodes)).toBe("dir:/src/analysis");
  });

  test("falls back to leaf key when the candidate has no parent", () => {
    const root = makeDir({ key: "dir:/src", name: "src", parentKey: null });
    const nodes = toNodeMap(root);
    const result = buildPlacement(
      { action: "ask-user", reason: "low confidence", method: "safety-gate" },
      [{ parentKey: "dir:/src", parentName: "src", confidence: CONFIDENCE, trail: [] }],
    );

    expect(placementKey(result, nodes)).toBe("dir:/src");
  });

  test("returns empty string when ask-user has no top paths", () => {
    const result = buildPlacement(
      { action: "ask-user", reason: "low confidence", method: "safety-gate" },
      [],
    );
    expect(placementKey(result, toNodeMap())).toBe("");
  });
});

describe("toPlacementFacet", () => {
  test("maps add-to-directory to the suggestion fields", () => {
    const result = buildPlacement(
      { action: "add-to-directory", target: "dir:/src/auth", name: "auth", method: "chain-search" },
      [],
    );
    const facet = toPlacementFacet(result, "dir:/src/auth", toNodeMap());

    expect(facet.action).toBe("add-to-directory");
    expect(facet.name).toBe("auth");
    expect(facet.target).toBe("dir:/src/auth");
    expect(facet.method).toBe("chain-search");
    expect(facet.confidence).toBe(CONFIDENCE);
    expect(facet.reason).toBeNull();
  });

  test("uses the parent neighborhood name for ask-user outcomes", () => {
    const parent = makeDir({ key: "dir:/src/analysis", name: "analysis", parentKey: "dir:/src" });
    const nodes = toNodeMap(parent);
    const result = buildPlacement(
      { action: "ask-user", reason: "low confidence", method: "safety-gate" },
      [
        {
          parentKey: "dir:/src/analysis/place",
          parentName: "place",
          confidence: CONFIDENCE,
          trail: [{ node: "analysis", choice: "place", probability: CONFIDENCE }],
        },
      ],
    );

    const facet = toPlacementFacet(result, "dir:/src/analysis", nodes);

    expect(facet.action).toBe("ask-user");
    expect(facet.name).toBe("analysis");
    expect(facet.target).toBe("dir:/src/analysis");
    expect(facet.reason).toBe("low confidence");
  });

  test("falls back to the top path's parent name when the target is unknown", () => {
    const result = buildPlacement(
      { action: "ask-user", reason: "low confidence", method: "safety-gate" },
      [
        {
          parentKey: "dir:/missing",
          parentName: "missing",
          confidence: CONFIDENCE,
          trail: [],
        },
      ],
    );

    const facet = toPlacementFacet(result, "dir:/absent", toNodeMap());

    expect(facet.name).toBe("missing");
  });
});
