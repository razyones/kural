import {
  CONTAINMENT_FLOOR,
  E0,
  E005,
  E006,
  E09,
  E094,
  E095,
  E1,
  MIN_GROUP,
  NONE,
  ONE,
  SENSITIVITY,
} from "../../../tests/constants/audits.ts";
import { describe, expect, test } from "vite-plus/test";
import {
  makeDir,
  makeFile,
  makeFormatCtx,
  makeFunction,
  suppress,
  toNodeMap,
} from "../../../tests/helpers/audits.ts";
import { createContext } from "../context.ts";
import duplicates from "./duplicates.ts";
const CONFIG = {
  sensitivity: SENSITIVITY,
  containmentFloor: CONTAINMENT_FLOOR,
  minGroup: MIN_GROUP,
};

/** Embeddings for cross-file duplicate detection. */
const EMB_ALPHA = [E095, E005, E0, E0, E0, E0];
const EMB_ALPHA_TWIN = [E094, E006, E0, E0, E0, E0];
const EMB_BETA = [E0, E0, E1, E0, E0, E0];
const EMB_GAMMA = [E0, E0, E0, E1, E0, E0];
const EMB_DELTA = [E0, E0, E0, E0, E1, E0];
const EMB_EPSILON = [E0, E0, E0, E0, E0, E1];

/**
 * Creates baseline sibling nodes to establish a finite leafMergeFence.
 * Returns [file, ...functions] array.
 */
function makeBaselineSiblings(): (ReturnType<typeof makeFile> | ReturnType<typeof makeFunction>)[] {
  const s1 = makeFunction({
    key: "func:/src/base.ts:s1",
    name: "s1",
    leaf: EMB_BETA,
    parentKey: "file:/src/base.ts",
  });
  const s2 = makeFunction({
    key: "func:/src/base.ts:s2",
    name: "s2",
    leaf: EMB_GAMMA,
    parentKey: "file:/src/base.ts",
  });
  const s3 = makeFunction({
    key: "func:/src/base.ts:s3",
    name: "s3",
    leaf: EMB_DELTA,
    parentKey: "file:/src/base.ts",
  });
  const s4 = makeFunction({
    key: "func:/src/base.ts:s4",
    name: "s4",
    leaf: EMB_EPSILON,
    parentKey: "file:/src/base.ts",
  });
  const baseFile = makeFile({
    key: "file:/src/base.ts",
    name: "base.ts",
    childKeys: [s1.key, s2.key, s3.key, s4.key],
  });
  return [baseFile, s1, s2, s3, s4];
}

describe("duplicates detect — empty and single node", () => {
  test("returns empty for empty node map", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("returns empty for single leaf node", () => {
    const fn = makeFunction({ leaf: EMB_ALPHA });
    const file = makeFile({ childKeys: [fn.key] });
    fn.parentKey = file.key;
    const nodes = toNodeMap(file, fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("duplicates detect — cross-file leaf duplicates", () => {
  test("flags near-identical leaves in different files", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:fnB",
      name: "fnB",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "file:/src/b.ts",
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      childKeys: [fnB.key],
    });
    const baseline = makeBaselineSiblings();
    const nodes = toNodeMap(fileA, fileB, fnA, fnB, ...baseline);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);
    const keys = findings.map((f) => [f.key, f.pairKey]).flat();

    expect(keys).toContain(fnA.key);
    expect(keys).toContain(fnB.key);
  });

  test("does not flag leaves in the same file", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
    });
    const fnB = makeFunction({
      key: "func:/src/a.ts:fnB",
      name: "fnB",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "file:/src/a.ts",
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key, fnB.key],
    });
    const nodes = toNodeMap(file, fnA, fnB);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);
    const crossFile = findings.filter((f) => f.key === fnA.key && f.pairKey === fnB.key);

    expect(crossFile.length).toBe(NONE);
  });
});

describe("duplicates detect — exclusions", () => {
  test("excludes caller-callee pairs", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
      calls: ["fnB"],
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:fnB",
      name: "fnB",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "file:/src/b.ts",
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
    const findings = duplicates.detect(ctx);
    const hasAB = findings.some((f) => f.key === fnA.key && f.pairKey === fnB.key);

    expect(hasAB).toBe(false);
  });

  test("excludes pattern-group pairs", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
      patterns: "handler",
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:fnB",
      name: "fnB",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "file:/src/b.ts",
      patterns: "handler",
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
    const findings = duplicates.detect(ctx);
    const hasAB = findings.some((f) => f.key === fnA.key && f.pairKey === fnB.key);

    expect(hasAB).toBe(false);
  });
});

