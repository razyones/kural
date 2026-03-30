import type { CodeNode, DirectoryNode, FileNode, FunctionNode, NodeMap, TypeNode } from "./tree.ts";
import {
  NO_SIBLINGS,
  computeChildrenUniqueness,
  computeFit,
  computeUniqueness,
  findBestUncle,
} from "./metrics.ts";
import { describe, expect, it } from "vite-plus/test";

const NONE = 0;
const NEXT = 1;
const TOLERANCE = 10;
const HALF = 0.5;

/** Embedding component constants. */
const E0 = 0;
const E1 = 1;
const E03 = 0.3;
const E05 = 0.5;
const E07 = 0.7;
const E08 = 0.8;
const E09 = 0.9;

/** Reusable test vectors. */
const V_EMPTY: number[] = [];
const V_UNIT_X = [E1, E0, E0];
const V_UNIT_Y = [E0, E1, E0];
const V_UNIT_Z = [E0, E0, E1];
const V_SIMILAR_X = [E09, E03, E0];

/** Shared base properties for mock nodes. */
const BASE_FIELDS = {
  parentKey: null,
  patterns: null,
  companion: null,
  util: false,
  helper: false,
  residuals: [],
  hash: "deadbeef",
  exported: false,
  description: undefined,
};

function makeFunctionNode(
  overrides: Partial<FunctionNode> & { key: string; name: string },
): FunctionNode {
  return {
    kind: "function",
    identity: V_UNIT_X,
    leaf: V_UNIT_X,
    childKeys: [],
    calls: [],
    returnsType: "void",
    documentedParams: NONE,
    hasReturnDoc: false,
    pure: false,
    causes: undefined,
    paramNames: [],
    paramTypes: [],
    ...BASE_FIELDS,
    ...overrides,
  };
}

function makeTypeNode(overrides: Partial<TypeNode> & { key: string; name: string }): TypeNode {
  return {
    kind: "type",
    identity: V_UNIT_X,
    leaf: V_UNIT_X,
    childKeys: [],
    ...BASE_FIELDS,
    ...overrides,
  };
}

function makeFileNode(overrides: Partial<FileNode> & { key: string; name: string }): FileNode {
  return {
    kind: "file",
    identity: V_UNIT_X,
    leaf: V_UNIT_X,
    childKeys: [],
    ...BASE_FIELDS,
    ...overrides,
  };
}

function makeDirectoryNode(
  overrides: Partial<DirectoryNode> & { key: string; name: string },
): DirectoryNode {
  return {
    kind: "directory",
    identity: V_UNIT_X,
    leaf: V_UNIT_X,
    childKeys: [],
    ...BASE_FIELDS,
    ...overrides,
  };
}

function buildNodeMap(nodes: CodeNode[]): NodeMap {
  const map: NodeMap = new Map();
  for (const node of nodes) {
    map.set(node.key, node);
  }
  return map;
}

describe("computeFit returns null for util containers", () => {
  it("returns null for a util file node", () => {
    const parent = makeDirectoryNode({ key: "dir:root", name: "root" });
    const node = makeFileNode({
      key: "file:utils.ts",
      name: "utils",
      util: true,
      parentKey: "dir:root",
    });
    const nodes = buildNodeMap([parent, node]);
    expect(computeFit(node, nodes)).toBeNull();
  });

  it("returns null for a util directory node", () => {
    const parent = makeDirectoryNode({ key: "dir:root", name: "root" });
    const node = makeDirectoryNode({
      key: "dir:utils",
      name: "utils",
      util: true,
      parentKey: "dir:root",
    });
    const nodes = buildNodeMap([parent, node]);
    expect(computeFit(node, nodes)).toBeNull();
  });
});

