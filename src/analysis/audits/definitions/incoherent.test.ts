import {
  E0,
  E005,
  E01,
  E012,
  E013,
  E014,
  E015,
  E016,
  E017,
  E02,
  E022,
  E045,
  E078,
  E08,
  E083,
  E084,
  E085,
  E086,
  E087,
  E088,
  E09,
  E095,
  E1,
  NONE,
  SENSITIVITY,
} from "../../../../tests/constants/audits.ts";
import { describe, expect, test } from "vite-plus/test";
import { incoherent, incoherentUtils } from "./incoherent.ts";
import {
  makeFile,
  makeFormatCtx,
  makeFunction,
  suppress,
  toNodeMap,
} from "../../../../tests/helpers/audits.ts";
import type { CodeNode } from "../../tree/tree.ts";
import { createContext } from "../context.ts";
const CONFIG = {
  sensitivity: SENSITIVITY,
};

/** Identity and leaf embeddings for incoherence testing. */
const ID_AUTH = [E1, E0, E0];
const LEAF_AUTH = [E095, E005, E0];
const ID_MISMATCH = [E1, E0, E0];
const LEAF_MISMATCH = [E0, E0, E1];
const ID_NORM_A = [E09, E01, E0];
const LEAF_NORM_A = [E088, E012, E0];
const ID_NORM_B = [E085, E015, E0];
const LEAF_NORM_B = [E083, E017, E0];
const ID_NORM_C = [E08, E02, E0];
const LEAF_NORM_C = [E078, E022, E0];
const ID_NORM_D = [E087, E013, E0];
const LEAF_NORM_D = [E085, E015, E0];
const ID_NORM_E = [E086, E014, E0];
const LEAF_NORM_E = [E084, E016, E0];

/** Creates a good (coherent) file with two children for test fixtures. */
function makeGoodFile(
  idx: string,
  id: number[],
  leaf: number[],
  util = false,
): [ReturnType<typeof makeFile>, ReturnType<typeof makeFunction>, ReturnType<typeof makeFunction>] {
  const fn1 = makeFunction({
    key: `func:/src/${idx}.ts:fn${idx}a`,
    name: `fn${idx}a`,
  });
  const fn2 = makeFunction({
    key: `func:/src/${idx}.ts:fn${idx}b`,
    name: `fn${idx}b`,
  });
  const file = makeFile({
    key: `file:/src/${idx}.ts`,
    name: `${idx}.ts`,
    identity: id,
    leaf,
    childKeys: [fn1.key, fn2.key],
    util,
  });
  fn1.parentKey = file.key;
  fn2.parentKey = file.key;
  return [file, fn1, fn2];
}

