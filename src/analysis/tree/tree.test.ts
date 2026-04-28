import type {
  KuralDirectory,
  KuralFile,
  KuralFunction,
  KuralType,
} from "../ingestion/parse/types.ts";
import { buildTree, getAncestors, getChildren, getEligibleChildren, isLeaf } from "./tree.ts";
import { describe, expect, it } from "vite-plus/test";
import { makeDir, toNodeMap } from "../../../tests/helpers/audits.ts";
import type { ParseResult } from "../ingestion/parse/pipeline.ts";

const NONE = 0;
const FIRST_LINE = 1;
const ONE = 1;
const TWO = 2;
const FOUR = 4;
const FIVE = 5;

/** Safely gets a node from the map, failing the test if absent. */
function getNode(
  nodes: ReturnType<typeof buildTree>,
  key: string,
): ReturnType<ReturnType<typeof buildTree>["get"]> & object {
  const node = nodes.get(key);
  if (node === undefined) {
    throw new Error(`Expected node "${key}" to exist`);
  }
  return node;
}

function makeFunction(overrides: Partial<KuralFunction> = {}): KuralFunction {
  return {
    name: "doStuff",
    path: "/src/app.ts",
    identityEmbedding: [],
    leafEmbedding: [],
    params: ["string"],
    paramNames: ["input"],
    returns: "void",
    exported: true,
    pure: false,
    util: false,
    helper: false,
    residuals: [],
    calls: [],
    documentedParams: NONE,
    hasReturnDoc: false,
    description: undefined,
    startLine: FIRST_LINE,
    endLine: FIRST_LINE,
    ...overrides,
  };
}

function makeType(overrides: Partial<KuralType> = {}): KuralType {
  return {
    name: "MyType",
    path: "/src/app.ts",
    identityEmbedding: [],
    leafEmbedding: [],
    fields: {},
    exported: true,
    references: [],
    util: false,
    helper: false,
    residuals: [],
    description: undefined,
    startLine: FIRST_LINE,
    endLine: FIRST_LINE,
    ...overrides,
  };
}

function makeFile(overrides: Partial<KuralFile> = {}): KuralFile {
  return {
    name: "app.ts",
    path: "/src/app.ts",
    identityEmbedding: [],
    leafEmbedding: [],
    functions: {},
    types: {},
    imports: { internalImports: [], externalImports: [] },
    helper: false,
    residuals: [],
    description: undefined,
    ...overrides,
  };
}

function makeDirectory(overrides: Partial<KuralDirectory> = {}): KuralDirectory {
  return {
    name: "src",
    path: "/src",
    identityEmbedding: [],
    leafEmbedding: [],
    children: [],
    residuals: [],
    description: undefined,
    ...overrides,
  };
}

function makeParseResult(
  files: Record<string, KuralFile>,
  directories: Record<string, KuralDirectory>,
): ParseResult {
  return { files, directories };
}