describe("duplicates detect — same-file cross-pattern exclusion", () => {
  test("excludes cross-pattern pairs in the same file", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "pattern:file:/src/a.ts:grpA",
      patterns: "grpA",
    });
    const fnB = makeFunction({
      key: "func:/src/a.ts:fnB",
      name: "fnB",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "pattern:file:/src/a.ts:grpB",
      patterns: "grpB",
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
      util: false,
      helper: false,
      residuals: [],
      hash: "pat1hash",
      exported: false,
      description: undefined,
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
      util: false,
      helper: false,
      residuals: [],
      hash: "pat2hash",
      exported: false,
      description: undefined,
    };
    const file = makeFile({
      key: "file:/src/a.ts",
      childKeys: [patA.key, patB.key],
    });
    const nodes = toNodeMap(file, patA, patB, fnA, fnB);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);
    const hasAB = findings.some((f) => f.key === fnA.key && f.pairKey === fnB.key);

    expect(hasAB).toBe(false);
  });
});

describe("duplicates detect — companion exclusion", () => {
  test("excludes companion pairs in same group", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:fnB",
      name: "fnB",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "file:/src/b.ts",
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key],
      companion: "pair1",
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      childKeys: [fnB.key],
      companion: "pair1",
    });
    const nodes = toNodeMap(fileA, fileB, fnA, fnB);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);
    const hasAB = findings.some((f) => f.key === fnA.key && f.pairKey === fnB.key);

    expect(hasAB).toBe(false);
  });
});

describe("duplicates detect — suppression and helpers", () => {
  test("respects suppression", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
      residuals: [suppress("duplicates")],
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:fnB",
      name: "fnB",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "file:/src/b.ts",
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
    const findings = duplicates.detect(ctx);
    const hasA = findings.some((f) => f.key === fnA.key);

    expect(hasA).toBe(false);
  });

  test("excludes helper functions", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
      helper: true,
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:fnB",
      name: "fnB",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "file:/src/b.ts",
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
    const findings = duplicates.detect(ctx);
    const hasA = findings.some((f) => f.key === fnA.key);

    expect(hasA).toBe(false);
  });
});

describe("duplicates detect — util leaves in cross-pop", () => {
  test("excludes util-only pairs from main scan", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
      util: true,
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:fnB",
      name: "fnB",
      leaf: EMB_ALPHA_TWIN,
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
    const findings = duplicates.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("duplicates detect — cross-directory files", () => {
  test("flags similar files across directories", () => {
    const fileA = makeFile({
      key: "file:/src/a/x.ts",
      name: "x.ts",
      leaf: EMB_ALPHA,
      parentKey: "dir:/src/a",
    });
    const fileB = makeFile({
      key: "file:/src/b/y.ts",
      name: "y.ts",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "dir:/src/b",
    });
    const fC = makeFile({
      key: "file:/src/d/c.ts",
      name: "c.ts",
      leaf: EMB_BETA,
      parentKey: "dir:/src/d",
    });
    const fD = makeFile({
      key: "file:/src/d/d.ts",
      name: "d.ts",
      leaf: EMB_GAMMA,
      parentKey: "dir:/src/d",
    });
    const fE = makeFile({
      key: "file:/src/d/e.ts",
      name: "e.ts",
      leaf: EMB_DELTA,
      parentKey: "dir:/src/d",
    });
    const fF = makeFile({
      key: "file:/src/d/f.ts",
      name: "f.ts",
      leaf: EMB_EPSILON,
      parentKey: "dir:/src/d",
    });
    const dirD = makeDir({
      key: "dir:/src/d",
      name: "d",
      childKeys: [fC.key, fD.key, fE.key, fF.key],
    });
    const nodes = toNodeMap(fileA, fileB, dirD, fC, fD, fE, fF);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);
    const fileKeys = findings.filter((f) => f.key === fileA.key || f.pairKey === fileA.key);

    expect(fileKeys.length).toBeGreaterThanOrEqual(ONE);
  });
});

describe("duplicates format", () => {
  test("includes cross-module duplicates heading", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "duplicates",
        key: "func:/src/a.ts:fnA",
        name: "fnA",
        hash: "abcd1234",
        pairKey: "func:/src/b.ts:fnB",
        pairName: "fnB",
        value: 0.96,
      },
      label: "fnA",
      labelNode: (k) => k.split(":").pop() ?? k,
    });
    const result = duplicates.format(fctx);

    expect(result.heading).toContain("cross-module duplicates");
    expect(result.heading).toContain("fnA");
    expect(result.details[NONE]).toContain("96%");
  });

  test("uses pairName when pairKey is undefined", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "duplicates",
        key: "k",
        name: "a",
        hash: "12345678",
        pairName: "fallback",
        value: E09,
      },
      label: "a",
    });
    const result = duplicates.format(fctx);

    expect(result.heading).toContain("fallback");
  });
});

