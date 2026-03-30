import {
  computeDeltas,
  countChildren,
  extractPath,
  parseWorstPair,
  toLoadedScore,
} from "./pipeline.ts";
import { describe, expect, it } from "vite-plus/test";
import type { LoadedScore } from "./pipeline.ts";

const NONE = 0;
const SCORE_VAL = 0.85;
const ONE = 1;
const TWO = 2;
const THREE = 3;
const DELTA_POSITIVE = 0.2;
const DELTA_NEGATIVE = -0.3;

/** Builds a minimal LoadedScore for testing. */
function makeScore(overrides: Partial<LoadedScore> & { key: string }): LoadedScore {
  return {
    kind: "function",
    name: "test",
    path: "/src/test.ts",
    fit: null,
    uniqueness: NONE,
    score: null,
    childrenFit: null,
    childrenUniqueness: null,
    childrenScore: null,
    subtreeFit: null,
    subtreeUniqueness: null,
    subtreeScore: null,
    overallScore: null,
    worstPair: null,
    bestUncle: null,
    ...overrides,
  };
}

describe("extractPath", () => {
  it("extracts path from a directory key", () => {
    expect(extractPath("dir:/src/ingestion")).toBe("/src/ingestion");
  });

  it("extracts path from a file key", () => {
    expect(extractPath("file:/src/ingestion/model.ts")).toBe("/src/ingestion/model.ts");
  });

  it("extracts path from a function key (strips name)", () => {
    expect(extractPath("func:/src/model.ts:embedSignatures")).toBe("/src/model.ts");
  });

  it("extracts path from a type key (strips name)", () => {
    expect(extractPath("type:/src/model.ts:EmbedOptions")).toBe("/src/model.ts");
  });

  it("returns key as-is if no colon found", () => {
    expect(extractPath("noprefix")).toBe("noprefix");
  });
});

describe("computeDeltas", () => {
  it("returns zero deltas when no comparison match exists", () => {
    const current = [makeScore({ key: "func:/a.ts:foo", overallScore: 0.8, score: 0.7 })];
    const comparison: LoadedScore[] = [];
    const deltas = computeDeltas(current, comparison);

    expect(deltas).toHaveLength(ONE);
    expect(deltas[NONE].overallDelta).toBe(NONE);
    expect(deltas[NONE].selfDelta).toBe(NONE);
  });

  it("computes positive delta when score improved", () => {
    const current = [makeScore({ key: "func:/a.ts:foo", overallScore: 0.8, score: 0.7 })];
    const comparison = [makeScore({ key: "func:/a.ts:foo", overallScore: 0.6, score: 0.5 })];
    const deltas = computeDeltas(current, comparison);

    expect(deltas[NONE].overallDelta).toBeCloseTo(DELTA_POSITIVE);
    expect(deltas[NONE].selfDelta).toBeCloseTo(DELTA_POSITIVE);
  });

  it("computes negative delta when score declined", () => {
    const current = [makeScore({ key: "func:/a.ts:foo", overallScore: 0.5 })];
    const comparison = [makeScore({ key: "func:/a.ts:foo", overallScore: 0.8 })];
    const deltas = computeDeltas(current, comparison);

    expect(deltas[NONE].overallDelta).toBeCloseTo(DELTA_NEGATIVE);
  });

  it("returns zero delta when both values are null", () => {
    const current = [makeScore({ key: "func:/a.ts:foo", overallScore: null })];
    const comparison = [makeScore({ key: "func:/a.ts:foo", overallScore: null })];
    const deltas = computeDeltas(current, comparison);

    expect(deltas[NONE].overallDelta).toBe(NONE);
  });
});

