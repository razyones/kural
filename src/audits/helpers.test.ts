import type { CodeNode, NodeMap, PatternNode } from "../sost/tree.ts";
import { describe, expect, test } from "vite-plus/test";
import { getCalls, isCallerCallee } from "./helpers.ts";
import { makeFunction, makeType } from "../../tests/helpers/audits.ts";

const NONE = 0;
const TWO = 2;

describe("getCalls — function nodes", () => {
  test("returns calls array from a function node", () => {
    const node = makeFunction({ calls: ["helperA", "helperB"] });
    const result = getCalls(node);

    expect(result).toEqual(["helperA", "helperB"]);
    expect(result.length).toBe(TWO);
  });

  test("returns empty array for function with no calls", () => {
    const node = makeFunction({ calls: [] });
    const result = getCalls(node);

    expect(result).toEqual([]);
    expect(result.length).toBe(NONE);
  });
});

describe("getCalls — non-function nodes", () => {
  test("returns empty array for type nodes", () => {
    const node = makeType();
    const result = getCalls(node);

    expect(result.length).toBe(NONE);
  });

  test("returns the same empty reference for all non-function nodes", () => {
    const typeA = makeType({ name: "A" });
    const typeB = makeType({ name: "B" });

    expect(getCalls(typeA)).toBe(getCalls(typeB));
  });
});

describe("isCallerCallee — positive cases", () => {
  test("returns true when first node calls second by name", () => {
    const caller = makeFunction({
      name: "process",
      calls: ["validate"],
    });
    const callee = makeFunction({ name: "validate", calls: [] });

    expect(isCallerCallee(caller, callee)).toBe(true);
  });

  test("returns true when second node calls first by name", () => {
    const callee = makeFunction({ name: "transform", calls: [] });
    const caller = makeFunction({
      name: "run",
      calls: ["transform"],
    });

    expect(isCallerCallee(callee, caller)).toBe(true);
  });
});

describe("isCallerCallee — negative cases", () => {
  test("returns false when neither node calls the other", () => {
    const a = makeFunction({ name: "alpha", calls: ["gamma"] });
    const b = makeFunction({ name: "beta", calls: ["delta"] });

    expect(isCallerCallee(a, b)).toBe(false);
  });

  test("returns false for type nodes with no calls", () => {
    const t1 = makeType({ name: "Config" });
    const t2 = makeType({ name: "Options" });

    expect(isCallerCallee(t1, t2)).toBe(false);
  });

  test("returns false when mixed type and function with no relationship", () => {
    const fn: CodeNode = makeFunction({
      name: "render",
      calls: ["draw"],
    });
    const ty: CodeNode = makeType({ name: "Style" });

    expect(isCallerCallee(fn, ty)).toBe(false);
  });
});

function makePatternNode(overrides: Partial<PatternNode> = {}): PatternNode {
  return {
    key: "pattern:file:/src/app.ts:group",
    kind: "pattern",
    name: "group",
    identity: [],
    leaf: [],
    childKeys: [],
    parentKey: "file:/src/app.ts",
    patterns: null,
    companion: null,
    util: false,
    helper: false,
    residuals: [],
    hash: "pat12345",
    exported: false,
    description: undefined,
    bound: null,
    ...overrides,
  };
}

describe("isCallerCallee — pattern nodes", () => {
  test("returns true when function calls a child of the pattern node", () => {
    const child = makeFunction({ key: "func:/src/app.ts:writeFiles", name: "writeFiles" });
    const pattern = makePatternNode({ childKeys: [child.key] });
    const caller = makeFunction({ name: "writeUnits", calls: ["writeFiles"] });
    const nodes: NodeMap = new Map<string, CodeNode>([
      [child.key, child],
      [pattern.key, pattern],
      [caller.key, caller],
    ]);

    expect(isCallerCallee(caller, pattern, nodes)).toBe(true);
  });

  test("returns true regardless of argument order", () => {
    const child = makeFunction({ key: "func:/src/app.ts:writeFiles", name: "writeFiles" });
    const pattern = makePatternNode({ childKeys: [child.key] });
    const caller = makeFunction({ name: "writeUnits", calls: ["writeFiles"] });
    const nodes: NodeMap = new Map<string, CodeNode>([
      [child.key, child],
      [pattern.key, pattern],
      [caller.key, caller],
    ]);

    expect(isCallerCallee(pattern, caller, nodes)).toBe(true);
  });

  test("returns false when function does not call any pattern children", () => {
    const child = makeFunction({ key: "func:/src/app.ts:writeFiles", name: "writeFiles" });
    const pattern = makePatternNode({ childKeys: [child.key] });
    const caller = makeFunction({ name: "readAll", calls: ["readFiles"] });
    const nodes: NodeMap = new Map<string, CodeNode>([
      [child.key, child],
      [pattern.key, pattern],
      [caller.key, caller],
    ]);

    expect(isCallerCallee(caller, pattern, nodes)).toBe(false);
  });

  test("returns false without nodes map", () => {
    const pattern = makePatternNode({ childKeys: ["func:/src/app.ts:writeFiles"] });
    const caller = makeFunction({ name: "writeUnits", calls: ["writeFiles"] });

    expect(isCallerCallee(caller, pattern)).toBe(false);
  });
});
