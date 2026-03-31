import type { CodeNode, FileNode, FunctionNode, TypeNode } from "../sost/tree.ts";
import { describe, expect, test } from "vite-plus/test";
import { getChildrenWithKeys } from "./children.ts";

const NONE = 0;
const ONE = 1;
const TWO = 2;

function makeFunctionNode(overrides: Partial<FunctionNode> = {}): FunctionNode {
  return {
    key: "func:/src/app.ts:run",
    kind: "function",
    name: "run",
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
    key: "type:/src/app.ts:Config",
    kind: "type",
    name: "Config",
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

function makeFileNode(overrides: Partial<FileNode> = {}): FileNode {
  return {
    key: "file:/src/app.ts",
    kind: "file",
    name: "app.ts",
    identity: [],
    leaf: [],
    childKeys: [],
    parentKey: null,
    patterns: null,
    companion: null,
    util: false,
    helper: false,
    residuals: [],
    hash: "file1234",
    exported: false,
    description: undefined,
    ...overrides,
  };
}

function buildNodeMap(nodes: CodeNode[]): Map<string, CodeNode> {
  const map = new Map<string, CodeNode>();
  for (const node of nodes) {
    map.set(node.key, node);
  }
  return map;
}

describe("getChildrenWithKeys — resolves existing keys", () => {
  test("returns child nodes paired with their keys", () => {
    const fn = makeFunctionNode();
    const ty = makeTypeNode();
    const file = makeFileNode({
      childKeys: [fn.key, ty.key],
    });
    const nodes = buildNodeMap([file, fn, ty]);

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
    const fn = makeFunctionNode();
    const file = makeFileNode({
      childKeys: [fn.key, "func:/src/app.ts:missing"],
    });
    const nodes = buildNodeMap([file, fn]);

    const result = getChildrenWithKeys(file, nodes);

    expect(result.length).toBe(ONE);
    expect(result[NONE].key).toBe(fn.key);
  });

  test("returns empty array when all child keys are missing", () => {
    const file = makeFileNode({
      childKeys: ["func:/src/app.ts:gone", "type:/src/app.ts:gone"],
    });
    const nodes = buildNodeMap([file]);

    const result = getChildrenWithKeys(file, nodes);

    expect(result.length).toBe(NONE);
  });
});

describe("getChildrenWithKeys — leaf nodes", () => {
  test("returns empty array for function nodes (empty childKeys)", () => {
    const fn = makeFunctionNode();
    const nodes = buildNodeMap([fn]);

    const result = getChildrenWithKeys(fn, nodes);

    expect(result.length).toBe(NONE);
  });

  test("returns empty array for type nodes (empty childKeys)", () => {
    const ty = makeTypeNode();
    const nodes = buildNodeMap([ty]);

    const result = getChildrenWithKeys(ty, nodes);

    expect(result.length).toBe(NONE);
  });
});

describe("getChildrenWithKeys — empty parent", () => {
  test("returns empty array for file with no childKeys", () => {
    const file = makeFileNode({ childKeys: [] });
    const nodes = buildNodeMap([file]);

    const result = getChildrenWithKeys(file, nodes);

    expect(result.length).toBe(NONE);
  });
});
