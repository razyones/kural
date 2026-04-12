import { createContext, isSuppressed } from "./context.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeDir, makeFile, makeFunction, toNodeMap } from "../../../tests/helpers/audits.ts";
import type { AuditsConfig } from "../../shell/config/audits.ts";

const NONE = 0;
const ONE = 1;
const SENSITIVITY = 2.0;

const EMB_A1 = 0.9;
const EMB_A2 = 0.1;
const EMB_A3 = 0.0;
const EMB_B1 = 0.1;
const EMB_B2 = 0.9;
const EMB_B3 = 0.0;

function makeConfig(overrides: Partial<AuditsConfig> = {}): AuditsConfig {
  return {
    sensitivity: SENSITIVITY,
    ...overrides,
  };
}

describe("createContext — basic properties", () => {
  test("exposes sensitivity from config", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.sensitivity).toBe(SENSITIVITY);
  });

  test("initializes outlierKeys as empty set", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.outlierKeys.size).toBe(NONE);
  });
});

describe("createContext — rootKey detection", () => {
  test("finds root directory node with null parentKey", () => {
    const dir = makeDir({ parentKey: null });
    const nodes = toNodeMap(dir);
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.rootKey).toBe("dir:/src");
  });

  test("returns null when no root directory exists", () => {
    const file = makeFile();
    const nodes = toNodeMap(file);
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.rootKey).toBeNull();
  });
});

describe("createContext — lazy siblingPairs", () => {
  test("computes sibling pairs lazily on access", () => {
    const fnA = makeFunction({
      name: "a",
      key: "func:/src/app.ts:a",
      leaf: [EMB_A1, EMB_A2, EMB_A3],
    });
    const fnB = makeFunction({
      name: "b",
      key: "func:/src/app.ts:b",
      leaf: [EMB_B1, EMB_B2, EMB_B3],
    });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key],
    });
    const nodes = toNodeMap(file, fnA, fnB);
    const ctx = createContext(nodes, makeConfig());

    const pairs = ctx.siblingPairs;

    expect(pairs.length).toBe(ONE);
  });

  test("caches sibling pairs across accesses", () => {
    const fnA = makeFunction({
      name: "a",
      key: "func:/src/app.ts:a",
      leaf: [EMB_A1, EMB_A2, EMB_A3],
    });
    const fnB = makeFunction({
      name: "b",
      key: "func:/src/app.ts:b",
      leaf: [EMB_B1, EMB_B2, EMB_B3],
    });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key],
    });
    const nodes = toNodeMap(file, fnA, fnB);
    const ctx = createContext(nodes, makeConfig());

    const first = ctx.siblingPairs;
    const second = ctx.siblingPairs;

    expect(first).toBe(second);
  });
});

describe("createContext — lazy fence values", () => {
  test("returns Infinity fences when too few pairs", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, makeConfig());

    expect(ctx.leafMergeFence).toBe(Infinity);
    expect(ctx.fileMergeFence).toBe(Infinity);
  });
});

describe("isSuppressed — matching audit name", () => {
  test("returns true when residual matches audit without hash", () => {
    const node = makeFunction({
      residuals: [{ audit: "outliers" }],
    });

    expect(isSuppressed(node, "outliers")).toBe(true);
  });

  test("returns true when residual hash matches node hash", () => {
    const node = makeFunction({
      hash: "abc12345",
      residuals: [{ audit: "merge-candidates", hash: "abc12345" }],
    });

    expect(isSuppressed(node, "merge-candidates")).toBe(true);
  });
});

describe("isSuppressed — non-matching cases", () => {
  test("returns false when residual hash differs from node hash", () => {
    const node = makeFunction({
      hash: "abc12345",
      residuals: [{ audit: "outliers", hash: "xxxxxxxx" }],
    });

    expect(isSuppressed(node, "outliers")).toBe(false);
  });

  test("returns false when audit name does not match", () => {
    const node = makeFunction({
      residuals: [{ audit: "different-audit" }],
    });

    expect(isSuppressed(node, "outliers")).toBe(false);
  });

  test("returns false when residuals array is empty", () => {
    const node = makeFunction({ residuals: [] });

    expect(isSuppressed(node, "outliers")).toBe(false);
  });
});

describe("isSuppressed — multiple residuals", () => {
  test("matches the correct audit among multiple residuals", () => {
    const node = makeFunction({
      residuals: [{ audit: "other-audit" }, { audit: "target-audit" }],
    });

    expect(isSuppressed(node, "target-audit")).toBe(true);
    expect(isSuppressed(node, "other-audit")).toBe(true);
    expect(isSuppressed(node, "missing-audit")).toBe(false);
  });
});