describe("computeFit does NOT return null for util leaves", () => {
  it("returns a number for a util function node", () => {
    const parent = makeFileNode({ key: "file:p", name: "p" });
    const node = makeFunctionNode({ key: "func:f", name: "f", util: true, parentKey: "file:p" });
    const nodes = buildNodeMap([parent, node]);
    expect(computeFit(node, nodes)).not.toBeNull();
  });

  it("returns a number for a util type node", () => {
    const parent = makeFileNode({ key: "file:p", name: "p" });
    const node = makeTypeNode({ key: "type:T", name: "T", util: true, parentKey: "file:p" });
    const nodes = buildNodeMap([parent, node]);
    expect(computeFit(node, nodes)).not.toBeNull();
  });
});

describe("computeFit with empty embeddings", () => {
  it("returns 1 when parent identity is empty", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", identity: V_EMPTY });
    const node = makeFunctionNode({ key: "func:f", name: "f", parentKey: "file:p" });
    const nodes = buildNodeMap([parent, node]);
    expect(computeFit(node, nodes)).toBe(NEXT);
  });

  it("returns 1 when node leaf is empty", () => {
    const parent = makeFileNode({ key: "file:p", name: "p" });
    const node = makeFunctionNode({ key: "func:f", name: "f", leaf: V_EMPTY, parentKey: "file:p" });
    const nodes = buildNodeMap([parent, node]);
    expect(computeFit(node, nodes)).toBe(NEXT);
  });

  it("returns 1 when both embeddings are empty", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", identity: V_EMPTY });
    const node = makeFunctionNode({ key: "func:f", name: "f", leaf: V_EMPTY, parentKey: "file:p" });
    const nodes = buildNodeMap([parent, node]);
    expect(computeFit(node, nodes)).toBe(NEXT);
  });
});

describe("computeFit cosine similarity", () => {
  it("returns 1 when parent identity matches node leaf", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", identity: V_UNIT_X });
    const node = makeFunctionNode({
      key: "func:f",
      name: "f",
      leaf: V_UNIT_X,
      parentKey: "file:p",
    });
    const nodes = buildNodeMap([parent, node]);
    const result = computeFit(node, nodes);
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(NEXT, TOLERANCE);
  });

  it("returns approximately 0 for orthogonal vectors", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", identity: V_UNIT_X });
    const node = makeFunctionNode({
      key: "func:f",
      name: "f",
      leaf: V_UNIT_Y,
      parentKey: "file:p",
    });
    const nodes = buildNodeMap([parent, node]);
    const result = computeFit(node, nodes);
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(NONE, TOLERANCE);
  });

  it("works on non-util file nodes with parent", () => {
    const parent = makeDirectoryNode({ key: "dir:d", name: "d", identity: V_UNIT_X });
    const node = makeFileNode({ key: "file:a.ts", name: "a", leaf: V_UNIT_X, parentKey: "dir:d" });
    const nodes = buildNodeMap([parent, node]);
    const result = computeFit(node, nodes);
    expect(result).toBeCloseTo(NEXT, TOLERANCE);
  });
});

describe("computeUniqueness with too few children", () => {
  it("returns NO_SIBLINGS for all children when list is empty", () => {
    const parent = makeFileNode({ key: "file:p", name: "p" });
    const result = computeUniqueness(parent, []);
    expect(result.size).toBe(NONE);
  });

  it("returns NO_SIBLINGS with one child", () => {
    const parent = makeFileNode({ key: "file:p", name: "p" });
    const child = makeFunctionNode({ key: "func:a", name: "a" });
    const result = computeUniqueness(parent, [child]);
    expect(result.get("func:a")).toBe(NO_SIBLINGS);
  });

  it("returns NO_SIBLINGS when children have empty identities", () => {
    const parent = makeFileNode({ key: "file:p", name: "p" });
    const childA = makeFunctionNode({ key: "func:a", name: "a", identity: V_EMPTY });
    const childB = makeFunctionNode({ key: "func:b", name: "b", identity: V_EMPTY });
    const result = computeUniqueness(parent, [childA, childB]);
    expect(result.get("func:a")).toBe(NO_SIBLINGS);
    expect(result.get("func:b")).toBe(NO_SIBLINGS);
  });
});

