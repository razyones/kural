import { collectSiblingPairs, isTypeProducerPair } from "./siblings.ts";
import { describe, expect, test } from "vite-plus/test";
import {
  makeDir,
  makeFile,
  makeFunction,
  makeType,
  toNodeMap,
} from "../../../tests/helpers/audits.ts";

const NONE = 0;
const ONE = 1;
const THREE = 3;

const EMB_A1 = 0.9;
const EMB_A2 = 0.1;
const EMB_A3 = 0.0;
const EMB_B1 = 0.1;
const EMB_B2 = 0.9;
const EMB_B3 = 0.0;
const EMB_C1 = 0.0;
const EMB_C2 = 0.1;
const EMB_C3 = 0.9;

describe("isTypeProducerPair — return type match", () => {
  test("returns true when function returns the type", () => {
    const ty = makeType({ name: "User" });
    const fn = makeFunction({ returnsType: "User", paramTypes: [] });

    expect(isTypeProducerPair(ty, fn)).toBe(true);
  });

  test("returns true regardless of argument order", () => {
    const ty = makeType({ name: "Config" });
    const fn = makeFunction({ returnsType: "Config", paramTypes: [] });

    expect(isTypeProducerPair(fn, ty)).toBe(true);
  });
});

describe("isTypeProducerPair — param type match", () => {
  test("returns true when function has the type as a param", () => {
    const ty = makeType({ name: "Request" });
    const fn = makeFunction({
      returnsType: "void",
      paramTypes: ["Request", "string"],
    });

    expect(isTypeProducerPair(ty, fn)).toBe(true);
  });
});

describe("isTypeProducerPair — negative cases", () => {
  test("returns false for two function nodes", () => {
    const a = makeFunction({ name: "alpha" });
    const b = makeFunction({ name: "beta" });

    expect(isTypeProducerPair(a, b)).toBe(false);
  });

  test("returns false for two type nodes", () => {
    const a = makeType({ name: "A" });
    const b = makeType({ name: "B" });

    expect(isTypeProducerPair(a, b)).toBe(false);
  });

  test("returns false when function does not reference the type", () => {
    const ty = makeType({ name: "Unrelated" });
    const fn = makeFunction({
      returnsType: "string",
      paramTypes: ["number"],
    });

    expect(isTypeProducerPair(ty, fn)).toBe(false);
  });
});

describe("collectSiblingPairs — basic pair collection", () => {
  test("collects pairs from file children with leaf embeddings", () => {
    const fnA = makeFunction({
      name: "alpha",
      key: "func:/src/app.ts:alpha",
      leaf: [EMB_A1, EMB_A2, EMB_A3],
    });
    const fnB = makeFunction({
      name: "beta",
      key: "func:/src/app.ts:beta",
      leaf: [EMB_B1, EMB_B2, EMB_B3],
    });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key],
    });
    const nodes = toNodeMap(file, fnA, fnB);

    const pairs = collectSiblingPairs(nodes);

    expect(pairs.length).toBe(ONE);
    expect(pairs[NONE].level).toBe("leaf");
    expect(pairs[NONE].parentKey).toBe(file.key);
  });
});

describe("collectSiblingPairs — directory level", () => {
  test("produces file-level pairs for directory parents", () => {
    const fileA = makeFile({
      key: "file:/src/a.ts",
      name: "a.ts",
      leaf: [EMB_A1, EMB_A2, EMB_A3],
      childKeys: [],
    });
    const fileB = makeFile({
      key: "file:/src/b.ts",
      name: "b.ts",
      leaf: [EMB_B1, EMB_B2, EMB_B3],
      childKeys: [],
    });
    const dir = makeDir({
      childKeys: [fileA.key, fileB.key],
    });
    const nodes = toNodeMap(dir, fileA, fileB);

    const pairs = collectSiblingPairs(nodes);

    expect(pairs.length).toBe(ONE);
    expect(pairs[NONE].level).toBe("file");
  });
});

describe("collectSiblingPairs — exclusion: companions", () => {
  test("excludes pairs sharing the same companion group", () => {
    const fnA = makeFunction({
      name: "read",
      key: "func:/src/app.ts:read",
      companion: "io-pair",
      leaf: [EMB_A1, EMB_A2, EMB_A3],
    });
    const fnB = makeFunction({
      name: "write",
      key: "func:/src/app.ts:write",
      companion: "io-pair",
      leaf: [EMB_B1, EMB_B2, EMB_B3],
    });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key],
    });
    const nodes = toNodeMap(file, fnA, fnB);

    const pairs = collectSiblingPairs(nodes);

    expect(pairs.length).toBe(NONE);
  });
});