describe("countChildren", () => {
  it("returns zero for function nodes", () => {
    const target = makeScore({ key: "func:/a.ts:foo", kind: "function", path: "/a.ts" });
    expect(countChildren(target, [target])).toBe(NONE);
  });

  it("returns zero for type nodes", () => {
    const target = makeScore({ key: "type:/a.ts:Foo", kind: "type", path: "/a.ts" });
    expect(countChildren(target, [target])).toBe(NONE);
  });

  it("counts functions and types as children of a file", () => {
    const file = makeScore({ key: "file:/src/a.ts", kind: "file", path: "/src/a.ts" });
    const fn1 = makeScore({ key: "func:/src/a.ts:foo", kind: "function", path: "/src/a.ts" });
    const fn2 = makeScore({ key: "func:/src/a.ts:bar", kind: "function", path: "/src/a.ts" });
    const tp = makeScore({ key: "type:/src/a.ts:Baz", kind: "type", path: "/src/a.ts" });
    const all = [file, fn1, fn2, tp];

    expect(countChildren(file, all)).toBe(THREE);
  });

  it("counts direct files as children of a directory", () => {
    const dir = makeScore({ key: "dir:/src", kind: "directory", path: "/src" });
    const file1 = makeScore({ key: "file:/src/a.ts", kind: "file", path: "/src/a.ts" });
    const file2 = makeScore({ key: "file:/src/b.ts", kind: "file", path: "/src/b.ts" });
    const nested = makeScore({
      key: "file:/src/sub/c.ts",
      kind: "file",
      path: "/src/sub/c.ts",
    });
    const all = [dir, file1, file2, nested];

    expect(countChildren(dir, all)).toBe(TWO);
  });

  it("counts direct subdirectories as children of a directory", () => {
    const dir = makeScore({ key: "dir:/src", kind: "directory", path: "/src" });
    const sub = makeScore({ key: "dir:/src/utils", kind: "directory", path: "/src/utils" });
    const all = [dir, sub];

    expect(countChildren(dir, all)).toBe(ONE);
  });

  it("does not count deeply nested items as direct children", () => {
    const dir = makeScore({ key: "dir:/src", kind: "directory", path: "/src" });
    const deep = makeScore({
      key: "file:/src/a/b/c.ts",
      kind: "file",
      path: "/src/a/b/c.ts",
    });
    const all = [dir, deep];

    expect(countChildren(dir, all)).toBe(NONE);
  });
});

describe("parseWorstPair", () => {
  it("returns null for undefined input", () => {
    expect(parseWorstPair()).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseWorstPair("")).toBeNull();
  });

  it("parses a valid JSON pair", () => {
    expect(parseWorstPair('["foo","bar"]')).toEqual(["foo", "bar"]);
  });

  it("returns null for invalid JSON structure", () => {
    expect(parseWorstPair('{"a":1}')).toBeNull();
  });

  it("returns null for non-string array elements", () => {
    expect(parseWorstPair("[1,2]")).toBeNull();
  });
});

describe("toLoadedScore", () => {
  it("converts a ScoreRow with all fields", () => {
    const row = {
      key: "func:/src/a.ts:foo",
      kind: "function",
      name: "foo",
      uniqueness: SCORE_VAL,
      fit: SCORE_VAL,
      score: SCORE_VAL,
      overallScore: SCORE_VAL,
      worstPair: '["a","b"]',
      bestUncleName: "utils",
      bestUncleScore: SCORE_VAL,
    };
    const loaded = toLoadedScore(row);

    expect(loaded.path).toBe("/src/a.ts");
    expect(loaded.fit).toBe(SCORE_VAL);
    expect(loaded.worstPair).toEqual(["a", "b"]);
    expect(loaded.bestUncle).toEqual({ name: "utils", score: SCORE_VAL });
  });

  it("converts a ScoreRow with missing optional fields to null", () => {
    const row = {
      key: "dir:/src",
      kind: "directory",
      name: "src",
      uniqueness: SCORE_VAL,
    };
    const loaded = toLoadedScore(row);

    expect(loaded.path).toBe("/src");
    expect(loaded.fit).toBeNull();
    expect(loaded.score).toBeNull();
    expect(loaded.childrenFit).toBeNull();
    expect(loaded.overallScore).toBeNull();
    expect(loaded.worstPair).toBeNull();
    expect(loaded.bestUncle).toBeNull();
  });
});
