import type { CodeNode, FunctionNode, NodeMap, PatternNode, TypeNode } from "../sost/tree.ts";
import { describe, expect, test } from "vite-plus/test";
import { getCalls, isCallerCallee } from "./helpers.ts";

const NONE = 0;
const TWO = 2;

function makeFunctionNode(overrides: Partial<FunctionNode> = {}): FunctionNode {
  return {
    key: "func:/src/app.ts:doStuff",
    kind: "function",
    name: "doStuff",
    identity: [],
    leaf: [],
    childKeys: [],
    parentKey: "file:/src/app.ts",
    patterns: null,
    companion: null,
    util: false,
    helper: false,
    residuals: [],
    hash: "abc12345",
    exported: true,
    description: undefined,
    calls: [],
    returnsType: "void",
    documentedParams: NONE,
    hasReturnDoc: false,
    pure: false,
    causes: undefined,
    paramNames: [],
    paramTypes: [],
    ...overrides,
  };
}

function makeTypeNode(overrides: Partial<TypeNode> = {}): TypeNode {
  return {
    key: "type:/src/app.ts:MyType",
    kind: "type",
    name: "MyType",
    identity: [],
    leaf: [],
    childKeys: [],
    parentKey: "file:/src/app.ts",
    patterns: null,
    companion: null,
    util: false,
    helper: false,
    residuals: [],
    hash: "def67890",
    exported: true,
    description: undefined,
    ...overrides,
  };
}

describe("getCalls — function nodes", () => {
  test("returns calls array from a function node", () => {
    const node = makeFunctionNode({ calls: ["helperA", "helperB"] });
    const result = getCalls(node);

    expect(result).toEqual(["helperA", "helperB"]);
    expect(result.length).toBe(TWO);
  });

  test("returns empty array for function with no calls", () => {
    const node = makeFunctionNode({ calls: [] });
    const result = getCalls(node);

    expect(result).toEqual([]);
    expect(result.length).toBe(NONE);
  });
});

describe("getCalls — non-function nodes", () => {
  test("returns empty array for type nodes", () => {
    const node = makeTypeNode();
    const result = getCalls(node);

    expect(result.length).toBe(NONE);
  });

  test("returns the same empty reference for all non-function nodes", () => {
    const typeA = makeTypeNode({ name: "A" });
    const typeB = makeTypeNode({ name: "B" });

    expect(getCalls(typeA)).toBe(getCalls(typeB));
  });
});

describe("isCallerCallee — positive cases", () => {
  test("returns true when first node calls second by name", () => {
    const caller = makeFunctionNode({
      name: "process",
      calls: ["validate"],
    });
    const callee = makeFunctionNode({ name: "validate", calls: [] });

    expect(isCallerCallee(caller, callee)).toBe(true);
  });

  test("returns true when second node calls first by name", () => {
    const callee = makeFunctionNode({ name: "transform", calls: [] });
    const caller = makeFunctionNode({
      name: "run",
      calls: ["transform"],
    });

    expect(isCallerCallee(callee, caller)).toBe(true);
  });
});

describe("isCallerCallee — negative cases", () => {
  test("returns false when neither node calls the other", () => {
    const a = makeFunctionNode({ name: "alpha", calls: ["gamma"] });
    const b = makeFunctionNode({ name: "beta", calls: ["delta"] });

    expect(isCallerCallee(a, b)).toBe(false);
  });

  test("returns false for type nodes with no calls", () => {
    const t1 = makeTypeNode({ name: "Config" });
    const t2 = makeTypeNode({ name: "Options" });

    expect(isCallerCallee(t1, t2)).toBe(false);
  });

  test("returns false when mixed type and function with no relationship", () => {
    const fn: CodeNode = makeFunctionNode({
      name: "render",
      calls: ["draw"],
    });
    const ty: CodeNode = makeTypeNode({ name: "Style" });

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
    ...overrides,
  };
}

describe("isCallerCallee — pattern nodes", () => {
  test("returns true when function calls a child of the pattern node", () => {
    const child = makeFunctionNode({ key: "func:/src/app.ts:writeFiles", name: "writeFiles" });
    const pattern = makePatternNode({ childKeys: [child.key] });
    const caller = makeFunctionNode({ name: "writeUnits", calls: ["writeFiles"] });
    const nodes: NodeMap = new Map<string, CodeNode>([
      [child.key, child],
      [pattern.key, pattern],
      [caller.key, caller],
    ]);

    expect(isCallerCallee(caller, pattern, nodes)).toBe(true);
  });

  test("returns true regardless of argument order", () => {
    const child = makeFunctionNode({ key: "func:/src/app.ts:writeFiles", name: "writeFiles" });
    const pattern = makePatternNode({ childKeys: [child.key] });
    const caller = makeFunctionNode({ name: "writeUnits", calls: ["writeFiles"] });
    const nodes: NodeMap = new Map<string, CodeNode>([
      [child.key, child],
      [pattern.key, pattern],
      [caller.key, caller],
    ]);

    expect(isCallerCallee(pattern, caller, nodes)).toBe(true);
  });

  test("returns false when function does not call any pattern children", () => {
    const child = makeFunctionNode({ key: "func:/src/app.ts:writeFiles", name: "writeFiles" });
    const pattern = makePatternNode({ childKeys: [child.key] });
    const caller = makeFunctionNode({ name: "readAll", calls: ["readFiles"] });
    const nodes: NodeMap = new Map<string, CodeNode>([
      [child.key, child],
      [pattern.key, pattern],
      [caller.key, caller],
    ]);

    expect(isCallerCallee(caller, pattern, nodes)).toBe(false);
  });

  test("returns false without nodes map", () => {
    const pattern = makePatternNode({ childKeys: ["func:/src/app.ts:writeFiles"] });
    const caller = makeFunctionNode({ name: "writeUnits", calls: ["writeFiles"] });

    expect(isCallerCallee(caller, pattern)).toBe(false);
  });
});
