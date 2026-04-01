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
  makeFile,
  makeFormatCtx,
  makeFunction,
  suppress,
  toNodeMap,
} from "../../../tests/helpers/audits.ts";
import { createContext } from "../context.ts";
import mergeCandidates from "./merge-candidates.ts";
const CONFIG = {
  sensitivity: SENSITIVITY,
  containmentFloor: CONTAINMENT_FLOOR,
  minGroup: MIN_GROUP,
};

const EMB_NEAR_A = [E095, E005, E0, E0, E0, E0];
const EMB_NEAR_B = [E094, E006, E0, E0, E0, E0];
const EMB_DISTANT = [E0, E0, E1, E0, E0, E0];
const EMB_SPREAD_C = [E0, E0, E0, E1, E0, E0];
const EMB_SPREAD_D = [E0, E0, E0, E0, E1, E0];
const EMB_SPREAD_E = [E0, E0, E0, E0, E0, E1];

describe("merge-candidates detect — empty and single", () => {
  test("returns empty for empty node map", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, CONFIG);
    const findings = mergeCandidates.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("returns empty for single node", () => {
    const fn = makeFunction({ leaf: EMB_NEAR_A });
    const file = makeFile({ childKeys: [fn.key] });
    fn.parentKey = file.key;
    const nodes = toNodeMap(file, fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = mergeCandidates.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("merge-candidates detect — near-duplicate siblings", () => {
  test("flags near-duplicate siblings above fence", () => {
    const fnA = makeFunction({ key: "func:/src/a.ts:fnA", name: "fnA", leaf: EMB_NEAR_A });
    const fnB = makeFunction({ key: "func:/src/a.ts:fnB", name: "fnB", leaf: EMB_NEAR_B });
    const fnC = makeFunction({ key: "func:/src/a.ts:fnC", name: "fnC", leaf: EMB_DISTANT });
    const fnD = makeFunction({ key: "func:/src/a.ts:fnD", name: "fnD", leaf: EMB_SPREAD_C });
    const fnE = makeFunction({ key: "func:/src/a.ts:fnE", name: "fnE", leaf: EMB_SPREAD_D });
    const fnF = makeFunction({ key: "func:/src/a.ts:fnF", name: "fnF", leaf: EMB_SPREAD_E });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key, fnC.key, fnD.key, fnE.key, fnF.key],
    });
    for (const fn of [fnA, fnB, fnC, fnD, fnE, fnF]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fnA, fnB, fnC, fnD, fnE, fnF);
    const ctx = createContext(nodes, CONFIG);
    const findings = mergeCandidates.detect(ctx);

    const pairKeys = findings.map((f) => [f.key, f.pairKey]).flat();
    expect(pairKeys).toContain(fnA.key);
    expect(pairKeys).toContain(fnB.key);
  });

  test("does not flag distant siblings", () => {
    const fnA = makeFunction({ key: "func:/src/a.ts:fnA", name: "fnA", leaf: EMB_DISTANT });
    const fnB = makeFunction({ key: "func:/src/a.ts:fnB", name: "fnB", leaf: EMB_SPREAD_C });
    const fnC = makeFunction({ key: "func:/src/a.ts:fnC", name: "fnC", leaf: EMB_SPREAD_D });
    const fnD = makeFunction({ key: "func:/src/a.ts:fnD", name: "fnD", leaf: EMB_SPREAD_E });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key, fnC.key, fnD.key],
    });
    for (const fn of [fnA, fnB, fnC, fnD]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fnA, fnB, fnC, fnD);
    const ctx = createContext(nodes, CONFIG);
    const findings = mergeCandidates.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("merge-candidates detect — caller-callee exclusion", () => {
  test("excludes caller-callee pairs", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_NEAR_A,
      calls: ["fnB"],
    });
    const fnB = makeFunction({ key: "func:/src/a.ts:fnB", name: "fnB", leaf: EMB_NEAR_B });
    const fnC = makeFunction({ key: "func:/src/a.ts:fnC", name: "fnC", leaf: EMB_DISTANT });
    const fnD = makeFunction({ key: "func:/src/a.ts:fnD", name: "fnD", leaf: EMB_SPREAD_C });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key, fnC.key, fnD.key],
    });
    for (const fn of [fnA, fnB, fnC, fnD]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fnA, fnB, fnC, fnD);
    const ctx = createContext(nodes, CONFIG);
    const findings = mergeCandidates.detect(ctx);
    const hasAB = findings.some((f) => f.key === fnA.key && f.pairKey === fnB.key);

    expect(hasAB).toBe(false);
  });
});

