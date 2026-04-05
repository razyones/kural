import { describe, expect, test } from "vite-plus/test";
import { makeFile, makeFunction, makeType, toNodeMap } from "../../../tests/helpers/audits.ts";
import { getChildrenWithKeys } from "./children.ts";

const NONE = 0;
const ONE = 1;
const TWO = 2;

describe("getChildrenWithKeys — resolves existing keys", () => {
  test("returns child nodes paired with their keys", () => {
    const fn = makeFunction();
    const ty = makeType();
    const file = makeFile({
      childKeys: [fn.key, ty.key],
    });
    const nodes = toNodeMap(file, fn, ty);

    const result = getChildrenWithKeys(file, nodes);

    expect(result.length).toBe(TWO);
    expect(result[NONE].key).toBe(fn.key);
    expect(result[NONE].node).toBe(fn);
    expect(result[ONE].key).toBe(ty.key);
    expect(result[ONE].node).toBe(ty);
  });
});

describe("getChildrenWithKeys — missing keys", () => {
  test("filters out child keys that do not exist in the map", () => {
    const fn = makeFunction();
    const file = makeFile({
      childKeys: [fn.key, "func:/src/app.ts:missing"],
    });
    const nodes = toNodeMap(file, fn);

    const result = getChildrenWithKeys(file, nodes);

    expect(result.length).toBe(ONE);
    expect(result[NONE].key).toBe(fn.key);
  });

  test("returns empty array when all child keys are missing", () => {
    const file = makeFile({
      childKeys: ["func:/src/app.ts:gone", "type:/src/app.ts:gone"],
    });
    const nodes = toNodeMap(file);

    const result = getChildrenWithKeys(file, nodes);

    expect(result.length).toBe(NONE);
  });
});

describe("getChildrenWithKeys — leaf nodes", () => {
  test("returns empty array for function nodes (empty childKeys)", () => {
    const fn = makeFunction();
    const nodes = toNodeMap(fn);

    const result = getChildrenWithKeys(fn, nodes);

    expect(result.length).toBe(NONE);
  });

  test("returns empty array for type nodes (empty childKeys)", () => {
    const ty = makeType();
    const nodes = toNodeMap(ty);

    const result = getChildrenWithKeys(ty, nodes);

    expect(result.length).toBe(NONE);
  });
});

describe("getChildrenWithKeys — empty parent", () => {
  test("returns empty array for file with no childKeys", () => {
    const file = makeFile({ childKeys: [] });
    const nodes = toNodeMap(file);

    const result = getChildrenWithKeys(file, nodes);

    expect(result.length).toBe(NONE);
  });
});