describe("collectSiblingPairs — exclusion: both patterned", () => {
  test("compares cross-pattern siblings (pattern members are reparented by tree)", () => {
    const fnA = makeFunction({
      name: "handleA",
      key: "func:/src/app.ts:handleA",
      patterns: ["grpA"],
      leaf: [EMB_A1, EMB_A2, EMB_A3],
    });
    const fnB = makeFunction({
      name: "handleB",
      key: "func:/src/app.ts:handleB",
      patterns: ["grpB"],
      leaf: [EMB_B1, EMB_B2, EMB_B3],
    });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key],
    });
    const nodes = toNodeMap(file, fnA, fnB);

    const pairs = collectSiblingPairs(nodes);

    expect(pairs.length).toBe(ONE);
  });
});

describe("collectSiblingPairs — exclusion: helpers", () => {
  test("excludes pairs involving a helper node", () => {
    const fnA = makeFunction({
      name: "main",
      key: "func:/src/app.ts:main",
      leaf: [EMB_A1, EMB_A2, EMB_A3],
    });
    const fnB = makeFunction({
      name: "helperFn",
      key: "func:/src/app.ts:helperFn",
      helper: true,
      leaf: [EMB_B1, EMB_B2, EMB_B3],
    });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key],
    });
    const nodes = toNodeMap(file, fnA, fnB);

    const pairs = collectSiblingPairs(nodes);

    expect(pairs.length).toBe(NONE);
  });
});

describe("collectSiblingPairs — exclusion: type-producer", () => {
  test("excludes type-producer pairs", () => {
    const ty = makeType({
      name: "User",
      key: "type:/src/app.ts:User",
      leaf: [EMB_A1, EMB_A2, EMB_A3],
    });
    const fn = makeFunction({
      name: "createUser",
      key: "func:/src/app.ts:createUser",
      returnsType: "User",
      paramTypes: [],
      leaf: [EMB_B1, EMB_B2, EMB_B3],
    });
    const file = makeFile({
      childKeys: [ty.key, fn.key],
    });
    const nodes = toNodeMap(file, ty, fn);

    const pairs = collectSiblingPairs(nodes);

    expect(pairs.length).toBe(NONE);
  });
});

describe("collectSiblingPairs — skipping conditions", () => {
  test("skips util parents", () => {
    const fnA = makeFunction({
      name: "a",
      key: "func:/src/utils.ts:a",
      leaf: [EMB_A1, EMB_A2, EMB_A3],
    });
    const fnB = makeFunction({
      name: "b",
      key: "func:/src/utils.ts:b",
      leaf: [EMB_B1, EMB_B2, EMB_B3],
    });
    const file = makeFile({
      key: "file:/src/utils.ts",
      name: "utils.ts",
      util: true,
      childKeys: [fnA.key, fnB.key],
    });
    const nodes = toNodeMap(file, fnA, fnB);

    expect(collectSiblingPairs(nodes).length).toBe(NONE);
  });

  test("skips util children in child filtering", () => {
    const fnA = makeFunction({
      name: "a",
      key: "func:/src/app.ts:a",
      util: true,
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

    expect(collectSiblingPairs(nodes).length).toBe(NONE);
  });

  test("skips children with empty leaf embeddings", () => {
    const fnA = makeFunction({
      name: "a",
      key: "func:/src/app.ts:a",
      leaf: [],
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

    expect(collectSiblingPairs(nodes).length).toBe(NONE);
  });
});

describe("collectSiblingPairs — multiple pairs", () => {
  test("collects all non-excluded pairs from three siblings", () => {
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
    const fnC = makeFunction({
      name: "c",
      key: "func:/src/app.ts:c",
      leaf: [EMB_C1, EMB_C2, EMB_C3],
    });
    const file = makeFile({
      childKeys: [fnA.key, fnB.key, fnC.key],
    });
    const nodes = toNodeMap(file, fnA, fnB, fnC);

    const pairs = collectSiblingPairs(nodes);

    expect(pairs.length).toBe(THREE);
  });
});
