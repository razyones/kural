import {
  CONTAINMENT_FLOOR,
  E0,
  E005,
  E006,
  E094,
  E095,
  E1,
  MIN_GROUP,
  NONE,
  ONE,
  SENSITIVITY,
} from "../../../../tests/constants/audits.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeFile, makeFunction, suppress, toNodeMap } from "../../../../tests/helpers/audits.ts";
import { createContext } from "../context.ts";
import { utilDuplicates as duplicateUtils } from "./duplicates.ts";
const CONFIG = {
  sensitivity: SENSITIVITY,
  containmentFloor: CONTAINMENT_FLOOR,
  minGroup: MIN_GROUP,
};

/** Embeddings for util duplicate detection. */
const EMB_UTIL_A = [E095, E005, E0, E0, E0, E0];
const EMB_UTIL_B = [E094, E006, E0, E0, E0, E0];
const EMB_FAR = [E0, E0, E1, E0, E0, E0];
const EMB_MID = [E0, E0, E0, E1, E0, E0];
const EMB_LOW_A = [E0, E0, E0, E0, E1, E0];
const EMB_LOW_B = [E0, E0, E0, E0, E0, E1];

/**
 * Creates a tree with non-util siblings to establish a baseline leaf fence.
 * Returns nodes that should be merged with test-specific nodes.
 */
function makeBaselineNodes(): ReturnType<typeof makeFunction>[] {
  const s1 = makeFunction({
    key: "func:/src/base.ts:s1",
    name: "s1",
    leaf: EMB_FAR,
    parentKey: "file:/src/base.ts",
  });
  const s2 = makeFunction({
    key: "func:/src/base.ts:s2",
    name: "s2",
    leaf: EMB_MID,
    parentKey: "file:/src/base.ts",
  });
  const s3 = makeFunction({
    key: "func:/src/base.ts:s3",
    name: "s3",
    leaf: EMB_LOW_A,
    parentKey: "file:/src/base.ts",
  });
  const s4 = makeFunction({
    key: "func:/src/base.ts:s4",
    name: "s4",
    leaf: EMB_LOW_B,
    parentKey: "file:/src/base.ts",
  });
  return [s1, s2, s3, s4];
}

/** Creates the baseline file node containing sibling functions. */
function makeBaselineFile(
  siblings: ReturnType<typeof makeFunction>[],
): ReturnType<typeof makeFile> {
  return makeFile({
    key: "file:/src/base.ts",
    name: "base.ts",
    childKeys: siblings.map((s) => s.key),
  });
}

