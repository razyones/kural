import type { CompanionMemberFacet, PatternMemberFacet, SymbolFacet } from "./types.ts";
import { describe, expect, test } from "vite-plus/test";
import { expandCompanionMembers, expandPatternMembers } from "./patterns.ts";
import { makeFunction, toNodeMap } from "../../../tests/helpers/audits.ts";

const NONE = 0;
const NEXT = 1;
const CAP = 3;
const DEFAULT_SIM = 0.5;
const FIRST_LINE = 1;

/**
 * Builds a minimal SymbolFacet stub for pattern/companion expansion tests.
 */
function makeAnchor(overrides: Partial<SymbolFacet> = {}): SymbolFacet {
  return {
    name: overrides.name ?? "anchor",
    kind: overrides.kind ?? "function",
    file: overrides.file ?? "file:/a.ts",
    startLine: overrides.startLine ?? FIRST_LINE,
    endLine: overrides.endLine ?? FIRST_LINE,
    description: overrides.description ?? "",
    signature: overrides.signature ?? "",
    helper: overrides.helper ?? false,
    pure: overrides.pure ?? false,
    exported: overrides.exported ?? true,
    patterns: overrides.patterns ?? [],
    companion: overrides.companion ?? null,
    similarity: overrides.similarity ?? DEFAULT_SIM,
  };
}

describe("expandPatternMembers", () => {
  test("returns other members sharing a pattern tag", () => {
    const memberA = makeFunction({
      key: "func:/a.ts:foo",
      name: "foo",
      patterns: ["layerRouter"],
      parentKey: "file:/a.ts",
    });
    const memberB = makeFunction({
      key: "func:/a.ts:bar",
      name: "bar",
      patterns: ["layerRouter"],
      parentKey: "file:/a.ts",
    });
    const nodes = toNodeMap(memberA, memberB);
    const anchor = makeAnchor({ name: "foo", patterns: ["layerRouter"] });

    const result: PatternMemberFacet[] = expandPatternMembers([anchor], nodes, CAP);

    expect(result.length).toBe(NEXT);
    expect(result[NONE].name).toBe("bar");
    expect(result[NONE].patternId).toBe("layerRouter");
  });

  test("returns empty when no pattern tags declared", () => {
    const fn = makeFunction({ key: "func:/a.ts:foo", patterns: null });
    const nodes = toNodeMap(fn);
    const anchor = makeAnchor({ patterns: [] });

    expect(expandPatternMembers([anchor], nodes, CAP).length).toBe(NONE);
  });
});

describe("expandCompanionMembers", () => {
  test("returns other members sharing a companion tag", () => {
    const memberA = makeFunction({
      key: "func:/a.ts:foo",
      name: "foo",
      companion: "buddy",
      parentKey: "file:/a.ts",
    });
    const memberB = makeFunction({
      key: "func:/a.ts:bar",
      name: "bar",
      companion: "buddy",
      parentKey: "file:/a.ts",
    });
    const nodes = toNodeMap(memberA, memberB);
    const anchor = makeAnchor({ name: "foo", companion: "buddy" });

    const result: CompanionMemberFacet[] = expandCompanionMembers([anchor], nodes, CAP);

    expect(result.length).toBe(NEXT);
    expect(result[NONE].name).toBe("bar");
    expect(result[NONE].companionId).toBe("buddy");
  });

  test("returns empty when no companion tag", () => {
    const anchor = makeAnchor({ companion: null });
    expect(expandCompanionMembers([anchor], toNodeMap(), CAP).length).toBe(NONE);
  });
});