describe("computeChildrenUniqueness with too few children", () => {
  it("returns NO_SIBLINGS when children is empty", () => {
    const parent = makeFileNode({ key: "file:p", name: "p" });
    const result = computeChildrenUniqueness(parent, []);
    expect(result.score).toBe(NO_SIBLINGS);
    expect(result.worstPair).toBeNull();
  });

  it("returns NO_SIBLINGS with one child", () => {
    const parent = makeFileNode({ key: "file:p", name: "p" });
    const child = makeFunctionNode({ key: "func:a", name: "a" });
    const result = computeChildrenUniqueness(parent, [child]);
    expect(result.score).toBe(NO_SIBLINGS);
    expect(result.worstPair).toBeNull();
  });
});

describe("computeUniqueness well-spread children", () => {
  it("returns scores in (0, 2) for spread children", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", identity: [E0, E0, E0] });
    const childA = makeFunctionNode({ key: "func:a", name: "a", identity: V_UNIT_X });
    const childB = makeFunctionNode({ key: "func:b", name: "b", identity: V_UNIT_Y });
    const childC = makeFunctionNode({ key: "func:c", name: "c", identity: V_UNIT_Z });
    const result = computeUniqueness(parent, [childA, childB, childC]);
    expect(result.get("func:a")).toBeGreaterThan(NONE);
    expect(result.get("func:b")).toBeGreaterThan(NONE);
    expect(result.get("func:c")).toBeGreaterThan(NONE);
  });
});

describe("computeChildrenUniqueness well-spread children", () => {
  it("returns a score in (0, 1] for spread children", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", identity: [E0, E0, E0] });
    const childA = makeFunctionNode({ key: "func:a", name: "a", identity: V_UNIT_X });
    const childB = makeFunctionNode({ key: "func:b", name: "b", identity: V_UNIT_Y });
    const childC = makeFunctionNode({ key: "func:c", name: "c", identity: V_UNIT_Z });
    const result = computeChildrenUniqueness(parent, [childA, childB, childC]);
    expect(result.score).toBeGreaterThan(NONE);
    expect(result.score).toBeLessThanOrEqual(NEXT);
  });

  it("returns score of 1 when pairwise distances are uniform", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", identity: [E0, E0, E0] });
    const childA = makeFunctionNode({ key: "func:a", name: "a", identity: V_UNIT_X });
    const childB = makeFunctionNode({ key: "func:b", name: "b", identity: V_UNIT_Y });
    const result = computeChildrenUniqueness(parent, [childA, childB]);
    expect(result.score).toBeCloseTo(NEXT, TOLERANCE);
  });
});

describe("computeChildrenUniqueness identical children", () => {
  it("returns 0 when all children have identical identity vectors", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", identity: [E0, E0, E0] });
    const childA = makeFunctionNode({ key: "func:a", name: "a", identity: V_UNIT_X });
    const childB = makeFunctionNode({ key: "func:b", name: "b", identity: V_UNIT_X });
    const result = computeChildrenUniqueness(parent, [childA, childB]);
    expect(result.score).toBe(NONE);
  });
});

describe("computeChildrenUniqueness worstPair tracking", () => {
  it("tracks the least-unique pair names", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", identity: [E0, E0, E0] });
    const childA = makeFunctionNode({ key: "func:a", name: "alpha", identity: V_UNIT_X });
    const childB = makeFunctionNode({ key: "func:b", name: "beta", identity: V_SIMILAR_X });
    const childC = makeFunctionNode({ key: "func:c", name: "gamma", identity: V_UNIT_Y });
    const result = computeChildrenUniqueness(parent, [childA, childB, childC]);
    expect(result.worstPair).not.toBeNull();
    expect(result.worstPair).toContain("alpha");
    expect(result.worstPair).toContain("beta");
  });
});

