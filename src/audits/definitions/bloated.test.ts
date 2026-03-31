import {
  CONTAINMENT_FLOOR,
  E0,
  E01,
  E012,
  E015,
  E018,
  E02,
  E021,
  E022,
  E05,
  E078,
  E079,
  E08,
  E082,
  E085,
  E088,
  E09,
  MIN_GROUP,
  NONE,
  ONE,
  SENSITIVITY,
} from "../../../tests/constants/audits.ts";
import { bloatedDirectories, bloatedFiles } from "./bloated.ts";
import { describe, expect, test } from "vite-plus/test";
import {
  makeDir,
  makeFile,
  makeFormatCtx,
  makeFunction,
  makeType,
  suppress,
  toNodeMap,
} from "../../../tests/helpers/audits.ts";
import { createContext } from "../context.ts";
const CONFIG = {
  sensitivity: SENSITIVITY,
  containmentFloor: CONTAINMENT_FLOOR,
  minGroup: MIN_GROUP,
};

/**
 * Embedding vectors forming two distinct clusters for bloat detection.
 * Cluster 1: auth-like (high dim0). Cluster 2: db-like (high dim5).
 * Using 8 dimensions for enough distance variation.
 */
const CLUSTER_A1 = [E09, E01, E0, E0, E0, E0, E0, E0];
const CLUSTER_A2 = [E085, E015, E0, E0, E0, E0, E0, E0];
const CLUSTER_A3 = [E088, E012, E0, E0, E0, E0, E0, E0];
const CLUSTER_B1 = [E0, E0, E0, E0, E0, E09, E01, E0];
const CLUSTER_B2 = [E0, E0, E0, E0, E0, E085, E015, E0];
const CLUSTER_B3 = [E0, E0, E0, E0, E0, E088, E012, E0];
const UNIFORM_A = [E08, E02, E0, E0, E0, E0, E0, E0];
const UNIFORM_B = [E078, E022, E0, E0, E0, E0, E0, E0];
const UNIFORM_C = [E082, E018, E0, E0, E0, E0, E0, E0];
const UNIFORM_D = [E079, E021, E0, E0, E0, E0, E0, E0];

