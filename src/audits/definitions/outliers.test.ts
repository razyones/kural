import {
  CONTAINMENT_FLOOR,
  E0,
  E01,
  E012,
  E013,
  E015,
  E03,
  E05,
  E08,
  E085,
  E087,
  E088,
  E09,
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
import outliers from "./outliers.ts";
const CONFIG = {
  sensitivity: SENSITIVITY,
  containmentFloor: CONTAINMENT_FLOOR,
  minGroup: MIN_GROUP,
};

/** Embedding vectors for similarity tests. */
const EMB_A = [E09, E01, E0];
const EMB_B = [E085, E015, E0];
const EMB_C = [E088, E012, E0];
const EMB_D = [E087, E013, E0];
const EMB_OUTLIER = [E0, E0, E1];

describe("outliers detect — below minimum group size", () => {
  test("returns empty when fewer children than minGroup", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_A });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_B });
    const file = makeFile({
      childKeys: [fn1.key, fn2.key],
      leaf: [E05, E05, E0],
    });
    fn1.parentKey = file.key;
    fn2.parentKey = file.key;
    const nodes = toNodeMap(file, fn1, fn2);
    const ctx = createContext(nodes, CONFIG);
    const findings = outliers.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("returns empty for empty node map", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, CONFIG);
    const findings = outliers.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("outliers detect — with outlier child", () => {
  test("flags child with weak similarity to siblings", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_A });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_B });
    const fn3 = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: EMB_C });
    const fn4 = makeFunction({ key: "func:/src/a.ts:d", name: "d", leaf: EMB_D });
    const outlierFn = makeFunction({ key: "func:/src/a.ts:out", name: "out", leaf: EMB_OUTLIER });
    const file = makeFile({
      childKeys: [fn1.key, fn2.key, fn3.key, fn4.key, outlierFn.key],
      leaf: [E05, E05, E0],
    });
    for (const fn of [fn1, fn2, fn3, fn4, outlierFn]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fn1, fn2, fn3, fn4, outlierFn);
    const ctx = createContext(nodes, CONFIG);
    const findings = outliers.detect(ctx);

    expect(findings.length).toBeGreaterThanOrEqual(ONE);
    const keys = findings.map((f) => f.key);
    expect(keys).toContain(outlierFn.key);
  });

  test("populates outlierKeys on context", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_A });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_B });
    const fn3 = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: EMB_C });
    const fn4 = makeFunction({ key: "func:/src/a.ts:d", name: "d", leaf: EMB_D });
    const outlierFn = makeFunction({ key: "func:/src/a.ts:out", name: "out", leaf: EMB_OUTLIER });
    const file = makeFile({
      childKeys: [fn1.key, fn2.key, fn3.key, fn4.key, outlierFn.key],
      leaf: [E05, E05, E0],
    });
    for (const fn of [fn1, fn2, fn3, fn4, outlierFn]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fn1, fn2, fn3, fn4, outlierFn);
    const ctx = createContext(nodes, CONFIG);
    outliers.detect(ctx);

    expect(ctx.outlierKeys.size).toBeGreaterThanOrEqual(ONE);
  });
});