describe("computeChildrenUniqueness pattern deduplication", () => {
  it("deduplicates children by pattern group", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", identity: [E0, E0, E0] });
    const childA = makeFunctionNode({
      key: "func:a",
      name: "a",
      identity: V_UNIT_X,
      patterns: "group-1",
    });
    const childB = makeFunctionNode({
      key: "func:b",
      name: "b",
      identity: V_UNIT_X,
      patterns: "group-1",
    });
    const childC = makeFunctionNode({ key: "func:c", name: "c", identity: V_UNIT_Y });
    const result = computeChildrenUniqueness(parent, [childA, childB, childC]);
    expect(result.score).toBeGreaterThan(NONE);
  });
});

describe("computeChildrenUniqueness companion deduplication", () => {
  it("deduplicates children by companion group", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", identity: [E0, E0, E0] });
    const childA = makeFunctionNode({
      key: "func:a",
      name: "a",
      identity: V_UNIT_X,
      companion: "comp-1",
    });
    const childB = makeFunctionNode({
      key: "func:b",
      name: "b",
      identity: V_UNIT_X,
      companion: "comp-1",
    });
    const childC = makeFunctionNode({ key: "func:c", name: "c", identity: V_UNIT_Y });
    const result = computeChildrenUniqueness(parent, [childA, childB, childC]);
    expect(result.score).toBeGreaterThan(NONE);
  });
});

describe("findBestUncle returns null for top-level nodes", () => {
  it("returns null when node has no parent", () => {
    const node = makeFunctionNode({ key: "func:f", name: "f", parentKey: null });
    const nodes = buildNodeMap([node]);
    expect(findBestUncle(node, nodes)).toBeNull();
  });

  it("returns null when parent has no parent (root level)", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", parentKey: null });
    const node = makeFunctionNode({ key: "func:f", name: "f", parentKey: "file:p" });
    const nodes = buildNodeMap([parent, node]);
    expect(findBestUncle(node, nodes)).toBeNull();
  });
});

describe("findBestUncle returns null edge cases", () => {
  it("returns null when parent is missing from map", () => {
    const node = makeFunctionNode({ key: "func:f", name: "f", parentKey: "file:missing" });
    const nodes = buildNodeMap([node]);
    expect(findBestUncle(node, nodes)).toBeNull();
  });

  it("returns null when grandparent is missing from map", () => {
    const parent = makeFileNode({ key: "file:p", name: "p", parentKey: "dir:missing" });
    const node = makeFunctionNode({ key: "func:f", name: "f", parentKey: "file:p" });
    const nodes = buildNodeMap([parent, node]);
    expect(findBestUncle(node, nodes)).toBeNull();
  });
});

describe("findBestUncle selects highest similarity uncle", () => {
  it("returns uncle with highest identity-leaf similarity", () => {
    const grandparent = makeDirectoryNode({
      key: "dir:gp",
      name: "gp",
      childKeys: ["file:parent", "file:uncle-a", "file:uncle-b"],
    });
    const parent = makeFileNode({
      key: "file:parent",
      name: "parent",
      parentKey: "dir:gp",
      identity: V_UNIT_Z,
    });
    const uncleA = makeFileNode({
      key: "file:uncle-a",
      name: "uncle-a",
      parentKey: "dir:gp",
      identity: V_UNIT_Y,
    });
    const uncleB = makeFileNode({
      key: "file:uncle-b",
      name: "uncle-b",
      parentKey: "dir:gp",
      identity: V_UNIT_X,
    });
    const node = makeFunctionNode({
      key: "func:f",
      name: "f",
      parentKey: "file:parent",
      leaf: V_UNIT_X,
    });
    const nodes = buildNodeMap([grandparent, parent, uncleA, uncleB, node]);
    const result = findBestUncle(node, nodes);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("uncle-b");
    expect(result?.score).toBeCloseTo(NEXT, TOLERANCE);
  });
});