describe("bloated-directories detect — empty and insufficient", () => {
  test("returns empty for empty node map", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, CONFIG);
    const findings = bloatedDirectories.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("returns empty when fewer children than minGroup", () => {
    const f1 = makeFile({ key: "file:/src/a.ts", name: "a.ts", leaf: CLUSTER_A1 });
    const f2 = makeFile({ key: "file:/src/b.ts", name: "b.ts", leaf: CLUSTER_B1 });
    const dir = makeDir({
      key: "dir:/src",
      childKeys: [f1.key, f2.key],
    });
    f1.parentKey = dir.key;
    f2.parentKey = dir.key;
    const nodes = toNodeMap(dir, f1, f2);
    const ctx = createContext(nodes, CONFIG);
    const findings = bloatedDirectories.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("bloated-directories detect — clustered children", () => {
  test("flags directory with two distinct child clusters", () => {
    const f1 = makeFile({ key: "file:/src/a.ts", name: "a.ts", leaf: CLUSTER_A1 });
    const f2 = makeFile({ key: "file:/src/b.ts", name: "b.ts", leaf: CLUSTER_A2 });
    const f3 = makeFile({ key: "file:/src/c.ts", name: "c.ts", leaf: CLUSTER_A3 });
    const f4 = makeFile({ key: "file:/src/d.ts", name: "d.ts", leaf: CLUSTER_B1 });
    const f5 = makeFile({ key: "file:/src/e.ts", name: "e.ts", leaf: CLUSTER_B2 });
    const f6 = makeFile({ key: "file:/src/f.ts", name: "f.ts", leaf: CLUSTER_B3 });
    const dir = makeDir({
      key: "dir:/src",
      childKeys: [f1.key, f2.key, f3.key, f4.key, f5.key, f6.key],
    });
    for (const f of [f1, f2, f3, f4, f5, f6]) {
      f.parentKey = dir.key;
    }
    const nodes = toNodeMap(dir, f1, f2, f3, f4, f5, f6);
    const ctx = createContext(nodes, CONFIG);
    const findings = bloatedDirectories.detect(ctx);

    expect(findings.length).toBeGreaterThanOrEqual(ONE);
    expect(findings[NONE].clusters).toBeDefined();
  });
});

describe("bloated-directories detect — uniform children", () => {
  test("does not flag directory with uniform children", () => {
    const f1 = makeFile({ key: "file:/src/a.ts", name: "a.ts", leaf: UNIFORM_A });
    const f2 = makeFile({ key: "file:/src/b.ts", name: "b.ts", leaf: UNIFORM_B });
    const f3 = makeFile({ key: "file:/src/c.ts", name: "c.ts", leaf: UNIFORM_C });
    const f4 = makeFile({ key: "file:/src/d.ts", name: "d.ts", leaf: UNIFORM_D });
    const dir = makeDir({
      key: "dir:/src",
      childKeys: [f1.key, f2.key, f3.key, f4.key],
    });
    for (const f of [f1, f2, f3, f4]) {
      f.parentKey = dir.key;
    }
    const nodes = toNodeMap(dir, f1, f2, f3, f4);
    const ctx = createContext(nodes, CONFIG);
    const findings = bloatedDirectories.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("bloated-directories detect — suppression and util", () => {
  test("respects suppression", () => {
    const f1 = makeFile({ key: "file:/src/a.ts", leaf: CLUSTER_A1 });
    const f2 = makeFile({ key: "file:/src/b.ts", leaf: CLUSTER_A2 });
    const f3 = makeFile({ key: "file:/src/c.ts", leaf: CLUSTER_B1 });
    const f4 = makeFile({ key: "file:/src/d.ts", leaf: CLUSTER_B2 });
    const dir = makeDir({
      key: "dir:/src",
      childKeys: [f1.key, f2.key, f3.key, f4.key],
      residuals: [suppress("bloated-directories")],
    });
    for (const f of [f1, f2, f3, f4]) {
      f.parentKey = dir.key;
    }
    const nodes = toNodeMap(dir, f1, f2, f3, f4);
    const ctx = createContext(nodes, CONFIG);
    const findings = bloatedDirectories.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain(dir.key);
  });

  test("skips util directories", () => {
    const f1 = makeFile({ key: "file:/src/a.ts", leaf: CLUSTER_A1 });
    const f2 = makeFile({ key: "file:/src/b.ts", leaf: CLUSTER_A2 });
    const f3 = makeFile({ key: "file:/src/c.ts", leaf: CLUSTER_B1 });
    const f4 = makeFile({ key: "file:/src/d.ts", leaf: CLUSTER_B2 });
    const dir = makeDir({
      key: "dir:/src",
      childKeys: [f1.key, f2.key, f3.key, f4.key],
      util: true,
    });
    for (const f of [f1, f2, f3, f4]) {
      f.parentKey = dir.key;
    }
    const nodes = toNodeMap(dir, f1, f2, f3, f4);
    const ctx = createContext(nodes, CONFIG);
    const findings = bloatedDirectories.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("bloated-files detect — empty and insufficient", () => {
  test("returns empty for empty node map", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, CONFIG);
    const findings = bloatedFiles.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("returns empty when fewer children than minGroup", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: CLUSTER_A1 });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: CLUSTER_B1 });
    const file = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fn1.key, fn2.key],
    });
    fn1.parentKey = file.key;
    fn2.parentKey = file.key;
    const nodes = toNodeMap(file, fn1, fn2);
    const ctx = createContext(nodes, CONFIG);
    const findings = bloatedFiles.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("bloated-files detect — clustered functions", () => {
  test("flags file with two distinct function clusters", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: CLUSTER_A1 });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: CLUSTER_A2 });
    const fn3 = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: CLUSTER_A3 });
    const fn4 = makeFunction({ key: "func:/src/a.ts:d", name: "d", leaf: CLUSTER_B1 });
    const fn5 = makeFunction({ key: "func:/src/a.ts:e", name: "e", leaf: CLUSTER_B2 });
    const fn6 = makeFunction({ key: "func:/src/a.ts:f", name: "f", leaf: CLUSTER_B3 });
    const file = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fn1.key, fn2.key, fn3.key, fn4.key, fn5.key, fn6.key],
    });
    for (const fn of [fn1, fn2, fn3, fn4, fn5, fn6]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fn1, fn2, fn3, fn4, fn5, fn6);
    const ctx = createContext(nodes, CONFIG);
    const findings = bloatedFiles.detect(ctx);

    expect(findings.length).toBeGreaterThanOrEqual(ONE);
  });
});

