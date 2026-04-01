import type {
  CodeNode,
  DirectoryNode,
  FileNode,
  FunctionNode,
  NodeMap,
  PatternNode,
} from "./tree.ts";
import { collectSubtree, descendantScores } from "./subtree.ts";
import { describe, expect, it } from "vite-plus/test";
import { NO_SIBLINGS } from "./metrics.ts";

/** Numeric constants. */
const NONE = 0;
const ONE = 1;
const TWO = 2;
const TOLERANCE = 10;

/** Metric values for test nodes. */
const FIT_A = 0.8;
const FIT_B = 0.6;
const FIT_C = 0.9;
const UNIQ_A = 0.7;
const UNIQ_B = 0.5;
const UNIQ_C = 0.85;

/** Embedding stub — non-empty to mark the node as valid. */
const STUB_VEC = [ONE];

/** Stub hash for test nodes. */
const STUB_HASH = "abcd1234";

/** Shared base properties for all test nodes. */
function baseProps(
  key: string,
  name: string,
  util: boolean,
): {
  key: string;
  name: string;
  identity: number[];
  leaf: number[];
  parentKey: null;
  patterns: null;
  companion: null;
  util: boolean;
  helper: boolean;
  residuals: [];
  hash: string;
  exported: boolean;
  description: undefined;
} {
  return {
    key,
    name,
    identity: STUB_VEC,
    leaf: STUB_VEC,
    parentKey: null,
    patterns: null,
    companion: null,
    util,
    helper: false,
    residuals: [],
    hash: STUB_HASH,
    exported: false,
    description: undefined,
  };
}

/** Builds a minimal leaf node (function kind). */
function makeLeaf(key: string, name: string): [string, ReturnType<typeof makeLeafNode>] {
  return [key, makeLeafNode(key, name)];
}

/** Creates the leaf node object. */
function makeLeafNode(key: string, name: string): FunctionNode {
  return {
    ...baseProps(key, name, false),
    kind: "function",
    childKeys: [],
    exported: true,
    calls: [],
    returnsType: "void",
    documentedParams: NONE,
    hasReturnDoc: false,
    pure: true,
    causes: undefined,
    paramNames: [],
    paramTypes: [],
  };
}

/** Builds a minimal file (non-leaf) node entry. */
function makeFile(
  key: string,
  name: string,
  childKeys: string[],
  util: boolean,
): [string, ReturnType<typeof makeFileNode>] {
  return [key, makeFileNode(key, name, childKeys, util)];
}

/** Creates the file node object. */
function makeFileNode(key: string, name: string, childKeys: string[], util: boolean): FileNode {
  return { ...baseProps(key, name, util), kind: "file", childKeys };
}

/** Builds a minimal directory (non-leaf) node entry. */
function makeDir(
  key: string,
  name: string,
  childKeys: string[],
  util: boolean,
): [string, ReturnType<typeof makeDirNode>] {
  return [key, makeDirNode(key, name, childKeys, util)];
}

/** Creates the directory node object. */
function makeDirNode(key: string, name: string, childKeys: string[], util: boolean): DirectoryNode {
  return { ...baseProps(key, name, util), kind: "directory", childKeys };
}

/** Builds a NodeMap from entry tuples, widening to CodeNode union. */
function toNodeMap(...entries: [string, CodeNode][]): NodeMap {
  return new Map(entries);
}

describe("collectSubtree leaf and unknown", () => {
  it("returns empty result for leaf nodes", () => {
    const nodes = toNodeMap(makeLeaf("func:a", "a"));
    const fitMap = new Map<string, number | null>();
    const uniqMap = new Map<string, number>();
    const result = collectSubtree("func:a", nodes, fitMap, uniqMap);
    expect(result.childrenFitValues).toEqual([]);
    expect(result.childrenUniqValues).toEqual([]);
  });

  it("returns empty result for unknown keys", () => {
    const nodes = toNodeMap();
    const fitMap = new Map<string, number | null>();
    const uniqMap = new Map<string, number>();
    const result = collectSubtree("missing", nodes, fitMap, uniqMap);
    expect(result.childrenFitValues).toEqual([]);
    expect(result.childrenUniqValues).toEqual([]);
  });
});

describe("collectSubtree local values", () => {
  it("collects local fit and uniqueness values", () => {
    const nodes = toNodeMap(
      makeFile("file:a", "a.ts", ["func:a1"], false),
      makeLeaf("func:a1", "a1"),
    );
    const fitMap = new Map<string, number | null>([["file:a", FIT_A]]);
    const uniqMap = new Map<string, number>([["file:a", UNIQ_A]]);
    const result = collectSubtree("file:a", nodes, fitMap, uniqMap);
    expect(result.childrenFitValues).toEqual([FIT_A]);
    expect(result.childrenUniqValues).toEqual([UNIQ_A]);
  });

  it("skips util children", () => {
    const nodes = toNodeMap(
      makeDir("dir:root", "root", ["file:a", "file:util"], false),
      makeFile("file:a", "a.ts", ["func:a1"], false),
      makeFile("file:util", "util.ts", ["func:u1"], true),
      makeLeaf("func:a1", "a1"),
      makeLeaf("func:u1", "u1"),
    );
    const fitMap = new Map<string, number | null>([
      ["dir:root", FIT_A],
      ["file:a", FIT_B],
      ["file:util", FIT_C],
    ]);
    const uniqMap = new Map<string, number>([
      ["dir:root", UNIQ_A],
      ["file:a", UNIQ_B],
      ["file:util", UNIQ_C],
    ]);
    const result = collectSubtree("dir:root", nodes, fitMap, uniqMap);
    expect(result.childrenFitValues).toContain(FIT_A);
    expect(result.childrenFitValues).toContain(FIT_B);
    expect(result.childrenFitValues).not.toContain(FIT_C);
  });
});

