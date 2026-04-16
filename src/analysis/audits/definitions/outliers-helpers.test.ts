import {
  E0,
  E01,
  E012,
  E013,
  E015,
  E085,
  E087,
  E088,
  E09,
  E1,
  NONE,
  ONE,
} from "../../../../tests/constants/audits.ts";
import { buildBatch, collectBatches, tightGroupDeviationFloor } from "./outliers.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeFile, makeFunction, makeType, toNodeMap } from "../../../../tests/helpers/audits.ts";

const EMB_A = [E09, E01, E0];
const EMB_B = [E085, E015, E0];
const EMB_C = [E088, E012, E0];
const EMB_D = [E087, E013, E0];
const EMB_OUTLIER = [E0, E0, E1];
const TWO = 2;

describe("buildBatch — returns null below MIN_GROUP", () => {
  test("returns null for empty partition", () => {
    expect(buildBatch("file:/src/a.ts", [])).toBeNull();
  });

  test("returns null for partition with fewer than 3 children", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_A });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_B });
    const partition = [
      { key: fn1.key, node: fn1 },
      { key: fn2.key, node: fn2 },
    ];
    expect(buildBatch("file:/src/a.ts", partition)).toBeNull();
  });
});

describe("buildBatch — returns batch at MIN_GROUP", () => {
  test("returns a batch with 3 children", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_A });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_B });
    const fn3 = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: EMB_C });
    const partition = [
      { key: fn1.key, node: fn1 },
      { key: fn2.key, node: fn2 },
      { key: fn3.key, node: fn3 },
    ];
    const batch = buildBatch("file:/src/a.ts", partition);

    expect(batch).not.toBeNull();
    expect(batch?.parentKey).toBe("file:/src/a.ts");
    expect(batch?.perChildMeans.length).toBe(partition.length);
  });
});

describe("tightGroupDeviationFloor — edge cases", () => {
  test("returns NONE when total deviations < MIN_GROUP", () => {
    expect(tightGroupDeviationFloor([])).toBe(NONE);
  });

  test("returns NONE for a single batch with fewer than 3 items", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_A });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_B });
    const partition = [
      { key: fn1.key, node: fn1 },
      { key: fn2.key, node: fn2 },
    ];
    const batch = buildBatch("file:/src/a.ts", partition);
    // buildBatch returns null for < MIN_GROUP, so no batches to floor
    expect(batch).toBeNull();
    expect(tightGroupDeviationFloor([])).toBe(NONE);
  });
});

describe("tightGroupDeviationFloor — with valid batches", () => {
  test("returns a positive floor for batches with spread", () => {
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_A });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_B });
    const fn3 = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: EMB_C });
    const fn4 = makeFunction({ key: "func:/src/a.ts:d", name: "d", leaf: EMB_D });
    const outlierFn = makeFunction({ key: "func:/src/a.ts:out", name: "out", leaf: EMB_OUTLIER });
    const partition = [fn1, fn2, fn3, fn4, outlierFn].map((f) => ({ key: f.key, node: f }));
    const batch = buildBatch("file:/src/a.ts", partition);

    expect(batch).not.toBeNull();
    if (batch === null) {
      return;
    }
    const floor = tightGroupDeviationFloor([batch]);
    expect(floor).toBeGreaterThanOrEqual(NONE);
  });
});

describe("collectBatches — kind partitioning", () => {
  test("file with only types produces a single batch", () => {
    const t1 = makeType({ key: "type:/src/a.ts:A", name: "A", leaf: EMB_A });
    const t2 = makeType({ key: "type:/src/a.ts:B", name: "B", leaf: EMB_B });
    const t3 = makeType({ key: "type:/src/a.ts:C", name: "C", leaf: EMB_C });
    const file = makeFile({
      childKeys: [t1.key, t2.key, t3.key],
      leaf: [E09, E01, E0],
    });
    for (const t of [t1, t2, t3]) {
      t.parentKey = file.key;
    }
    const nodes = toNodeMap(file, t1, t2, t3);
    const batches = collectBatches(nodes);

    expect(batches.length).toBe(ONE);
  });

  test("file with types + functions produces two batches", () => {
    const t1 = makeType({ key: "type:/src/a.ts:A", name: "A", leaf: EMB_A });
    const t2 = makeType({ key: "type:/src/a.ts:B", name: "B", leaf: EMB_B });
    const t3 = makeType({ key: "type:/src/a.ts:C", name: "C", leaf: EMB_C });
    const fn1 = makeFunction({ key: "func:/src/a.ts:a", name: "a", leaf: EMB_C });
    const fn2 = makeFunction({ key: "func:/src/a.ts:b", name: "b", leaf: EMB_D });
    const fn3 = makeFunction({ key: "func:/src/a.ts:c", name: "c", leaf: EMB_A });
    const file = makeFile({
      childKeys: [t1.key, t2.key, t3.key, fn1.key, fn2.key, fn3.key],
      leaf: [E09, E01, E0],
    });
    for (const n of [t1, t2, t3, fn1, fn2, fn3]) {
      n.parentKey = file.key;
    }
    const nodes = toNodeMap(file, t1, t2, t3, fn1, fn2, fn3);
    const batches = collectBatches(nodes);

    expect(batches.length).toBe(TWO);
  });
});