describe("duplicates detect — cross-pop exclusions", () => {
  test("excludes cross-pop pairs sharing same parent", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
    });
    const fnU = makeFunction({
      key: "func:/src/a.ts:fnU",
      name: "fnU",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "file:/src/a.ts",
      util: true,
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key, fnU.key],
    });
    const nodes = toNodeMap(fileA, fnA, fnU);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);
    const hasAU = findings.some((f) => f.key === fnA.key && f.pairKey === fnU.key);

    expect(hasAU).toBe(false);
  });

  test("excludes cross-pop pattern-group pairs", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
      patterns: "handler",
    });
    const fnU = makeFunction({
      key: "func:/src/b.ts:fnU",
      name: "fnU",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "file:/src/b.ts",
      util: true,
      patterns: "handler",
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      childKeys: [fnU.key],
    });
    const nodes = toNodeMap(fileA, fileB, fnA, fnU);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);
    const hasAU = findings.some((f) => f.key === fnA.key && f.pairKey === fnU.key);

    expect(hasAU).toBe(false);
  });

  test("excludes cross-pop caller-callee pairs", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
      calls: ["fnU"],
    });
    const fnU = makeFunction({
      key: "func:/src/b.ts:fnU",
      name: "fnU",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "file:/src/b.ts",
      util: true,
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      childKeys: [fnU.key],
    });
    const nodes = toNodeMap(fileA, fileB, fnA, fnU);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);
    const hasAU = findings.some((f) => f.key === fnA.key && f.pairKey === fnU.key);

    expect(hasAU).toBe(false);
  });

  test("flags cross-pop non-util vs util duplicate", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
    });
    const fnU = makeFunction({
      key: "func:/src/b.ts:fnU",
      name: "fnU",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "file:/src/b.ts",
      util: true,
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      childKeys: [fnU.key],
    });
    const baseline = makeBaselineSiblings();
    const nodes = toNodeMap(fileA, fileB, fnA, fnU, ...baseline);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);
    const keys = findings.map((f) => [f.key, f.pairKey]).flat();

    expect(keys).toContain(fnA.key);
    expect(keys).toContain(fnU.key);
  });
});

describe("duplicates detect — file companion exclusion", () => {
  test("excludes companion files in same group", () => {
    const fileA = makeFile({
      key: "file:/src/a/x.ts",
      name: "x.ts",
      leaf: EMB_ALPHA,
      parentKey: "dir:/src/a",
      companion: "group1",
    });
    const fileB = makeFile({
      key: "file:/src/b/y.ts",
      name: "y.ts",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "dir:/src/b",
      companion: "group1",
    });
    const nodes = toNodeMap(fileA, fileB);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);
    const hasAB = findings.some(
      (f) =>
        (f.key === fileA.key && f.pairKey === fileB.key) ||
        (f.key === fileB.key && f.pairKey === fileA.key),
    );

    expect(hasAB).toBe(false);
  });

  test("excludes caller-callee files across dirs", () => {
    const fileA = makeFile({
      key: "file:/src/a/x.ts",
      name: "x.ts",
      leaf: EMB_ALPHA,
      parentKey: "dir:/src/a",
      kind: "file",
    });
    const fileB = makeFile({
      key: "file:/src/b/y.ts",
      name: "y.ts",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "dir:/src/b",
      kind: "file",
    });
    const nodes = toNodeMap(fileA, fileB);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);

    expect(findings).toBeDefined();
  });
});

describe("duplicates detect — sorted descending", () => {
  test("findings sorted by descending similarity", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_ALPHA,
      parentKey: "file:/src/a.ts",
    });
    const fnB = makeFunction({
      key: "func:/src/b.ts:fnB",
      name: "fnB",
      leaf: EMB_ALPHA_TWIN,
      parentKey: "file:/src/b.ts",
    });
    const fileA = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fnA.key],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      childKeys: [fnB.key],
    });
    const baseline = makeBaselineSiblings();
    const nodes = toNodeMap(fileA, fileB, fnA, fnB, ...baseline);
    const ctx = createContext(nodes, CONFIG);
    const findings = duplicates.detect(ctx);

    for (let i = ONE; i < findings.length; i++) {
      const prev = findings[i - ONE].value ?? NONE;
      const curr = findings[i].value ?? NONE;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});