describe("outliers detect — skips util and leaf parents", () => {
  test("skips util parent nodes", () => {
    const fn1 = makeFunction({ key: "func:/src/u.ts:a", name: "a", leaf: EMB_A });
    const fn2 = makeFunction({ key: "func:/src/u.ts:b", name: "b", leaf: EMB_B });
    const fn3 = makeFunction({ key: "func:/src/u.ts:c", name: "c", leaf: EMB_C });
    const fn4 = makeFunction({ key: "func:/src/u.ts:d", name: "d", leaf: EMB_D });
    const outlierFn = makeFunction({ key: "func:/src/u.ts:out", name: "out", leaf: EMB_OUTLIER });
    const file = makeFile({
      key: "file:/src/u.ts",
      childKeys: [fn1.key, fn2.key, fn3.key, fn4.key, outlierFn.key],
      util: true,
    });
    for (const fn of [fn1, fn2, fn3, fn4, outlierFn]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fn1, fn2, fn3, fn4, outlierFn);
    const ctx = createContext(nodes, CONFIG);
    const findings = outliers.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("skips leaf nodes as parents", () => {
    const fn = makeFunction({ leaf: EMB_A });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = outliers.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("outliers detect — suppression and helpers", () => {
  test("respects suppression on outlier node", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_A });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_B });
    const fn3 = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: EMB_C });
    const fn4 = makeFunction({ key: "func:/src/a.ts:d", name: "d", leaf: EMB_D });
    const outlierFn = makeFunction({
      key: "func:/src/a.ts:out",
      name: "out",
      leaf: EMB_OUTLIER,
      residuals: [suppress("outliers")],
    });
    const file = makeFile({
      childKeys: [fn1.key, fn2.key, fn3.key, fn4.key, outlierFn.key],
    });
    for (const fn of [fn1, fn2, fn3, fn4, outlierFn]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fn1, fn2, fn3, fn4, outlierFn);
    const ctx = createContext(nodes, CONFIG);
    const findings = outliers.detect(ctx);

    const keys = findings.map((f) => f.key);
    expect(keys).not.toContain(outlierFn.key);
  });

  test("excludes util children from group", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_A });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_B });
    const fn3 = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: EMB_C });
    const fn4 = makeFunction({ key: "func:/src/a.ts:d", name: "d", leaf: EMB_D, util: true });
    const outlierFn = makeFunction({ key: "func:/src/a.ts:out", name: "out", leaf: EMB_OUTLIER });
    const file = makeFile({
      childKeys: [fn1.key, fn2.key, fn3.key, fn4.key, outlierFn.key],
    });
    for (const fn of [fn1, fn2, fn3, fn4, outlierFn]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fn1, fn2, fn3, fn4, outlierFn);
    const ctx = createContext(nodes, CONFIG);
    const findings = outliers.detect(ctx);

    expect(findings.length).toBeGreaterThanOrEqual(ONE);
  });
});

describe("outliers detect — no outlier in uniform group", () => {
  test("returns empty for uniform sibling group", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_A });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_B });
    const fn3 = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: EMB_C });
    const fn4 = makeFunction({ key: "func:/src/a.ts:d", name: "d", leaf: EMB_D });
    const file = makeFile({
      childKeys: [fn1.key, fn2.key, fn3.key, fn4.key],
    });
    for (const fn of [fn1, fn2, fn3, fn4]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fn1, fn2, fn3, fn4);
    const ctx = createContext(nodes, CONFIG);
    const findings = outliers.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("outliers detect — children with empty embeddings", () => {
  test("skips children with empty leaf embeddings", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_A });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_B });
    const fn3 = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: EMB_C });
    const fn4 = makeFunction({ key: "func:/src/a.ts:d", name: "d", leaf: EMB_D });
    const empty = makeFunction({ key: "func:/src/a.ts:e", name: "e", leaf: [] });
    const file = makeFile({
      childKeys: [fn1.key, fn2.key, fn3.key, fn4.key, empty.key],
    });
    for (const fn of [fn1, fn2, fn3, fn4, empty]) {
      fn.parentKey = file.key;
    }
    const nodes = toNodeMap(file, fn1, fn2, fn3, fn4, empty);
    const ctx = createContext(nodes, CONFIG);
    const findings = outliers.detect(ctx);

    const keys = findings.map((f) => f.key);
    expect(keys).not.toContain(empty.key);
  });
});

describe("outliers format", () => {
  test("includes relevance info in heading", () => {
    const SIM_VALUE = E03;
    const GROUP_VALUE = E08;
    const fctx = makeFormatCtx({
      finding: {
        audit: "outliers",
        key: "func:/src/a.ts:out",
        name: "out",
        hash: "abcd1234",
        value: SIM_VALUE,
        groupValue: GROUP_VALUE,
      },
      prefix: "\u25B8",
      label: "out",
      location: " in a.ts",
    });
    const result = outliers.format(fctx);

    expect(result.heading).toContain("out");
    expect(result.heading).toContain("weak relevance");
    expect(result.details[NONE]).toContain("30%");
    expect(result.details[NONE]).toContain("80%");
  });

  test("formats with 0% when value and groupValue are undefined", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "outliers",
        key: "func:k",
        name: "fn",
        hash: "12345678",
        value: undefined,
        groupValue: undefined,
      },
    });
    const result = outliers.format(fctx);

    expect(result.details[NONE]).toContain("0%");
  });

  test("includes location in heading", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "outliers",
        key: "func:k",
        name: "fn",
        hash: "12345678",
        value: E05,
        groupValue: E09,
      },
      location: " in module.ts",
    });
    const result = outliers.format(fctx);

    expect(result.heading).toContain("module.ts");
  });
});
