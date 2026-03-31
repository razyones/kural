import type { CodeNode, DirectoryNode, FileNode, FunctionNode } from "../sost/tree.ts";
import { createContext, isSuppressed } from "./context.ts";
import { describe, expect, test } from "vite-plus/test";
import type { AuditsConfig } from "../config/audits.ts";

const NONE = 0;
const ONE = 1;
const SENSITIVITY = 2.0;
const CONTAINMENT_FLOOR = 0.9;
const MIN_GROUP = 4;

const EMB_A1 = 0.9;
const EMB_A2 = 0.1;
const EMB_A3 = 0.0;
const EMB_B1 = 0.1;
const EMB_B2 = 0.9;
const EMB_B3 = 0.0;

function makeConfig(overrides: Partial<AuditsConfig> = {}): AuditsConfig {
  return {
    sensitivity: SENSITIVITY,
    containmentFloor: CONTAINMENT_FLOOR,
    minGroup: MIN_GROUP,
    ...overrides,
  };
}

function makeFn(overrides: Partial<FunctionNode> = {}): FunctionNode {
  return {
    key: "func:/src/app.ts:fn",
    kind: "function",
    name: "fn",
    identity: [],
    leaf: [EMB_A1, EMB_A2, EMB_A3],
    childKeys: [],
    parentKey: "file:/src/app.ts",
    patterns: null,
    companion: null,
    util: false,
    helper: false,
    residuals: [],
    hash: "abc12345",
    exported: true,
    description: undefined,
    calls: [],
    returnsType: "void",
    documentedParams: NONE,
    hasReturnDoc: false,
    pure: false,
    causes: undefined,
    paramNames: [],
    paramTypes: [],
    ...overrides,
  };
}

function makeFile(overrides: Partial<FileNode> = {}): FileNode {
  return {
    key: "file:/src/app.ts",
    kind: "file",
    name: "app.ts",
    identity: [],
    leaf: [],
    childKeys: [],
    parentKey: "dir:/src",
    patterns: null,
    companion: null,
    util: false,
    helper: false,
    residuals: [],
    hash: "file1234",
    exported: false,
    description: undefined,
    ...overrides,
  };
}

function makeDir(overrides: Partial<DirectoryNode> = {}): DirectoryNode {
  return {
    key: "dir:/src",
    kind: "directory",
    name: "src",
    identity: [],
    leaf: [],
    childKeys: [],
    parentKey: null,
    patterns: null,
    companion: null,
    util: false,
    helper: false,
    residuals: [],
    hash: "dir12345",
    exported: false,
    description: undefined,
    ...overrides,
  };
}

function buildMap(nodes: CodeNode[]): Map<string, CodeNode> {
  const map = new Map<string, CodeNode>();
  for (const n of nodes) {
    map.set(n.key, n);
  }
  return map;
}

describe("createContext — basic properties", () => {
  test("exposes sensitivity from config", () => {
    const nodes = buildMap([]);
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.sensitivity).toBe(SENSITIVITY);
  });

  test("exposes containmentFloor from config", () => {
    const nodes = buildMap([]);
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.containmentFloor).toBe(CONTAINMENT_FLOOR);
  });

  test("exposes minGroup from config", () => {
    const nodes = buildMap([]);
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.minGroup).toBe(MIN_GROUP);
  });

  test("initializes outlierKeys as empty set", () => {
    const nodes = buildMap([]);
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.outlierKeys.size).toBe(NONE);
  });
});

describe("createContext — rootKey detection", () => {
  test("finds root directory node with null parentKey", () => {
    const dir = makeDir({ parentKey: null });
    const nodes = buildMap([dir]);
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.rootKey).toBe("dir:/src");
  });

  test("returns null when no root directory exists", () => {
    const file = makeFile();
    const nodes = buildMap([file]);
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.rootKey).toBeNull();
  });
});

describe("createContext — axisScores", () => {
  test("defaults axisScores to null", () => {
    const nodes = buildMap([]);
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.axisScores).toBeNull();
  });

  test("passes through provided axisScores", () => {
    const scores = { identity: ONE };
    const nodes = buildMap([]);
    const ctx = createContext(nodes, makeConfig(), scores);

    expect(ctx.axisScores).toBe(scores);
  });
});

describe("createContext — lazy siblingPairs", () => {
  test("computes sibling pairs lazily on access", () => {
    const fnA = makeFn({
      name: "a",
      key: "func:/src/app.ts:a",
      leaf: [EMB_A1, EMB_A2, EMB_A3],
    });
    const fnB = makeFn({
      name: "b",
      key: "func:/src/app.ts:b",
      leaf: [EMB_B1, EMB_B2, EMB_B3],
    });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key],
    });
    const nodes = buildMap([file, fnA, fnB]);
    const ctx = createContext(nodes, makeConfig());

    const pairs = ctx.siblingPairs;

    expect(pairs.length).toBe(ONE);
  });

  test("caches sibling pairs across accesses", () => {
    const fnA = makeFn({
      name: "a",
      key: "func:/src/app.ts:a",
      leaf: [EMB_A1, EMB_A2, EMB_A3],
    });
    const fnB = makeFn({
      name: "b",
      key: "func:/src/app.ts:b",
      leaf: [EMB_B1, EMB_B2, EMB_B3],
    });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key],
    });
    const nodes = buildMap([file, fnA, fnB]);
    const ctx = createContext(nodes, makeConfig());

    const first = ctx.siblingPairs;
    const second = ctx.siblingPairs;

    expect(first).toBe(second);
  });
});

describe("createContext — lazy fence values", () => {
  test("returns Infinity fences when too few pairs", () => {
    const nodes = buildMap([]);
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.leafMergeFence).toBe(Infinity);
    expect(ctx.fileMergeFence).toBe(Infinity);
  });
});

describe("isSuppressed — matching audit name", () => {
  test("returns true when residual matches audit without hash", () => {
    const node = makeFn({
      residuals: [{ audit: "outliers" }],
    });

    expect(isSuppressed(node, "outliers")).toBe(true);
  });

  test("returns true when residual hash matches node hash", () => {
    const node = makeFn({
      hash: "abc12345",
      residuals: [{ audit: "merge-candidates", hash: "abc12345" }],
    });

    expect(isSuppressed(node, "merge-candidates")).toBe(true);
  });
});

describe("isSuppressed — non-matching cases", () => {
  test("returns false when residual hash differs from node hash", () => {
    const node = makeFn({
      hash: "abc12345",
      residuals: [{ audit: "outliers", hash: "xxxxxxxx" }],
    });

    expect(isSuppressed(node, "outliers")).toBe(false);
  });

  test("returns false when audit name does not match", () => {
    const node = makeFn({
      residuals: [{ audit: "different-audit" }],
    });

    expect(isSuppressed(node, "outliers")).toBe(false);
  });

  test("returns false when residuals array is empty", () => {
    const node = makeFn({ residuals: [] });

    expect(isSuppressed(node, "outliers")).toBe(false);
  });
});

describe("isSuppressed — multiple residuals", () => {
  test("matches the correct audit among multiple residuals", () => {
    const node = makeFn({
      residuals: [{ audit: "other-audit" }, { audit: "target-audit" }],
    });

    expect(isSuppressed(node, "target-audit")).toBe(true);
    expect(isSuppressed(node, "other-audit")).toBe(true);
    expect(isSuppressed(node, "missing-audit")).toBe(false);
  });
});