describe("findBestUncle skips companion-paired uncles", () => {
  it("skips uncles sharing companion with parent", () => {
    const grandparent = makeDirectoryNode({
      key: "dir:gp",
      name: "gp",
      childKeys: ["file:parent", "file:companion-uncle", "file:other-uncle"],
    });
    const parent = makeFileNode({
      key: "file:parent",
      name: "parent",
      parentKey: "dir:gp",
      companion: "pair-1",
    });
    const companionUncle = makeFileNode({
      key: "file:companion-uncle",
      name: "companion-uncle",
      parentKey: "dir:gp",
      companion: "pair-1",
      identity: V_UNIT_X,
    });
    const otherUncle = makeFileNode({
      key: "file:other-uncle",
      name: "other-uncle",
      parentKey: "dir:gp",
      identity: V_UNIT_Y,
    });
    const node = makeFunctionNode({
      key: "func:f",
      name: "f",
      parentKey: "file:parent",
      leaf: V_UNIT_X,
    });
    const nodes = buildNodeMap([grandparent, parent, companionUncle, otherUncle, node]);
    const result = findBestUncle(node, nodes);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("other-uncle");
  });
});

describe("findBestUncle skips uncles with empty embeddings", () => {
  it("returns null when all uncles have empty identities", () => {
    const grandparent = makeDirectoryNode({
      key: "dir:gp",
      name: "gp",
      childKeys: ["file:parent", "file:uncle"],
    });
    const parent = makeFileNode({
      key: "file:parent",
      name: "parent",
      parentKey: "dir:gp",
    });
    const uncle = makeFileNode({
      key: "file:uncle",
      name: "uncle",
      parentKey: "dir:gp",
      identity: V_EMPTY,
    });
    const node = makeFunctionNode({
      key: "func:f",
      name: "f",
      parentKey: "file:parent",
      leaf: V_UNIT_X,
    });
    const nodes = buildNodeMap([grandparent, parent, uncle, node]);
    expect(findBestUncle(node, nodes)).toBeNull();
  });

  it("returns null when node leaf is empty", () => {
    const grandparent = makeDirectoryNode({
      key: "dir:gp",
      name: "gp",
      childKeys: ["file:parent", "file:uncle"],
    });
    const parent = makeFileNode({
      key: "file:parent",
      name: "parent",
      parentKey: "dir:gp",
    });
    const uncle = makeFileNode({
      key: "file:uncle",
      name: "uncle",
      parentKey: "dir:gp",
      identity: V_UNIT_X,
    });
    const node = makeFunctionNode({
      key: "func:f",
      name: "f",
      parentKey: "file:parent",
      leaf: V_EMPTY,
    });
    const nodes = buildNodeMap([grandparent, parent, uncle, node]);
    expect(findBestUncle(node, nodes)).toBeNull();
  });
});

describe("findBestUncle among multiple uncles", () => {
  it("picks the uncle closest to node leaf embedding", () => {
    const grandparent = makeDirectoryNode({
      key: "dir:gp",
      name: "gp",
      childKeys: ["file:parent", "file:u1", "file:u2", "file:u3"],
    });
    const parent = makeFileNode({
      key: "file:parent",
      name: "parent",
      parentKey: "dir:gp",
    });
    const uncleOne = makeFileNode({
      key: "file:u1",
      name: "u1",
      parentKey: "dir:gp",
      identity: V_UNIT_Z,
    });
    const uncleTwo = makeFileNode({
      key: "file:u2",
      name: "u2",
      parentKey: "dir:gp",
      identity: [E08, E05, E0],
    });
    const uncleThree = makeFileNode({
      key: "file:u3",
      name: "u3",
      parentKey: "dir:gp",
      identity: V_UNIT_Y,
    });
    const node = makeFunctionNode({
      key: "func:f",
      name: "f",
      parentKey: "file:parent",
      leaf: [E07, E05, E0],
    });
    const nodes = buildNodeMap([grandparent, parent, uncleOne, uncleTwo, uncleThree, node]);
    const result = findBestUncle(node, nodes);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("u2");
    expect(result?.score).toBeGreaterThan(HALF);
  });
});