describe("collectSubtree multi-level", () => {
  it("aggregates across multiple levels", () => {
    const nodes = toNodeMap(
      makeDir("dir:root", "root", ["file:a", "file:b"], false),
      makeFile("file:a", "a.ts", ["func:a1"], false),
      makeFile("file:b", "b.ts", ["func:b1"], false),
      makeLeaf("func:a1", "a1"),
      makeLeaf("func:b1", "b1"),
    );
    const fitMap = new Map<string, number | null>([
      ["dir:root", FIT_A],
      ["file:a", FIT_B],
      ["file:b", FIT_C],
    ]);
    const uniqMap = new Map<string, number>([
      ["dir:root", UNIQ_A],
      ["file:a", UNIQ_B],
      ["file:b", UNIQ_C],
    ]);
    const result = collectSubtree("dir:root", nodes, fitMap, uniqMap);
    const EXPECTED_FIT_COUNT = 3;
    const EXPECTED_UNIQ_COUNT = 3;
    expect(result.childrenFitValues).toHaveLength(EXPECTED_FIT_COUNT);
    expect(result.childrenUniqValues).toHaveLength(EXPECTED_UNIQ_COUNT);
    expect(result.childrenFitValues).toContain(FIT_A);
    expect(result.childrenFitValues).toContain(FIT_B);
    expect(result.childrenFitValues).toContain(FIT_C);
  });
});

describe("descendantScores self exclusion", () => {
  it("excludes self from subtree values", () => {
    const sub = {
      childrenFitValues: [FIT_A, FIT_B, FIT_C],
      childrenUniqValues: [UNIQ_A, UNIQ_B, UNIQ_C],
    };
    const result = descendantScores(sub, FIT_A, UNIQ_A);
    const expectedFit = (FIT_B + FIT_C) / TWO;
    const expectedUniq = (UNIQ_B + UNIQ_C) / TWO;
    expect(result.subtreeFit).toBeCloseTo(expectedFit, TOLERANCE);
    expect(result.subtreeUniqueness).toBeCloseTo(expectedUniq, TOLERANCE);
  });

  it("falls back to localFit when no descendants", () => {
    const sub = {
      childrenFitValues: [FIT_A],
      childrenUniqValues: [UNIQ_A],
    };
    const result = descendantScores(sub, FIT_A, UNIQ_A);
    expect(result.subtreeFit).toBe(FIT_A);
  });
});

describe("descendantScores no-siblings", () => {
  it("returns null when no uniqueness data", () => {
    const sub = {
      childrenFitValues: [FIT_A],
      childrenUniqValues: [],
    };
    const result = descendantScores(sub, FIT_A, NO_SIBLINGS);
    expect(result.subtreeUniqueness).toBeNull();
  });

  it("falls back to null when localFit is null and no data", () => {
    const sub = {
      childrenFitValues: [],
      childrenUniqValues: [],
    };
    const result = descendantScores(sub, null, NO_SIBLINGS);
    expect(result.subtreeFit).toBeNull();
    expect(result.subtreeUniqueness).toBeNull();
  });
});

describe("collectSubtree — pattern node exclusion", () => {
  /** Builds a minimal pattern node. */
  function makePattern(key: string, name: string, childKeys: string[]): [string, PatternNode] {
    return [key, { ...baseProps(key, name, false), kind: "pattern", childKeys }];
  }

  it("excludes pattern node self-scores from subtree aggregation", () => {
    // file -> pattern -> [leafA, leafB]
    const leafA = makeLeaf("func:a", "a");
    const leafB = makeLeaf("func:b", "b");
    const pattern = makePattern("pattern:f:grp", "grp", ["func:a", "func:b"]);
    const file = makeFile("file:f", "f.ts", ["pattern:f:grp"], false);

    const nodes = toNodeMap(file, pattern, leafA, leafB);

    const PATTERN_FIT = 0.99;
    const PATTERN_UNIQ = 0.95;
    const FILE_FIT = 0.7;
    const FILE_UNIQ = 0.6;

    const fitMap = new Map<string, number | null>([
      ["file:f", FILE_FIT],
      ["pattern:f:grp", PATTERN_FIT],
    ]);
    const uniqMap = new Map<string, number>([
      ["file:f", FILE_UNIQ],
      ["pattern:f:grp", PATTERN_UNIQ],
    ]);

    const result = collectSubtree("file:f", nodes, fitMap, uniqMap);

    // Pattern node's own scores should NOT appear in the arrays
    expect(result.childrenFitValues).not.toContain(PATTERN_FIT);
    expect(result.childrenUniqValues).not.toContain(PATTERN_UNIQ);

    // File's own scores should appear
    expect(result.childrenFitValues).toContain(FILE_FIT);
    expect(result.childrenUniqValues).toContain(FILE_UNIQ);
  });
});