describe("duplicate-utils detect — empty and single", () => {
  test("returns empty for empty node map", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicateUtils.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("returns empty for single util leaf", () => {
    const fn = makeFunction({ leaf: EMB_UTIL_A, util: true });
    const file = makeFile({ childKeys: [fn.key] });
    fn.parentKey = file.key;
    const nodes = toNodeMap(file, fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicateUtils.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("duplicate-utils detect — cross-file util duplicates", () => {
  test("flags similar utils in different files", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:utilA",
      name: "utilA",
      leaf: EMB_UTIL_A,
      parentKey: "file:/src/a.ts",
      util: true,
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:utilB",
      name: "utilB",
      leaf: EMB_UTIL_B,
      parentKey: "file:/src/b.ts",
      util: true,
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      childKeys: [fnB.key],
    });
    const siblings = makeBaselineNodes();
    const baseFile = makeBaselineFile(siblings);
    const nodes = toNodeMap(fileA, fileB, fnA, fnB, baseFile, ...siblings);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicateUtils.detect(ctx);
    const keys = findings.map((f) => [f.key, f.pairKey]).flat();

    expect(keys).toContain(fnA.key);
    expect(keys).toContain(fnB.key);
  });

  test("does not flag utils in the same file", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:utilA",
      name: "utilA",
      leaf: EMB_UTIL_A,
      parentKey: "file:/src/a.ts",
      util: true,
    });
    const fnB = makeFunction({
      key: "func:/src/a.ts:utilB",
      name: "utilB",
      leaf: EMB_UTIL_B,
      parentKey: "file:/src/a.ts",
      util: true,
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key, fnB.key],
    });
    const nodes = toNodeMap(file, fnA, fnB);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicateUtils.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("duplicate-utils detect — exclusions", () => {
  test("excludes pattern-group pairs", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:utilA",
      name: "utilA",
      leaf: EMB_UTIL_A,
      parentKey: "file:/src/a.ts",
      util: true,
      patterns: ["validator"],
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:utilB",
      name: "utilB",
      leaf: EMB_UTIL_B,
      parentKey: "file:/src/b.ts",
      util: true,
      patterns: ["validator"],
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      childKeys: [fnB.key],
    });
    const nodes = toNodeMap(fileA, fileB, fnA, fnB);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicateUtils.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("excludes cross-pattern pairs in the same file", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:utilA",
      name: "utilA",
      leaf: EMB_UTIL_A,
      parentKey: "pattern:file:/src/a.ts:grpA",
      util: true,
      patterns: ["grpA"],
    });
    const fnB = makeFunction({
      key: "func:/src/a.ts:utilB",
      name: "utilB",
      leaf: EMB_UTIL_B,
      parentKey: "pattern:file:/src/a.ts:grpB",
      util: true,
      patterns: ["grpB"],
    });
    const patA = {
      key: "pattern:file:/src/a.ts:grpA",
      kind: "pattern" as const,
      name: "grpA",
      identity: [],
      leaf: [],
      childKeys: [fnA.key],
      parentKey: "file:/src/a.ts",
      patterns: null,
      companion: null,
      util: true,
      helper: false,
      residuals: [],
      hash: "pat1hash",
      exported: false,
      description: undefined,
      bound: null,
    };
    const patB = {
      key: "pattern:file:/src/a.ts:grpB",
      kind: "pattern" as const,
      name: "grpB",
      identity: [],
      leaf: [],
      childKeys: [fnB.key],
      parentKey: "file:/src/a.ts",
      patterns: null,
      companion: null,
      util: true,
      helper: false,
      residuals: [],
      hash: "pat2hash",
      exported: false,
      description: undefined,
      bound: null,
    };
    const file = makeFile({
      key: "file:/src/a.ts",
      childKeys: [patA.key, patB.key],
    });
    const siblings = makeBaselineNodes();
    const baseFile = makeBaselineFile(siblings);
    const nodes = toNodeMap(file, patA, patB, fnA, fnB, baseFile, ...siblings);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicateUtils.detect(ctx);
    const hasAB = findings.some(
      (f) =>
        (f.key === fnA.key && f.pairKey === fnB.key) ||
        (f.key === fnB.key && f.pairKey === fnA.key),
    );

    expect(hasAB).toBe(false);
  });

  test("excludes caller-callee pairs", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:utilA",
      name: "utilA",
      leaf: EMB_UTIL_A,
      parentKey: "file:/src/a.ts",
      util: true,
      calls: ["utilB"],
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:utilB",
      name: "utilB",
      leaf: EMB_UTIL_B,
      parentKey: "file:/src/b.ts",
      util: true,
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      childKeys: [fnB.key],
    });
    const nodes = toNodeMap(fileA, fileB, fnA, fnB);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicateUtils.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("duplicate-utils detect — suppression", () => {
  test("respects suppression on either node", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:utilA",
      name: "utilA",
      leaf: EMB_UTIL_A,
      parentKey: "file:/src/a.ts",
      util: true,
      residuals: [suppress("util-duplicates")],
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:utilB",
      name: "utilB",
      leaf: EMB_UTIL_B,
      parentKey: "file:/src/b.ts",
      util: true,
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      childKeys: [fnB.key],
    });
    const siblings = makeBaselineNodes();
    const baseFile = makeBaselineFile(siblings);
    const nodes = toNodeMap(fileA, fileB, fnA, fnB, baseFile, ...siblings);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicateUtils.detect(ctx);
    const hasA = findings.some((f) => f.key === fnA.key);

    expect(hasA).toBe(false);
  });
});

describe("duplicate-utils detect — non-util excluded", () => {
  test("ignores non-util leaves", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_UTIL_A,
      parentKey: "file:/src/a.ts",
      util: false,
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:fnB",
      name: "fnB",
      leaf: EMB_UTIL_B,
      parentKey: "file:/src/b.ts",
      util: false,
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      childKeys: [fnB.key],
    });
    const nodes = toNodeMap(fileA, fileB, fnA, fnB);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicateUtils.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("duplicate-utils detect — sorted descending", () => {
  test("findings sorted by descending similarity", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:uA",
      name: "uA",
      leaf: EMB_UTIL_A,
      parentKey: "file:/src/a.ts",
      util: true,
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:uB",
      name: "uB",
      leaf: EMB_UTIL_B,
      parentKey: "file:/src/b.ts",
      util: true,
    });
    const fnC = makeFunction({
      key: "func:/src/c.ts:uC",
      name: "uC",
      leaf: EMB_FAR,
      parentKey: "file:/src/c.ts",
      util: true,
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      childKeys: [fnB.key],
    });
    const fileC = makeFile({
      key: "file:/src/c.ts",
      childKeys: [fnC.key],
    });
    const siblings = makeBaselineNodes();
    const baseFile = makeBaselineFile(siblings);
    const nodes = toNodeMap(fileA, fileB, fileC, fnA, fnB, fnC, baseFile, ...siblings);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicateUtils.detect(ctx);

    for (let i = ONE; i < findings.length; i++) {
      const prev = findings[i - ONE].value ?? NONE;
      const curr = findings[i].value ?? NONE;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});