describe("incoherent detect — empty and leaf-only", () => {
  test("returns empty for empty node map", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, CONFIG);
    const findings = incoherent.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("skips leaf nodes", () => {
    const fn = makeFunction({ identity: ID_AUTH, leaf: LEAF_AUTH });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incoherent.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("incoherent detect — mismatched container", () => {
  test("flags container with mismatched identity and leaf", () => {
    const fn1 = makeFunction({ key: "func:/src/bad.ts:a", name: "a" });
    const fn2 = makeFunction({ key: "func:/src/bad.ts:b", name: "b" });
    const badFile = makeFile({
      key: "file:/src/bad.ts",
      name: "bad.ts",
      identity: ID_MISMATCH,
      leaf: LEAF_MISMATCH,
      childKeys: [fn1.key, fn2.key],
    });
    fn1.parentKey = badFile.key;
    fn2.parentKey = badFile.key;
    const [gA, gfA, gfA2] = makeGoodFile("a", ID_NORM_A, LEAF_NORM_A);
    const [gB, gfB, gfB2] = makeGoodFile("b", ID_NORM_B, LEAF_NORM_B);
    const [gC, gfC, gfC2] = makeGoodFile("c", ID_NORM_C, LEAF_NORM_C);
    const [gD, gfD, gfD2] = makeGoodFile("d", ID_NORM_D, LEAF_NORM_D);
    const [gE, gfE, gfE2] = makeGoodFile("e", ID_NORM_E, LEAF_NORM_E);
    const nodes = toNodeMap(
      badFile,
      fn1,
      fn2,
      gA,
      gfA,
      gfA2,
      gB,
      gfB,
      gfB2,
      gC,
      gfC,
      gfC2,
      gD,
      gfD,
      gfD2,
      gE,
      gfE,
      gfE2,
    );
    const ctx = createContext(nodes, CONFIG);
    const findings = incoherent.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).toContain(badFile.key);
  });
});

describe("incoherent detect — suppression and util exclusion", () => {
  test("respects suppression", () => {
    const fn1 = makeFunction({ key: "func:/src/bad.ts:a", name: "a" });
    const fn2 = makeFunction({ key: "func:/src/bad.ts:b", name: "b" });
    const badFile = makeFile({
      key: "file:/src/bad.ts",
      identity: ID_MISMATCH,
      leaf: LEAF_MISMATCH,
      childKeys: [fn1.key, fn2.key],
      residuals: [suppress("incoherent")],
    });
    fn1.parentKey = badFile.key;
    fn2.parentKey = badFile.key;
    const [gA, gfA, gfA2] = makeGoodFile("a", ID_NORM_A, LEAF_NORM_A);
    const [gB, gfB, gfB2] = makeGoodFile("b", ID_NORM_B, LEAF_NORM_B);
    const nodes = toNodeMap(badFile, fn1, fn2, gA, gfA, gfA2, gB, gfB, gfB2);
    const ctx = createContext(nodes, CONFIG);
    const findings = incoherent.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain(badFile.key);
  });

  test("excludes util containers from non-util audit", () => {
    const fn1 = makeFunction({ key: "func:/src/u.ts:a", name: "a" });
    const fn2 = makeFunction({ key: "func:/src/u.ts:b", name: "b" });
    const utilFile = makeFile({
      key: "file:/src/u.ts",
      identity: ID_MISMATCH,
      leaf: LEAF_MISMATCH,
      childKeys: [fn1.key, fn2.key],
      util: true,
    });
    fn1.parentKey = utilFile.key;
    fn2.parentKey = utilFile.key;
    const nodes = toNodeMap(utilFile, fn1, fn2);
    const ctx = createContext(nodes, CONFIG);
    const findings = incoherent.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("incoherent detect — skips empty embeddings", () => {
  test("skips containers with empty identity", () => {
    const fn1 = makeFunction({ key: "func:/src/x.ts:a", name: "a" });
    const fn2 = makeFunction({ key: "func:/src/x.ts:b", name: "b" });
    const file = makeFile({
      key: "file:/src/x.ts",
      identity: [],
      leaf: LEAF_NORM_A,
      childKeys: [fn1.key, fn2.key],
    });
    fn1.parentKey = file.key;
    fn2.parentKey = file.key;
    const nodes = toNodeMap(file, fn1, fn2);
    const ctx = createContext(nodes, CONFIG);
    const findings = incoherent.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("skips containers with empty leaf", () => {
    const fn1 = makeFunction({ key: "func:/src/x.ts:a", name: "a" });
    const fn2 = makeFunction({ key: "func:/src/x.ts:b", name: "b" });
    const file = makeFile({
      key: "file:/src/x.ts",
      identity: ID_NORM_A,
      leaf: [],
      childKeys: [fn1.key, fn2.key],
    });
    fn1.parentKey = file.key;
    fn2.parentKey = file.key;
    const nodes = toNodeMap(file, fn1, fn2);
    const ctx = createContext(nodes, CONFIG);
    const findings = incoherent.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("incoherent detect — skips thin containers", () => {
  test("skips containers with no children", () => {
    const file = makeFile({
      key: "file:/src/x.ts",
      identity: ID_MISMATCH,
      leaf: LEAF_MISMATCH,
      childKeys: [],
    });
    const nodes = toNodeMap(file);
    const ctx = createContext(nodes, CONFIG);
    const findings = incoherent.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("skips containers with a single child", () => {
    const fn1 = makeFunction({ key: "func:/src/thin.ts:a", name: "a" });
    const file = makeFile({
      key: "file:/src/thin.ts",
      identity: ID_MISMATCH,
      leaf: LEAF_MISMATCH,
      childKeys: [fn1.key],
    });
    fn1.parentKey = file.key;
    const [gA, gfA, gfA2] = makeGoodFile("a", ID_NORM_A, LEAF_NORM_A);
    const [gB, gfB, gfB2] = makeGoodFile("b", ID_NORM_B, LEAF_NORM_B);
    const nodes = toNodeMap(file, fn1, gA, gfA, gfA2, gB, gfB, gfB2);
    const ctx = createContext(nodes, CONFIG);
    const findings = incoherent.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain(file.key);
  });
});

describe("incoherent-utils detect — targets util containers", () => {
  test("flags util container with mismatched identity", () => {
    const fn1 = makeFunction({ key: "func:/src/ubad.ts:a", name: "a" });
    const fn2 = makeFunction({ key: "func:/src/ubad.ts:b", name: "b" });
    const utilBad = makeFile({
      key: "file:/src/u-bad.ts",
      identity: ID_MISMATCH,
      leaf: LEAF_MISMATCH,
      childKeys: [fn1.key, fn2.key],
      util: true,
    });
    fn1.parentKey = utilBad.key;
    fn2.parentKey = utilBad.key;
    const [uA, ufA, ufA2] = makeGoodFile("u1", ID_NORM_A, LEAF_NORM_A, true);
    const [uB, ufB, ufB2] = makeGoodFile("u2", ID_NORM_B, LEAF_NORM_B, true);
    const [uC, ufC, ufC2] = makeGoodFile("u3", ID_NORM_C, LEAF_NORM_C, true);
    const [uD, ufD, ufD2] = makeGoodFile("u4", ID_NORM_D, LEAF_NORM_D, true);
    const [uE, ufE, ufE2] = makeGoodFile("u5", ID_NORM_E, LEAF_NORM_E, true);
    const nodes = toNodeMap(
      utilBad,
      fn1,
      fn2,
      uA,
      ufA,
      ufA2,
      uB,
      ufB,
      ufB2,
      uC,
      ufC,
      ufC2,
      uD,
      ufD,
      ufD2,
      uE,
      ufE,
      ufE2,
    );
    const ctx = createContext(nodes, CONFIG);
    const findings = incoherentUtils.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).toContain(utilBad.key);
  });
});

describe("incoherent-utils detect — ignores non-util", () => {
  test("ignores non-util in utils mode", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a" });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b" });
    const file = makeFile({
      key: "file:/src/a.ts",
      identity: ID_MISMATCH,
      leaf: LEAF_MISMATCH,
      childKeys: [fn1.key, fn2.key],
      util: false,
    });
    fn1.parentKey = file.key;
    fn2.parentKey = file.key;
    const nodes = toNodeMap(file, fn1, fn2);
    const ctx = createContext(nodes, CONFIG);
    const findings = incoherentUtils.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("incoherent detect — missing node defensive guard", () => {
  test("skips entries whose key is removed from map", () => {
    const fn1 = makeFunction({ key: "func:/src/bad.ts:a", name: "a" });
    const fn2 = makeFunction({ key: "func:/src/bad.ts:b", name: "b" });
    const badFile = makeFile({
      key: "file:/src/bad.ts",
      name: "bad.ts",
      identity: ID_MISMATCH,
      leaf: LEAF_MISMATCH,
      childKeys: [fn1.key, fn2.key],
    });
    fn1.parentKey = badFile.key;
    fn2.parentKey = badFile.key;
    const [gA, gfA, gfA2] = makeGoodFile("a", ID_NORM_A, LEAF_NORM_A);
    const [gB, gfB, gfB2] = makeGoodFile("b", ID_NORM_B, LEAF_NORM_B);
    const [gC, gfC, gfC2] = makeGoodFile("c", ID_NORM_C, LEAF_NORM_C);
    const [gD, gfD, gfD2] = makeGoodFile("d", ID_NORM_D, LEAF_NORM_D);
    const [gE, gfE, gfE2] = makeGoodFile("e", ID_NORM_E, LEAF_NORM_E);
    const nodes = toNodeMap(
      badFile,
      fn1,
      fn2,
      gA,
      gfA,
      gfA2,
      gB,
      gfB,
      gfB2,
      gC,
      gfC,
      gfC2,
      gD,
      gfD,
      gfD2,
      gE,
      gfE,
      gfE2,
    );
    const origGet = nodes.get.bind(nodes);
    let callCount = NONE;
    const SKIP_THRESHOLD = 5;
    nodes.get = (key: string): CodeNode | undefined => {
      callCount++;
      if (callCount > SKIP_THRESHOLD && key === badFile.key) {
        return undefined;
      }
      return origGet(key);
    };
    const ctx = createContext(nodes, CONFIG);
    const findings = incoherent.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain(badFile.key);
  });
});

describe("incoherent format", () => {
  test("includes identity-content similarity in details", () => {
    const LABEL_FIT = E045;
    const CHILD_COUNT = 3;
    const fctx = makeFormatCtx({
      finding: {
        audit: "incoherent",
        key: "file:/src/bad.ts",
        name: "bad.ts",
        hash: "abcd1234",
        value: LABEL_FIT,
        details: { childCount: CHILD_COUNT },
      },
      prefix: "\u25B8",
      label: "bad.ts",
    });
    const result = incoherent.format(fctx);

    expect(result.heading).toContain("weak naming");
    expect(result.details[NONE]).toContain("45%");
    expect(result.details[NONE]).toContain("3 children");
  });

  test("uses 0% when value is undefined", () => {
    const CHILD_COUNT = 2;
    const fctx = makeFormatCtx({
      finding: {
        audit: "incoherent",
        key: "file:/src/bad.ts",
        name: "bad.ts",
        hash: "abcd1234",
        value: undefined,
        details: { childCount: CHILD_COUNT },
      },
      prefix: "\u25B8",
      label: "bad.ts",
    });
    const result = incoherent.format(fctx);

    expect(result.details[NONE]).toContain("0%");
  });
});
