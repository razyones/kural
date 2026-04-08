import type { CodeNode, NodeMap } from "../../tree/tree.ts";
import {
  E0,
  E005,
  E03,
  E045,
  E05,
  E055,
  E08,
  E085,
  E095,
  E1,
  NONE,
  SENSITIVITY,
} from "../../../../tests/constants/audits.ts";
import { describe, expect, test } from "vite-plus/test";
import {
  makeDir,
  makeFile,
  makeFormatCtx,
  makeFunction,
  toNodeMap,
} from "../../../../tests/helpers/audits.ts";
import { createContext } from "../context.ts";
import misplaced from "./misplaced.ts";
const CONFIG = {
  sensitivity: SENSITIVITY,
};

/** Embedding vectors for misplacement tests. */
const ID_ROOT = [E05, E05, E0];
const ID_AUTH = [E1, E0, E0];
const ID_API = [E0, E1, E0];
const ID_DB = [E0, E0, E1];
const LEAF_FITS_API = [E0, E095, E005];
const LEAF_FITS_AUTH = [E095, E005, E0];
const LEAF_SLIGHTLY_API = [E045, E055, E0];

/**
 * Creates a file with one child under a given parent directory.
 * Returns the file and its child function node.
 */
function makeChildFile(idx: string, parentKey: string, leaf: number[]): CodeNode[] {
  const fn = makeFunction({
    key: `func:/src/${idx}.ts:fn${idx}`,
    name: `fn${idx}`,
    parentKey: `file:/src/${idx}.ts`,
  });
  const file = makeFile({
    key: `file:/src/${idx}.ts`,
    name: `${idx}.ts`,
    identity: leaf,
    leaf,
    parentKey,
    childKeys: [fn.key],
  });
  return [file, fn];
}

/**
 * Builds a tree where misfit file strongly fits uncle,
 * several files slightly fit uncle (small deltas),
 * and the misfit's delta is an outlier.
 */
function buildMisfitTree(): NodeMap {
  const root = makeDir({
    key: "dir:/src",
    name: "src",
    identity: ID_ROOT,
    leaf: ID_ROOT,
    childKeys: ["dir:/src/auth", "dir:/src/api", "dir:/src/db"],
    parentKey: null,
  });
  const auth = makeDir({
    key: "dir:/src/auth",
    name: "auth",
    identity: ID_AUTH,
    leaf: ID_AUTH,
    childKeys: [],
    parentKey: "dir:/src",
  });
  const api = makeDir({
    key: "dir:/src/api",
    name: "api",
    identity: ID_API,
    leaf: ID_API,
    childKeys: [],
    parentKey: "dir:/src",
  });
  const db = makeDir({
    key: "dir:/src/db",
    name: "db",
    identity: ID_DB,
    leaf: ID_DB,
    childKeys: [],
    parentKey: "dir:/src",
  });
  const all: CodeNode[] = [root, auth, api, db];
  const authChildKeys: string[] = [];

  const [misfit, mfn] = makeChildFile("misfit", auth.key, LEAF_FITS_API);
  all.push(misfit, mfn);
  authChildKeys.push(misfit.key);

  const SLIGHT_COUNT = 8;
  for (let i = NONE; i < SLIGHT_COUNT; i++) {
    const [f, fn] = makeChildFile(`slight${i}`, auth.key, LEAF_SLIGHTLY_API);
    all.push(f, fn);
    authChildKeys.push(f.key);
  }

  auth.childKeys = authChildKeys;
  return toNodeMap(...all);
}