describe("buildTree — function nodes", () => {
  it("creates a node with func: key prefix", () => {
    const fn = makeFunction({ name: "greet" });
    const file = makeFile({ functions: { greet: fn } });
    const result = makeParseResult({ "/src/app.ts": file }, {});
    const nodes = buildTree(result);

    expect(nodes.has("func:/src/app.ts:greet")).toBe(true);
  });

  it("sets kind to function on function nodes", () => {
    const fn = makeFunction({ name: "greet" });
    const file = makeFile({ functions: { greet: fn } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const node = nodes.get("func:/src/app.ts:greet");

    expect(node?.kind).toBe("function");
  });

  it("sets parentKey to file: prefix", () => {
    const fn = makeFunction({ name: "greet" });
    const file = makeFile({ functions: { greet: fn } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const node = nodes.get("func:/src/app.ts:greet");

    expect(node?.parentKey).toBe("file:/src/app.ts");
  });
});

describe("buildTree — type nodes", () => {
  it("creates a node with type: key prefix", () => {
    const type = makeType({ name: "User" });
    const file = makeFile({ types: { User: type } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    expect(nodes.has("type:/src/app.ts:User")).toBe(true);
  });

  it("sets kind to type on type nodes", () => {
    const type = makeType({ name: "User" });
    const file = makeFile({ types: { User: type } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const node = nodes.get("type:/src/app.ts:User");

    expect(node?.kind).toBe("type");
  });

  it("sets parentKey to file: prefix", () => {
    const type = makeType({ name: "User" });
    const file = makeFile({ types: { User: type } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const node = nodes.get("type:/src/app.ts:User");

    expect(node?.parentKey).toBe("file:/src/app.ts");
  });
});

describe("buildTree — file nodes", () => {
  it("creates a node with file: key prefix", () => {
    const file = makeFile();
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    expect(nodes.has("file:/src/app.ts")).toBe(true);
  });

  it("sets kind to file on file nodes", () => {
    const file = makeFile();
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const node = nodes.get("file:/src/app.ts");

    expect(node?.kind).toBe("file");
  });

  it("populates childKeys with leaf keys", () => {
    const fn = makeFunction({ name: "run" });
    const type = makeType({ name: "Config" });
    const file = makeFile({ functions: { run: fn }, types: { Config: type } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const node = nodes.get("file:/src/app.ts");

    expect(node?.childKeys).toContain("func:/src/app.ts:run");
    expect(node?.childKeys).toContain("type:/src/app.ts:Config");
    expect(node?.childKeys.length).toBe(TWO);
  });
});

describe("buildTree — directory nodes", () => {
  it("creates a node with dir: key prefix", () => {
    const dir = makeDirectory({ children: [] });
    const nodes = buildTree(makeParseResult({}, { "/src": dir }));

    expect(nodes.has("dir:/src")).toBe(true);
  });

  it("sets kind to directory on directory nodes", () => {
    const dir = makeDirectory({ children: [] });
    const nodes = buildTree(makeParseResult({}, { "/src": dir }));
    const node = nodes.get("dir:/src");

    expect(node?.kind).toBe("directory");
  });

  it("maps file children to file: keys", () => {
    const file = makeFile();
    const dir = makeDirectory({ children: ["/src/app.ts"] });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, { "/src": dir }));
    const node = nodes.get("dir:/src");

    expect(node?.childKeys).toContain("file:/src/app.ts");
  });

  it("maps subdirectory children to dir: keys", () => {
    const subDir = makeDirectory({ name: "utils", path: "/src/utils", children: [] });
    const dir = makeDirectory({ children: ["/src/utils"] });
    const result = makeParseResult({}, { "/src": dir, "/src/utils": subDir });
    const nodes = buildTree(result);
    const node = nodes.get("dir:/src");

    expect(node?.childKeys).toContain("dir:/src/utils");
  });
});

describe("buildTree — wireParents", () => {
  it("sets parentKey on file children of a directory", () => {
    const file = makeFile();
    const dir = makeDirectory({ children: ["/src/app.ts"] });
    const result = makeParseResult({ "/src/app.ts": file }, { "/src": dir });
    const nodes = buildTree(result);

    expect(nodes.get("file:/src/app.ts")?.parentKey).toBe("dir:/src");
  });

  it("sets parentKey on subdirectory children", () => {
    const subDir = makeDirectory({ name: "utils", path: "/src/utils", children: [] });
    const dir = makeDirectory({ children: ["/src/utils"] });
    const result = makeParseResult({}, { "/src": dir, "/src/utils": subDir });
    const nodes = buildTree(result);

    expect(nodes.get("dir:/src/utils")?.parentKey).toBe("dir:/src");
  });
});

describe("buildTree — detectHelpers", () => {
  it("marks unexported function as helper when called by 2+ siblings", () => {
    const helper = makeFunction({ name: "validate", exported: false, calls: [] });
    const callerA = makeFunction({ name: "createUser", calls: ["validate"] });
    const callerB = makeFunction({ name: "updateUser", calls: ["validate"] });
    const file = makeFile({
      functions: { validate: helper, createUser: callerA, updateUser: callerB },
    });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    expect(nodes.get("func:/src/app.ts:validate")?.helper).toBe(true);
  });

  it("does not mark exported function as helper", () => {
    const target = makeFunction({ name: "validate", exported: true, calls: [] });
    const callerA = makeFunction({ name: "a", calls: ["validate"] });
    const callerB = makeFunction({ name: "b", calls: ["validate"] });
    const file = makeFile({
      functions: { validate: target, a: callerA, b: callerB },
    });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    expect(nodes.get("func:/src/app.ts:validate")?.helper).toBe(false);
  });

  it("does not mark function called by only one sibling", () => {
    const target = makeFunction({ name: "validate", exported: false, calls: [] });
    const caller = makeFunction({ name: "a", calls: ["validate"] });
    const file = makeFile({ functions: { validate: target, a: caller } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    expect(nodes.get("func:/src/app.ts:validate")?.helper).toBe(false);
  });
});

describe("buildTree — propagateUtil", () => {
  it("marks file as util when all children are util", () => {
    const fnA = makeFunction({ name: "a", util: true });
    const fnB = makeFunction({ name: "b", util: true });
    const file = makeFile({ functions: { a: fnA, b: fnB } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    expect(nodes.get("file:/src/app.ts")?.util).toBe(true);
  });

  it("does not mark file as util when some children are not util", () => {
    const fnA = makeFunction({ name: "a", util: true });
    const fnB = makeFunction({ name: "b", util: false });
    const file = makeFile({ functions: { a: fnA, b: fnB } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    expect(nodes.get("file:/src/app.ts")?.util).toBe(false);
  });

  it("does not mark empty file as util", () => {
    const file = makeFile();
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    expect(nodes.get("file:/src/app.ts")?.util).toBe(false);
  });
});

describe("buildTree — total node count", () => {
  it("creates the correct number of nodes", () => {
    const fn = makeFunction({ name: "run" });
    const type = makeType({ name: "Config" });
    const file = makeFile({ functions: { run: fn }, types: { Config: type } });
    const dir = makeDirectory({ children: ["/src/app.ts"] });
    const result = makeParseResult({ "/src/app.ts": file }, { "/src": dir });
    const nodes = buildTree(result);

    expect(nodes.size).toBe(FOUR);
  });
});

describe("getChildren", () => {
  it("resolves child keys to node instances", () => {
    const fn = makeFunction({ name: "run" });
    const type = makeType({ name: "Config" });
    const file = makeFile({ functions: { run: fn }, types: { Config: type } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const children = getChildren(getNode(nodes, "file:/src/app.ts"), nodes);

    expect(children.length).toBe(TWO);
  });

  it("returns empty array for leaf nodes", () => {
    const fn = makeFunction({ name: "run" });
    const file = makeFile({ functions: { run: fn } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const children = getChildren(getNode(nodes, "func:/src/app.ts:run"), nodes);

    expect(children.length).toBe(NONE);
  });

  it("skips keys that do not exist in the map", () => {
    const dir = makeDirectory({ children: ["/src/missing.ts"] });
    const nodes = buildTree(makeParseResult({}, { "/src": dir }));
    const children = getChildren(getNode(nodes, "dir:/src"), nodes);

    expect(children.length).toBe(NONE);
  });
});

describe("getEligibleChildren", () => {
  it("excludes util nodes from children", () => {
    const utilFn = makeFunction({ name: "helper", util: true });
    const normalFn = makeFunction({ name: "main", util: false });
    const file = makeFile({ functions: { helper: utilFn, main: normalFn } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const eligible = getEligibleChildren(getNode(nodes, "file:/src/app.ts"), nodes);

    expect(eligible.length).toBe(ONE);
    expect(eligible[NONE].name).toBe("main");
  });

  it("returns all children when none are util", () => {
    const fnA = makeFunction({ name: "a" });
    const fnB = makeFunction({ name: "b" });
    const file = makeFile({ functions: { a: fnA, b: fnB } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const eligible = getEligibleChildren(getNode(nodes, "file:/src/app.ts"), nodes);

    expect(eligible.length).toBe(TWO);
  });

  it("returns all children for util parent (sandbox)", () => {
    const fnA = makeFunction({ name: "a", util: true });
    const fnB = makeFunction({ name: "b", util: true });
    const file = makeFile({ functions: { a: fnA, b: fnB } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const eligible = getEligibleChildren(getNode(nodes, "file:/src/app.ts"), nodes);

    expect(eligible.length).toBe(TWO);
  });
});

describe("isLeaf", () => {
  it("returns true for function nodes", () => {
    const fn = makeFunction({ name: "run" });
    const file = makeFile({ functions: { run: fn } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    expect(isLeaf(getNode(nodes, "func:/src/app.ts:run"))).toBe(true);
  });

  it("returns true for type nodes", () => {
    const type = makeType({ name: "User" });
    const file = makeFile({ types: { User: type } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    expect(isLeaf(getNode(nodes, "type:/src/app.ts:User"))).toBe(true);
  });

  it("returns false for file nodes", () => {
    const file = makeFile();
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    expect(isLeaf(getNode(nodes, "file:/src/app.ts"))).toBe(false);
  });

  it("returns false for directory nodes", () => {
    const dir = makeDirectory({ children: [] });
    const nodes = buildTree(makeParseResult({}, { "/src": dir }));
    expect(isLeaf(getNode(nodes, "dir:/src"))).toBe(false);
  });
});

describe("getAncestors", () => {
  const CAP = 3;

  it("walks parent pointers upward, excluding the start and the root", () => {
    const root = makeDir({ key: "dir:/src", name: "src", parentKey: null });
    const analysis = makeDir({
      key: "dir:/src/analysis",
      name: "analysis",
      parentKey: "dir:/src",
    });
    const place = makeDir({
      key: "dir:/src/analysis/place",
      name: "place",
      parentKey: "dir:/src/analysis",
    });
    const nodes = toNodeMap(root, analysis, place);

    const result = getAncestors("dir:/src/analysis/place", nodes, CAP);

    expect(result.length).toBe(ONE);
    expect(result[NONE].name).toBe("analysis");
  });

  it("respects the cap", () => {
    const root = makeDir({ key: "dir:/", name: "/", parentKey: null });
    const a = makeDir({ key: "dir:/a", name: "a", parentKey: "dir:/" });
    const b = makeDir({ key: "dir:/a/b", name: "b", parentKey: "dir:/a" });
    const c = makeDir({ key: "dir:/a/b/c", name: "c", parentKey: "dir:/a/b" });
    const nodes = toNodeMap(root, a, b, c);

    expect(getAncestors("dir:/a/b/c", nodes, ONE).length).toBe(ONE);
    expect(getAncestors("dir:/a/b/c", nodes, TWO).length).toBe(TWO);
  });

  it("returns empty when the start key is missing", () => {
    expect(getAncestors("dir:/missing", toNodeMap(), CAP).length).toBe(NONE);
  });
});

describe("buildTree — discriminated union narrowing", () => {
  it("narrows function node to access calls field", () => {
    const fn = makeFunction({ name: "run", calls: ["helper"] });
    const file = makeFile({ functions: { run: fn } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const node = nodes.get("func:/src/app.ts:run");

    if (node?.kind === "function") {
      expect(node.calls).toContain("helper");
    }
  });

  it("narrows file node to access non-empty childKeys", () => {
    const fn = makeFunction({ name: "run" });
    const file = makeFile({ functions: { run: fn } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    const node = nodes.get("file:/src/app.ts");

    if (node?.kind === "file") {
      expect(node.childKeys.length).toBe(ONE);
    }
  });
});

describe("materializePatterns", () => {
  it("creates a pattern node for 2+ leaves sharing the same pattern", () => {
    const fnA = makeFunction({ name: "fitA", patterns: ["fitMetric"] });
    const fnB = makeFunction({ name: "fitB", patterns: ["fitMetric"] });
    const file = makeFile({ functions: { fitA: fnA, fitB: fnB } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    expect(nodes.has("pattern:file:/src/app.ts:fitMetric")).toBe(true);
    const pNode = getNode(nodes, "pattern:file:/src/app.ts:fitMetric");
    expect(pNode.kind).toBe("pattern");
    expect(pNode.name).toBe("fitMetric");
  });

  it("reparents pattern members under the pattern node", () => {
    const fnA = makeFunction({ name: "fitA", patterns: ["fitMetric"] });
    const fnB = makeFunction({ name: "fitB", patterns: ["fitMetric"] });
    const file = makeFile({ functions: { fitA: fnA, fitB: fnB } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    const memberA = getNode(nodes, "func:/src/app.ts:fitA");
    const memberB = getNode(nodes, "func:/src/app.ts:fitB");
    expect(memberA.parentKey).toBe("pattern:file:/src/app.ts:fitMetric");
    expect(memberB.parentKey).toBe("pattern:file:/src/app.ts:fitMetric");
  });

  it("replaces members in file childKeys with the pattern node key", () => {
    const fnA = makeFunction({ name: "fitA", patterns: ["fitMetric"] });
    const fnB = makeFunction({ name: "fitB", patterns: ["fitMetric"] });
    const fnC = makeFunction({ name: "other" });
    const file = makeFile({ functions: { fitA: fnA, fitB: fnB, other: fnC } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    const fileNode = getNode(nodes, "file:/src/app.ts");
    expect(fileNode.childKeys).toContain("pattern:file:/src/app.ts:fitMetric");
    expect(fileNode.childKeys).toContain("func:/src/app.ts:other");
    expect(fileNode.childKeys).not.toContain("func:/src/app.ts:fitA");
    expect(fileNode.childKeys).not.toContain("func:/src/app.ts:fitB");
    expect(fileNode.childKeys.length).toBe(TWO);
  });

  it("computes centroid identity for the pattern node", () => {
    const fnA = makeFunction({
      name: "fitA",
      patterns: ["fitMetric"],
      identityEmbedding: [TWO, FOUR],
    });
    const fnB = makeFunction({
      name: "fitB",
      patterns: ["fitMetric"],
      identityEmbedding: [FOUR, TWO],
    });
    const file = makeFile({ functions: { fitA: fnA, fitB: fnB } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    const pNode = getNode(nodes, "pattern:file:/src/app.ts:fitMetric");
    const THREE = 3;
    expect(pNode.identity).toEqual([THREE, THREE]);
  });

  it("does not create a pattern node for a single-member group", () => {
    const fnA = makeFunction({ name: "fitA", patterns: ["fitMetric"] });
    const fnB = makeFunction({ name: "other" });
    const file = makeFile({ functions: { fitA: fnA, other: fnB } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    expect(nodes.has("pattern:file:/src/app.ts:fitMetric")).toBe(false);
    const memberA = getNode(nodes, "func:/src/app.ts:fitA");
    expect(memberA.parentKey).toBe("file:/src/app.ts");
  });

  it("creates separate pattern nodes for different pattern IDs", () => {
    const fnA = makeFunction({ name: "fitA", patterns: ["fitMetric"] });
    const fnB = makeFunction({ name: "fitB", patterns: ["fitMetric"] });
    const fnC = makeFunction({ name: "uniqA", patterns: ["uniquenessMetric"] });
    const fnD = makeFunction({ name: "uniqB", patterns: ["uniquenessMetric"] });
    const file = makeFile({ functions: { fitA: fnA, fitB: fnB, uniqA: fnC, uniqB: fnD } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    expect(nodes.has("pattern:file:/src/app.ts:fitMetric")).toBe(true);
    expect(nodes.has("pattern:file:/src/app.ts:uniquenessMetric")).toBe(true);
    const fileNode = getNode(nodes, "file:/src/app.ts");
    expect(fileNode.childKeys.length).toBe(TWO);
  });
});

describe("materializePatterns — nested", () => {
  it("creates nested pattern nodes for units with multiple pattern tags", () => {
    const fnA = makeFunction({ name: "a", patterns: ["outer", "inner"] });
    const fnB = makeFunction({ name: "b", patterns: ["outer", "inner"] });
    const fnC = makeFunction({ name: "c", patterns: ["outer"] });
    const file = makeFile({ functions: { a: fnA, b: fnB, c: fnC } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));

    const outerKey = "pattern:file:/src/app.ts:outer";
    const innerKey = "pattern:" + outerKey + ":inner";
    expect(nodes.has(outerKey)).toBe(true);
    expect(nodes.has(innerKey)).toBe(true);

    const outer = getNode(nodes, outerKey);
    expect(outer.childKeys).toContain(innerKey);
    expect(outer.childKeys).toContain("func:/src/app.ts:c");
    expect(outer.childKeys.length).toBe(TWO);

    const inner = getNode(nodes, innerKey);
    expect(inner.childKeys).toContain("func:/src/app.ts:a");
    expect(inner.childKeys).toContain("func:/src/app.ts:b");

    const memberA = getNode(nodes, "func:/src/app.ts:a");
    expect(memberA.parentKey).toBe(innerKey);
  });
});

describe("isLeaf — pattern nodes", () => {
  it("returns false for pattern nodes", () => {
    const fnA = makeFunction({ name: "fitA", patterns: ["fitMetric"] });
    const fnB = makeFunction({ name: "fitB", patterns: ["fitMetric"] });
    const file = makeFile({ functions: { fitA: fnA, fitB: fnB } });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, {}));
    expect(isLeaf(getNode(nodes, "pattern:file:/src/app.ts:fitMetric"))).toBe(false);
  });
});

describe("materializePatterns — cross-file basic", () => {
  it("attaches the pattern to the common directory when a tag spans two files", () => {
    const fnA = makeFunction({ name: "a", path: "/src/one.ts", patterns: ["commandFooter"] });
    const fnB = makeFunction({ name: "b", path: "/src/two.ts", patterns: ["commandFooter"] });
    const fileOne = makeFile({ name: "one.ts", path: "/src/one.ts", functions: { a: fnA } });
    const fileTwo = makeFile({ name: "two.ts", path: "/src/two.ts", functions: { b: fnB } });
    const dir = makeDirectory({ children: ["/src/one.ts", "/src/two.ts"] });
    const nodes = buildTree(
      makeParseResult({ "/src/one.ts": fileOne, "/src/two.ts": fileTwo }, { "/src": dir }),
    );

    const pKey = "pattern:dir:/src:commandFooter";
    expect(nodes.has(pKey)).toBe(true);
    const pNode = getNode(nodes, pKey);
    expect(pNode.parentKey).toBe("dir:/src");
    expect(pNode.childKeys).toContain("func:/src/one.ts:a");
    expect(pNode.childKeys).toContain("func:/src/two.ts:b");
    expect(getNode(nodes, "dir:/src").childKeys).toContain(pKey);
  });

  it("reparents singleton members and removes them from their file childKeys", () => {
    const fnA = makeFunction({ name: "a", path: "/src/one.ts", patterns: ["commandFooter"] });
    const fnB = makeFunction({ name: "b", path: "/src/two.ts", patterns: ["commandFooter"] });
    const fileOne = makeFile({ name: "one.ts", path: "/src/one.ts", functions: { a: fnA } });
    const fileTwo = makeFile({ name: "two.ts", path: "/src/two.ts", functions: { b: fnB } });
    const dir = makeDirectory({ children: ["/src/one.ts", "/src/two.ts"] });
    const nodes = buildTree(
      makeParseResult({ "/src/one.ts": fileOne, "/src/two.ts": fileTwo }, { "/src": dir }),
    );

    const pKey = "pattern:dir:/src:commandFooter";
    expect(getNode(nodes, "func:/src/one.ts:a").parentKey).toBe(pKey);
    expect(getNode(nodes, "func:/src/two.ts:b").parentKey).toBe(pKey);
    expect(getNode(nodes, "file:/src/one.ts").childKeys).not.toContain("func:/src/one.ts:a");
    expect(getNode(nodes, "file:/src/two.ts").childKeys).not.toContain("func:/src/two.ts:b");
  });
});

describe("materializePatterns — cross-file NCA", () => {
  it("attaches the pattern to the nearest common ancestor across subdirectories", () => {
    const fnA = makeFunction({ name: "a", path: "/src/a/one.ts", patterns: ["commandFooter"] });
    const fnB = makeFunction({ name: "b", path: "/src/b/two.ts", patterns: ["commandFooter"] });
    const fileOne = makeFile({ name: "one.ts", path: "/src/a/one.ts", functions: { a: fnA } });
    const fileTwo = makeFile({ name: "two.ts", path: "/src/b/two.ts", functions: { b: fnB } });
    const dirA = makeDirectory({ name: "a", path: "/src/a", children: ["/src/a/one.ts"] });
    const dirB = makeDirectory({ name: "b", path: "/src/b", children: ["/src/b/two.ts"] });
    const dirSrc = makeDirectory({ children: ["/src/a", "/src/b"] });
    const nodes = buildTree(
      makeParseResult(
        { "/src/a/one.ts": fileOne, "/src/b/two.ts": fileTwo },
        { "/src": dirSrc, "/src/a": dirA, "/src/b": dirB },
      ),
    );

    const pKey = "pattern:dir:/src:commandFooter";
    expect(nodes.has(pKey)).toBe(true);
    expect(getNode(nodes, pKey).parentKey).toBe("dir:/src");
    expect(getNode(nodes, "dir:/src").childKeys).toContain(pKey);
  });
});

describe("materializePatterns — cross-file negative", () => {
  it("does not create a cross-file pattern when only one file carries the tag", () => {
    const fnA = makeFunction({ name: "a", path: "/src/one.ts", patterns: ["commandFooter"] });
    const fnB = makeFunction({ name: "b", path: "/src/two.ts" });
    const fileOne = makeFile({ name: "one.ts", path: "/src/one.ts", functions: { a: fnA } });
    const fileTwo = makeFile({ name: "two.ts", path: "/src/two.ts", functions: { b: fnB } });
    const dir = makeDirectory({ children: ["/src/one.ts", "/src/two.ts"] });
    const nodes = buildTree(
      makeParseResult({ "/src/one.ts": fileOne, "/src/two.ts": fileTwo }, { "/src": dir }),
    );

    expect(nodes.has("pattern:dir:/src:commandFooter")).toBe(false);
    expect(getNode(nodes, "func:/src/one.ts:a").parentKey).toBe("file:/src/one.ts");
  });

  it("does not create a cross-file pattern when all tagged members share one file", () => {
    const fnA = makeFunction({ name: "a", patterns: ["fitMetric"] });
    const fnB = makeFunction({ name: "b", patterns: ["fitMetric"] });
    const file = makeFile({ functions: { a: fnA, b: fnB } });
    const dir = makeDirectory({ children: ["/src/app.ts"] });
    const nodes = buildTree(makeParseResult({ "/src/app.ts": file }, { "/src": dir }));

    expect(nodes.has("pattern:dir:/src:fitMetric")).toBe(false);
    expect(nodes.has("pattern:file:/src/app.ts:fitMetric")).toBe(true);
  });
});

describe("materializePatterns — cross-file centroid", () => {
  it("averages representative identity vectors into the pattern centroid", () => {
    const fnA = makeFunction({
      name: "a",
      path: "/src/one.ts",
      patterns: ["commandFooter"],
      identityEmbedding: [TWO, FOUR],
    });
    const fnB = makeFunction({
      name: "b",
      path: "/src/two.ts",
      patterns: ["commandFooter"],
      identityEmbedding: [FOUR, TWO],
    });
    const fileOne = makeFile({ name: "one.ts", path: "/src/one.ts", functions: { a: fnA } });
    const fileTwo = makeFile({ name: "two.ts", path: "/src/two.ts", functions: { b: fnB } });
    const dir = makeDirectory({ children: ["/src/one.ts", "/src/two.ts"] });
    const nodes = buildTree(
      makeParseResult({ "/src/one.ts": fileOne, "/src/two.ts": fileTwo }, { "/src": dir }),
    );

    const THREE = 3;
    const pNode = getNode(nodes, "pattern:dir:/src:commandFooter");
    expect(pNode.identity).toEqual([THREE, THREE]);
  });
});

describe("materializePatterns — cross-file mixed", () => {
  it("uses the in-file pattern as the file representative and stacks it under the cross-file pattern", () => {
    const fnA1 = makeFunction({ name: "a1", path: "/src/one.ts", patterns: ["commandFooter"] });
    const fnA2 = makeFunction({ name: "a2", path: "/src/one.ts", patterns: ["commandFooter"] });
    const fnB = makeFunction({ name: "b", path: "/src/two.ts", patterns: ["commandFooter"] });
    const fileOne = makeFile({
      name: "one.ts",
      path: "/src/one.ts",
      functions: { a1: fnA1, a2: fnA2 },
    });
    const fileTwo = makeFile({ name: "two.ts", path: "/src/two.ts", functions: { b: fnB } });
    const dir = makeDirectory({ children: ["/src/one.ts", "/src/two.ts"] });
    const nodes = buildTree(
      makeParseResult({ "/src/one.ts": fileOne, "/src/two.ts": fileTwo }, { "/src": dir }),
    );

    const crossKey = "pattern:dir:/src:commandFooter";
    const inFileKey = "pattern:file:/src/one.ts:commandFooter";
    expect(nodes.has(crossKey)).toBe(true);
    expect(nodes.has(inFileKey)).toBe(true);
    expect(getNode(nodes, crossKey).childKeys).toContain(inFileKey);
    expect(getNode(nodes, crossKey).childKeys).toContain("func:/src/two.ts:b");
    expect(getNode(nodes, inFileKey).parentKey).toBe(crossKey);
    expect(getNode(nodes, inFileKey).childKeys).toContain("func:/src/one.ts:a1");
    expect(getNode(nodes, inFileKey).childKeys).toContain("func:/src/one.ts:a2");
    expect(getNode(nodes, "file:/src/one.ts").childKeys).not.toContain(inFileKey);
  });
});

describe("buildTree — integration with multiple files", () => {
  it("builds correct tree for multi-file directory", () => {
    const fnA = makeFunction({ name: "a", path: "/src/one.ts" });
    const fnB = makeFunction({ name: "b", path: "/src/two.ts" });
    const fileOne = makeFile({ name: "one.ts", path: "/src/one.ts", functions: { a: fnA } });
    const fileTwo = makeFile({ name: "two.ts", path: "/src/two.ts", functions: { b: fnB } });
    const dir = makeDirectory({ children: ["/src/one.ts", "/src/two.ts"] });
    const result = makeParseResult(
      { "/src/one.ts": fileOne, "/src/two.ts": fileTwo },
      { "/src": dir },
    );
    const nodes = buildTree(result);

    expect(nodes.size).toBe(FIVE);
    expect(nodes.get("dir:/src")?.childKeys.length).toBe(TWO);
    expect(nodes.get("file:/src/one.ts")?.parentKey).toBe("dir:/src");
    expect(nodes.get("file:/src/two.ts")?.parentKey).toBe("dir:/src");
  });
});