describe("merge-candidates detect — suppression", () => {
  test("respects suppression on first node", () => {
    const fnA = makeFunction({
      key: "func:/src/a.ts:fnA",
      name: "fnA",
      leaf: EMB_NEAR_A,
      residuals: [suppress("merge-candidates")],
    });
    const fnB = makeFunction({ key: "func:/src/a.ts:fnB", name: "fnB", leaf: EMB_NEAR_B });
    const fnC = makeFunction({ key: "func:/src/a.ts:fnC", name: "fnC", leaf: EMB_DISTANT });
    const fnD = makeFunction({ key: "func:/src/a.ts:fnD", name: "fnD", leaf: EMB_SPREAD_C });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key, fnC.key, fnD.key],
    });
    for (const fn of [fnA, fnB, fnC, fnD]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fnA, fnB, fnC, fnD);
    const ctx = createContext(nodes, CONFIG);
    const findings = mergeCandidates.detect(ctx);
    const hasA = findings.some((f) => f.key === fnA.key);

    expect(hasA).toBe(false);
  });

  test("respects suppression on second node", () => {
    const fnA = makeFunction({ key: "func:/src/a.ts:fnA", name: "fnA", leaf: EMB_NEAR_A });
    const fnB = makeFunction({
      key: "func:/src/a.ts:fnB",
      name: "fnB",
      leaf: EMB_NEAR_B,
      residuals: [suppress("merge-candidates")],
    });
    const fnC = makeFunction({ key: "func:/src/a.ts:fnC", name: "fnC", leaf: EMB_DISTANT });
    const fnD = makeFunction({ key: "func:/src/a.ts:fnD", name: "fnD", leaf: EMB_SPREAD_C });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key, fnC.key, fnD.key],
    });
    for (const fn of [fnA, fnB, fnC, fnD]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fnA, fnB, fnC, fnD);
    const ctx = createContext(nodes, CONFIG);
    const findings = mergeCandidates.detect(ctx);
    const hasAB = findings.some((f) => f.key === fnA.key && f.pairKey === fnB.key);

    expect(hasAB).toBe(false);
  });
});

describe("merge-candidates format", () => {
  test("includes pair label in heading", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "merge-candidates",
        key: "func:/src/a.ts:fnA",
        name: "fnA",
        hash: "abcd1234",
        pairKey: "func:/src/a.ts:fnB",
        pairName: "fnB",
        value: E095,
      },
      label: "fnA",
      location: " in a.ts",
      labelNode: (k: string): string => k.split(":").pop() ?? k,
    });
    const result = mergeCandidates.format(fctx);

    expect(result.heading).toContain("fnA");
    expect(result.heading).toContain("fnB");
    expect(result.heading).toContain("near-duplicates");
  });

  test("includes similarity percentage in details", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "merge-candidates",
        key: "k1",
        name: "a",
        hash: "12345678",
        pairKey: "k2",
        pairName: "b",
        value: E095,
      },
      label: "a",
      labelNode: (k: string): string => k,
    });
    const result = mergeCandidates.format(fctx);

    expect(result.details[NONE]).toContain("95%");
  });

  test("uses pairName when pairKey is undefined", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "merge-candidates",
        key: "k1",
        name: "a",
        hash: "12345678",
        pairKey: undefined,
        pairName: "fallbackName",
        value: E09,
      },
      label: "a",
    });
    const result = mergeCandidates.format(fctx);

    expect(result.heading).toContain("fallbackName");
  });
});

describe("merge-candidates detect — file-level pairs", () => {
  test("uses fileMergeFence for directory-level sibling pairs", () => {
    const fileA = makeFile({
      key: "file:/src/a.ts",
      name: "a.ts",
      leaf: [E095, E005, E0, E0, E0, E0],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      name: "b.ts",
      leaf: [E094, E006, E0, E0, E0, E0],
    });
    const fileC = makeFile({
      key: "file:/src/c.ts",
      name: "c.ts",
      leaf: [E0, E0, E1, E0, E0, E0],
    });
    const fileD = makeFile({
      key: "file:/src/d.ts",
      name: "d.ts",
      leaf: [E0, E0, E0, E1, E0, E0],
    });
    const dir = {
      key: "dir:/src",
      kind: "directory" as const,
      name: "src",
      identity: [],
      leaf: [],
      childKeys: [fileA.key, fileB.key, fileC.key, fileD.key],
      parentKey: null,
      patterns: null,
      companion: null,
      util: false,
      helper: false,
      residuals: [],
      hash: "dir12345",
      exported: false,
      description: undefined,
      bound: null,
    };
    for (const f of [fileA, fileB, fileC, fileD]) {
      f.parentKey = dir.key;
    }
    const nodes = toNodeMap(dir, fileA, fileB, fileC, fileD);
    const ctx = createContext(nodes, CONFIG);
    const findings = mergeCandidates.detect(ctx);

    const pairKeys = findings.map((f) => [f.key, f.pairKey]).flat();
    expect(pairKeys).toContain(fileA.key);
    expect(pairKeys).toContain(fileB.key);
  });
});

describe("merge-candidates detect — sorted by descending similarity", () => {
  test("findings are sorted highest similarity first", () => {
    const fnA = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_NEAR_A });
    const fnB = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_NEAR_B });
    const fnC = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: EMB_DISTANT });
    const fnD = makeFunction({ key: "func:/src/a.ts:d", name: "d", leaf: EMB_SPREAD_C });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key, fnC.key, fnD.key],
    });
    for (const fn of [fnA, fnB, fnC, fnD]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fnA, fnB, fnC, fnD);
    const ctx = createContext(nodes, CONFIG);
    const findings = mergeCandidates.detect(ctx);

    for (let i = ONE; i < findings.length; i++) {
      const prev = findings[i - ONE].value ?? NONE;
      const curr = findings[i].value ?? NONE;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});