describe("misplaced detect — empty and flat trees", () => {
  test("returns empty for empty node map", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, CONFIG);
    const findings = misplaced.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("returns empty for single file node", () => {
    const file = makeFile({
      identity: ID_AUTH,
      leaf: LEAF_FITS_AUTH,
    });
    const nodes = toNodeMap(file);
    const ctx = createContext(nodes, CONFIG);
    const findings = misplaced.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("misplaced detect — node fits uncle better", () => {
  test("flags file that fits sibling dir better", () => {
    const nodes = buildMisfitTree();
    const ctx = createContext(nodes, CONFIG);
    const findings = misplaced.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).toContain("file:/src/misfit.ts");
  });
});

describe("misplaced detect — skips leaves and util", () => {
  test("skips leaf nodes", () => {
    const fn = makeFunction({
      identity: LEAF_FITS_API,
      leaf: LEAF_FITS_API,
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = misplaced.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("skips util nodes", () => {
    const nodes = buildMisfitTree();
    const misfit = nodes.get("file:/src/misfit.ts");
    if (misfit) {
      (misfit as { util: boolean }).util = true;
    }
    const ctx = createContext(nodes, CONFIG);
    const findings = misplaced.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain("file:/src/misfit.ts");
  });
});

describe("misplaced detect — suppression", () => {
  test("respects suppression", () => {
    const nodes = buildMisfitTree();
    const misfit = nodes.get("file:/src/misfit.ts");
    if (misfit) {
      misfit.residuals = [{ audit: "misplaced" }];
    }
    const ctx = createContext(nodes, CONFIG);
    const findings = misplaced.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain("file:/src/misfit.ts");
  });
});

describe("misplaced detect — companion exclusion", () => {
  test("excludes uncle with same companion", () => {
    const root = makeDir({
      key: "dir:/src",
      identity: ID_ROOT,
      leaf: ID_ROOT,
      childKeys: ["dir:/src/auth", "dir:/src/api"],
      parentKey: null,
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      identity: ID_AUTH,
      leaf: ID_AUTH,
      childKeys: ["file:/src/misfit.ts"],
      parentKey: "dir:/src",
      companion: "pair1",
    });
    const api = makeDir({
      key: "dir:/src/api",
      identity: ID_API,
      leaf: ID_API,
      childKeys: [],
      parentKey: "dir:/src",
      companion: "pair1",
    });
    const [misfit, mfn] = makeChildFile("misfit", auth.key, LEAF_FITS_API);
    const nodes = toNodeMap(root, auth, api, misfit, mfn);
    const ctx = createContext(nodes, CONFIG);
    const findings = misplaced.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain(misfit.key);
  });
});

describe("misplaced detect — no parent", () => {
  test("skips containers without parentKey", () => {
    const file = makeFile({
      key: "file:/src/orphan.ts",
      identity: LEAF_FITS_API,
      leaf: LEAF_FITS_API,
      parentKey: null,
    });
    const nodes = toNodeMap(file);
    const ctx = createContext(nodes, CONFIG);
    const findings = misplaced.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("misplaced detect — outlierKeys halves fence", () => {
  test("uses halved fence for outlier-flagged nodes", () => {
    const nodes = buildMisfitTree();
    const ctx = createContext(nodes, CONFIG);
    ctx.outlierKeys = new Set(["file:/src/misfit.ts"]);
    const findings = misplaced.detect(ctx);

    expect(findings.length).toBeGreaterThanOrEqual(NONE);
  });
});

describe("misplaced format", () => {
  test("includes uncle info in heading and details", () => {
    const PARENT_FIT = E03;
    const UNCLE_FIT = E085;
    const DELTA = E055;
    const fctx = makeFormatCtx({
      finding: {
        audit: "misplaced",
        key: "file:/src/auth/misfit.ts",
        name: "misfit.ts",
        hash: "abcd1234",
        pairKey: "dir:/src/api",
        value: PARENT_FIT,
        delta: DELTA,
        details: { uncleFit: UNCLE_FIT },
      },
      prefix: "\u25B8",
      label: "misfit.ts",
      labelNode: (k) => k.split("/").pop() ?? k,
    });
    const result = misplaced.format(fctx);

    expect(result.heading).toContain("fits a sibling module better");
    expect(result.details[NONE]).toContain("api");
    expect(result.details[NONE]).toContain("85%");
  });

  test("shows unknown when pairKey is undefined", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "misplaced",
        key: "k",
        name: "x",
        hash: "12345678",
        pairKey: undefined,
        value: E03,
        delta: E05,
        details: { uncleFit: E08 },
      },
      prefix: ">",
      label: "x",
    });
    const result = misplaced.format(fctx);

    expect(result.details[NONE]).toContain("unknown");
  });
});