describe("bloated-files detect — type-only split suppressed", () => {
  test("does not flag when cluster split is type-only", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: CLUSTER_A1 });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: CLUSTER_A2 });
    const fn3 = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: CLUSTER_A3 });
    const ty1 = makeType({ key: "type:/src/a.ts:T1", name: "T1", leaf: CLUSTER_B1 });
    const ty2 = makeType({ key: "type:/src/a.ts:T2", name: "T2", leaf: CLUSTER_B2 });
    const ty3 = makeType({ key: "type:/src/a.ts:T3", name: "T3", leaf: CLUSTER_B3 });
    const file = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fn1.key, fn2.key, fn3.key, ty1.key, ty2.key, ty3.key],
    });
    for (const n of [fn1, fn2, fn3, ty1, ty2, ty3]) {
      n.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fn1, fn2, fn3, ty1, ty2, ty3);
    const ctx = createContext(nodes, CONFIG);
    const findings = bloatedFiles.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("bloated-files detect — excludes util children", () => {
  test("excludes util children from cluster analysis reducing below minGroup", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: CLUSTER_A1 });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: CLUSTER_A2 });
    const fn3 = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: CLUSTER_B1 });
    const fn4 = makeFunction({
      key: "func:/src/a.ts:d",
      name: "d",
      leaf: CLUSTER_B2,
      util: true,
    });
    const fn5 = makeFunction({
      key: "func:/src/a.ts:e",
      name: "e",
      leaf: CLUSTER_B3,
      util: true,
    });
    const fn6 = makeFunction({
      key: "func:/src/a.ts:f",
      name: "f",
      leaf: CLUSTER_A3,
      util: true,
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      childKeys: [fn1.key, fn2.key, fn3.key, fn4.key, fn5.key, fn6.key],
    });
    for (const fn of [fn1, fn2, fn3, fn4, fn5, fn6]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fn1, fn2, fn3, fn4, fn5, fn6);
    const ctx = createContext(nodes, CONFIG);
    const findings = bloatedFiles.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("bloated format", () => {
  test("includes split identity and cluster details", () => {
    const CLUSTER_COUNT = 2;
    const fctx = makeFormatCtx({
      finding: {
        audit: "bloated-directories",
        key: "dir:/src",
        name: "src",
        hash: "abcd1234",
        value: E05,
        clusters: [
          ["a.ts", "b.ts"],
          ["c.ts", "d.ts"],
        ],
        details: { clusterCount: CLUSTER_COUNT },
      },
      prefix: "\u25B8",
      label: "src",
    });
    const result = bloatedDirectories.format(fctx);

    expect(result.heading).toContain("split identity");
    expect(result.heading).toContain("2 clusters");
    expect(result.details.length).toBe(CLUSTER_COUNT);
    expect(result.details[NONE]).toContain("a.ts");
  });

  test("handles empty clusters gracefully", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "bloated-directories",
        key: "dir:/src",
        name: "src",
        hash: "abcd1234",
        clusters: undefined,
        details: { clusterCount: NONE },
      },
      prefix: "\u25B8",
      label: "src",
    });
    const result = bloatedDirectories.format(fctx);

    expect(result.details.length).toBe(NONE);
  });
});

describe("bloated-directories detect — helpers excluded", () => {
  test("excludes helper children from group", () => {
    const f1 = makeFile({ key: "file:/src/a.ts", leaf: CLUSTER_A1 });
    const f2 = makeFile({ key: "file:/src/b.ts", leaf: CLUSTER_A2 });
    const f3 = makeFile({ key: "file:/src/c.ts", leaf: CLUSTER_B1 });
    const f4 = makeFile({ key: "file:/src/d.ts", leaf: CLUSTER_B2, helper: true });
    const dir = makeDir({
      key: "dir:/src",
      childKeys: [f1.key, f2.key, f3.key, f4.key],
    });
    for (const f of [f1, f2, f3, f4]) {
      f.parentKey = dir.key;
    }
    const nodes = toNodeMap(dir, f1, f2, f3, f4);
    const ctx = createContext(nodes, CONFIG);
    const findings = bloatedDirectories.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});
