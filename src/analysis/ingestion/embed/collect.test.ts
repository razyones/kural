import type { KuralDirectory, KuralFile, KuralFunction, KuralType } from "../parse/types.ts";
import { collectContainers, collectLeaves } from "./collect.ts";
import { describe, expect, it } from "vite-plus/test";
import type { ParseResult } from "../parse/pipeline.ts";
import { collapseByPattern } from "./containers.ts";

const EMPTY: number[] = [];
const ROOT_PATH = "/src";
const KEYWORDS = ["code", "structure"];
const DICTIONARY: Record<string, string> = {};

const NONE = 0;
const ARRAY_FIRST = 0;
const ARRAY_SECOND = 1;
const SINGLE = 1;
const PAIR = 2;
const QUADRUPLE = 4;
const FIRST_LINE = 1;

function makeType(overrides: Partial<KuralType> & { name: string }): KuralType {
  return {
    path: `/src/${overrides.name}.ts`,
    identityEmbedding: EMPTY,
    leafEmbedding: EMPTY,
    fields: {},
    exported: false,
    references: [],
    util: false,
    helper: false,
    residuals: [],
    startLine: FIRST_LINE,
    endLine: FIRST_LINE,
    ...overrides,
  };
}

function makeFunction(overrides: Partial<KuralFunction> & { name: string }): KuralFunction {
  return {
    path: `/src/${overrides.name}.ts`,
    identityEmbedding: EMPTY,
    leafEmbedding: EMPTY,
    params: [],
    paramNames: [],
    returns: "void",
    exported: false,
    pure: false,
    util: false,
    residuals: [],
    calls: [],
    helper: false,
    documentedParams: NONE,
    hasReturnDoc: false,
    startLine: FIRST_LINE,
    endLine: FIRST_LINE,
    ...overrides,
  };
}

function makeFile(
  name: string,
  types: Record<string, KuralType>,
  functions: Record<string, KuralFunction>,
  description?: string,
): KuralFile {
  return {
    name,
    path: `/src/${name}`,
    identityEmbedding: EMPTY,
    leafEmbedding: EMPTY,
    description,
    functions,
    types,
    imports: { internalImports: [], externalImports: [] },
    helper: false,
    residuals: [],
  };
}

function makeDir(name: string, children: string[], description?: string): KuralDirectory {
  return {
    name,
    path: `/src/${name}`,
    identityEmbedding: EMPTY,
    leafEmbedding: EMPTY,
    children,
    description,
    residuals: [],
    util: false,
  };
}

describe("collectLeaves", () => {
  it("collects types using typeSignature when symbolInfo is absent", () => {
    const userType = makeType({
      name: "User",
      description: "A user",
      fields: { name: "string", age: "number" },
      path: "/src/user.ts",
    });

    const file = makeFile("user.ts", { User: userType }, {}, "User module");
    const result: ParseResult = {
      files: { "/src/user.ts": file },
      directories: {},
    };

    const leaves = collectLeaves(result, ROOT_PATH, KEYWORDS, DICTIONARY);

    expect(leaves.units).toHaveLength(SINGLE);
    expect(leaves.names[ARRAY_FIRST]).toBe("User");
    expect(leaves.descs[ARRAY_FIRST]).toBe("A user");
    expect(leaves.parentDescs[ARRAY_FIRST]).toBe("User module");
    expect(leaves.sigs[ARRAY_FIRST]).toContain("fields:");
    expect(leaves.sigs[ARRAY_FIRST]).toContain("name (string)");
    expect(leaves.causes[ARRAY_FIRST]).toBe("");
    expect(leaves.calls[ARRAY_FIRST]).toBe("");
  });

  it("collects types using buildProse when symbolInfo is present", () => {
    const typeWithSymbol = makeType({
      name: "Config",
      fields: { port: "number" },
      path: "/src/config.ts",
      symbolInfo: {
        displayParts: [
          { text: "type", kind: "keyword" },
          { text: " ", kind: "space" },
          { text: "Config", kind: "aliasName" },
          { text: " ", kind: "space" },
          { text: "=", kind: "punctuation" },
          { text: " ", kind: "space" },
          { text: "{", kind: "punctuation" },
          { text: " ", kind: "space" },
          { text: "port", kind: "propertyName" },
          { text: ":", kind: "punctuation" },
          { text: " ", kind: "space" },
          { text: "number", kind: "keyword" },
          { text: ";", kind: "punctuation" },
          { text: " ", kind: "space" },
          { text: "}", kind: "punctuation" },
        ],
        documentation: "",
        tags: [],
      },
    });

    const file = makeFile("config.ts", { Config: typeWithSymbol }, {});
    const result: ParseResult = {
      files: { "/src/config.ts": file },
      directories: {},
    };

    const leaves = collectLeaves(result, ROOT_PATH, KEYWORDS, DICTIONARY);

    expect(leaves.sigs[ARRAY_FIRST]).toContain("port");
  });

  it("collects functions using functionSignature when symbolInfo is absent", () => {
    const fn = makeFunction({
      name: "createUser",
      description: "Creates a user",
      paramNames: ["name"],
      params: ["string"],
      returns: "User",
      path: "/src/user.ts",
    });

    const file = makeFile("user.ts", {}, { createUser: fn });
    const result: ParseResult = {
      files: { "/src/user.ts": file },
      directories: {},
    };

    const leaves = collectLeaves(result, ROOT_PATH, KEYWORDS, DICTIONARY);

    expect(leaves.units).toHaveLength(SINGLE);
    expect(leaves.names[ARRAY_FIRST]).toBe("createUser");
    expect(leaves.descs[ARRAY_FIRST]).toBe("Creates a user");
    expect(leaves.sigs[ARRAY_FIRST]).toContain("params:");
    expect(leaves.sigs[ARRAY_FIRST]).toContain("returns: User");
  });

  it("collects functions using buildProse when symbolInfo is present", () => {
    const fnWithSymbol = makeFunction({
      name: "getUser",
      returns: "User",
      path: "/src/user.ts",
      symbolInfo: {
        displayParts: [
          { text: "function", kind: "keyword" },
          { text: " ", kind: "space" },
          { text: "getUser", kind: "functionName" },
          { text: "(", kind: "punctuation" },
          { text: "id", kind: "parameterName" },
          { text: ":", kind: "punctuation" },
          { text: " ", kind: "space" },
          { text: "string", kind: "keyword" },
          { text: ")", kind: "punctuation" },
          { text: ":", kind: "punctuation" },
          { text: " ", kind: "space" },
          { text: "User", kind: "aliasName" },
        ],
        documentation: "",
        tags: [],
      },
    });

    const file = makeFile("user.ts", {}, { getUser: fnWithSymbol });
    const result: ParseResult = {
      files: { "/src/user.ts": file },
      directories: {},
    };

    const leaves = collectLeaves(result, ROOT_PATH, KEYWORDS, DICTIONARY);

    expect(leaves.sigs[ARRAY_FIRST]).toContain("id");
    expect(leaves.sigs[ARRAY_FIRST]).not.toContain("params:");
  });

  it("collects causes text from impure functions", () => {
    const fn = makeFunction({
      name: "saveUser",
      causes: "writes to database",
      path: "/src/user.ts",
    });

    const file = makeFile("user.ts", {}, { saveUser: fn });
    const result: ParseResult = {
      files: { "/src/user.ts": file },
      directories: {},
    };

    const leaves = collectLeaves(result, ROOT_PATH, KEYWORDS, DICTIONARY);

    expect(leaves.causes[ARRAY_FIRST]).toBe("writes to database");
  });

  it("collects calls text from functions with outbound calls", () => {
    const fn = makeFunction({
      name: "processUser",
      calls: ["validate", "persist"],
      path: "/src/user.ts",
    });

    const file = makeFile("user.ts", {}, { processUser: fn });
    const result: ParseResult = {
      files: { "/src/user.ts": file },
      directories: {},
    };

    const leaves = collectLeaves(result, ROOT_PATH, KEYWORDS, DICTIONARY);

    expect(leaves.calls[ARRAY_FIRST]).toBe("calls: validate, persist");
  });

  it("collects empty calls text for functions with no outbound calls", () => {
    const fn = makeFunction({
      name: "pureFn",
      calls: [],
      path: "/src/util.ts",
    });

    const file = makeFile("util.ts", {}, { pureFn: fn });
    const result: ParseResult = {
      files: { "/src/util.ts": file },
      directories: {},
    };

    const leaves = collectLeaves(result, ROOT_PATH, KEYWORDS, DICTIONARY);

    expect(leaves.calls[ARRAY_FIRST]).toBe("");
  });

  it("maps file children indices correctly", () => {
    const t = makeType({ name: "A", path: "/src/mod.ts" });
    const fn = makeFunction({ name: "b", path: "/src/mod.ts" });
    const file = makeFile("mod.ts", { A: t }, { b: fn });
    const result: ParseResult = {
      files: { "/src/mod.ts": file },
      directories: {},
    };

    const leaves = collectLeaves(result, ROOT_PATH, KEYWORDS, DICTIONARY);

    expect(leaves.fileChildIndices.get("/src/mod.ts")).toEqual([ARRAY_FIRST, ARRAY_SECOND]);
    expect(leaves.units).toHaveLength(PAIR);
  });

  it("uses empty string for missing file description", () => {
    const fn = makeFunction({ name: "helper", path: "/src/x.ts" });
    const file = makeFile("x.ts", {}, { helper: fn });
    const result: ParseResult = {
      files: { "/src/x.ts": file },
      directories: {},
    };

    const leaves = collectLeaves(result, ROOT_PATH, KEYWORDS, DICTIONARY);

    expect(leaves.parentDescs[ARRAY_FIRST]).toBe("");
  });

  it("uses empty string for missing type description", () => {
    const t = makeType({ name: "Empty", path: "/src/empty.ts" });
    const file = makeFile("empty.ts", { Empty: t }, {});
    const result: ParseResult = {
      files: { "/src/empty.ts": file },
      directories: {},
    };

    const leaves = collectLeaves(result, ROOT_PATH, KEYWORDS, DICTIONARY);

    expect(leaves.descs[ARRAY_FIRST]).toBe("");
  });

  it("uses empty string for missing function description", () => {
    const fn = makeFunction({ name: "unnamed", path: "/src/unnamed.ts" });
    const file = makeFile("unnamed.ts", {}, { unnamed: fn });
    const result: ParseResult = {
      files: { "/src/unnamed.ts": file },
      directories: {},
    };

    const leaves = collectLeaves(result, ROOT_PATH, KEYWORDS, DICTIONARY);

    expect(leaves.descs[ARRAY_FIRST]).toBe("");
  });

  it("returns empty data for empty parse result", () => {
    const result: ParseResult = { files: {}, directories: {} };

    const leaves = collectLeaves(result, ROOT_PATH, KEYWORDS, DICTIONARY);

    expect(leaves.units).toHaveLength(NONE);
    expect(leaves.names).toHaveLength(NONE);
    expect(leaves.fileChildIndices.size).toBe(NONE);
  });
});

describe("collectContainers", () => {
  it("collects files before directories", () => {
    const file = makeFile("app.ts", {}, {}, "App module");
    const dir = makeDir("src", ["/src/app.ts"], "Source root");
    const result: ParseResult = {
      files: { "/src/app.ts": file },
      directories: { "/src/src": dir },
    };

    const containers = collectContainers(result, ROOT_PATH, KEYWORDS);

    expect(containers.fileCount).toBe(SINGLE);
    expect(containers.units).toHaveLength(PAIR);
    expect(containers.names[ARRAY_FIRST]).toBe("app.ts");
    expect(containers.names[ARRAY_SECOND]).toBe("src");
    expect(containers.descs[ARRAY_FIRST]).toBe("App module");
    expect(containers.descs[ARRAY_SECOND]).toBe("Source root");
  });

  it("uses empty string for undefined file description", () => {
    const file = makeFile("bare.ts", {}, {});
    const result: ParseResult = {
      files: { "/src/bare.ts": file },
      directories: {},
    };

    const containers = collectContainers(result, ROOT_PATH, KEYWORDS);

    expect(containers.descs[ARRAY_FIRST]).toBe("");
  });

  it("uses empty string for undefined directory description", () => {
    const dir = makeDir("utils", []);
    const result: ParseResult = {
      files: {},
      directories: { "/src/utils": dir },
    };

    const containers = collectContainers(result, ROOT_PATH, KEYWORDS);

    expect(containers.descs[ARRAY_FIRST]).toBe("");
    expect(containers.dirs).toHaveLength(SINGLE);
    expect(containers.dirs[ARRAY_FIRST]).toBe(dir);
  });

  it("tracks unit paths correctly", () => {
    const file = makeFile("index.ts", {}, {}, "Entry");
    const dir = makeDir("lib", ["/src/index.ts"], "Lib");
    const result: ParseResult = {
      files: { "/src/index.ts": file },
      directories: { "/src/lib": dir },
    };

    const containers = collectContainers(result, ROOT_PATH, KEYWORDS);

    expect(containers.unitPaths[ARRAY_FIRST]).toBe("/src/index.ts");
    expect(containers.unitPaths[ARRAY_SECOND]).toBe("/src/lib");
  });

  it("returns empty data for empty parse result", () => {
    const result: ParseResult = { files: {}, directories: {} };

    const containers = collectContainers(result, ROOT_PATH, KEYWORDS);

    expect(containers.units).toHaveLength(NONE);
    expect(containers.fileCount).toBe(NONE);
    expect(containers.dirs).toHaveLength(NONE);
  });

  it("collects multiple files and directories", () => {
    const f1 = makeFile("a.ts", {}, {}, "A");
    const f2 = makeFile("b.ts", {}, {}, "B");
    const d1 = makeDir("d1", [], "Dir1");
    const d2 = makeDir("d2", [], "Dir2");
    const result: ParseResult = {
      files: { "/src/a.ts": f1, "/src/b.ts": f2 },
      directories: { "/src/d1": d1, "/src/d2": d2 },
    };

    const containers = collectContainers(result, ROOT_PATH, KEYWORDS);

    expect(containers.fileCount).toBe(PAIR);
    expect(containers.units).toHaveLength(QUADRUPLE);
    expect(containers.dirs).toHaveLength(PAIR);
  });
});

describe("collectContainers — @kuralBorrows prefix", () => {
  it("prepends borrows role to directory name", () => {
    const dir = makeDir("advise", [], "The desk.");
    dir.borrows = { target: "analysis/advise", role: "terminal surface" };
    const result: ParseResult = {
      files: {},
      directories: { "/src/advise": dir },
    };

    const containers = collectContainers(result, ROOT_PATH, KEYWORDS);

    expect(containers.names[ARRAY_FIRST]).toBe("terminal surface: advise");
  });

  it("prepends borrows role to directory description", () => {
    const dir = makeDir("advise", [], "The desk.");
    dir.borrows = { role: "terminal surface" };
    const result: ParseResult = {
      files: {},
      directories: { "/src/advise": dir },
    };

    const containers = collectContainers(result, ROOT_PATH, KEYWORDS);

    expect(containers.descs[ARRAY_FIRST]).toBe("Represent a terminal surface: The desk.");
  });

  it("leaves name and desc unchanged without borrows", () => {
    const dir = makeDir("utils", [], "Helpers.");
    const result: ParseResult = {
      files: {},
      directories: { "/src/utils": dir },
    };

    const containers = collectContainers(result, ROOT_PATH, KEYWORDS);

    expect(containers.names[ARRAY_FIRST]).toBe("utils");
    expect(containers.descs[ARRAY_FIRST]).toBe("Helpers.");
  });
});

describe("collapseByPattern", () => {
  it("passes ungrouped leaves through unchanged", () => {
    const solo = makeFunction({ name: "solo" });
    const leaves = collectLeaves(
      { files: { "/src/a.ts": makeFile("a.ts", {}, { solo }) }, directories: {} },
      ROOT_PATH,
      KEYWORDS,
      DICTIONARY,
    );
    const embeddings = [[SINGLE, PAIR]];
    const result = collapseByPattern([NONE], embeddings, leaves);

    expect(result).toEqual([[SINGLE, PAIR]]);
  });

  it("collapses pattern-tagged leaves to their centroid", () => {
    const fn1 = makeFunction({ name: "a", patterns: ["grp"] });
    const fn2 = makeFunction({ name: "b", patterns: ["grp"] });
    const leaves = collectLeaves(
      { files: { "/src/a.ts": makeFile("a.ts", {}, { a: fn1, b: fn2 }) }, directories: {} },
      ROOT_PATH,
      KEYWORDS,
      DICTIONARY,
    );
    const VEC_A = 2;
    const VEC_B = 4;
    const EXPECTED_MEAN = 3;
    const embeddings = [[VEC_A], [VEC_B]];
    const result = collapseByPattern([NONE, SINGLE], embeddings, leaves);

    expect(result.length).toBe(SINGLE);
    expect(result[NONE]).toEqual([EXPECTED_MEAN]);
  });

  it("returns centroids and ungrouped separately", () => {
    const fn1 = makeFunction({ name: "a", patterns: ["grp"] });
    const fn2 = makeFunction({ name: "b", patterns: ["grp"] });
    const fn3 = makeFunction({ name: "c" });
    const leaves = collectLeaves(
      { files: { "/src/a.ts": makeFile("a.ts", {}, { a: fn1, b: fn2, c: fn3 }) }, directories: {} },
      ROOT_PATH,
      KEYWORDS,
      DICTIONARY,
    );
    const embeddings = [[SINGLE], [PAIR], [QUADRUPLE]];
    const result = collapseByPattern([NONE, SINGLE, PAIR], embeddings, leaves);

    expect(result.length).toBe(PAIR);
  });

  it("skips empty embedding vectors during collapse", () => {
    const fn1 = makeFunction({ name: "a", patterns: ["grp"] });
    const fn2 = makeFunction({ name: "b", patterns: ["grp"] });
    const leaves = collectLeaves(
      { files: { "/src/a.ts": makeFile("a.ts", {}, { a: fn1, b: fn2 }) }, directories: {} },
      ROOT_PATH,
      KEYWORDS,
      DICTIONARY,
    );
    const VEC_A = 5;
    const embeddings: number[][] = [[VEC_A], []];
    const result = collapseByPattern([NONE, SINGLE], embeddings, leaves);

    expect(result.length).toBe(SINGLE);
    expect(result[NONE]).toEqual([VEC_A]);
  });

  it("collects patternIds aligned with units", () => {
    const fn1 = makeFunction({ name: "a", patterns: ["grp"] });
    const fn2 = makeFunction({ name: "b" });
    const leaves = collectLeaves(
      { files: { "/src/a.ts": makeFile("a.ts", {}, { a: fn1, b: fn2 }) }, directories: {} },
      ROOT_PATH,
      KEYWORDS,
      DICTIONARY,
    );

    expect(leaves.patternIds[NONE]).toBe("grp");
    expect(leaves.patternIds[SINGLE]).toBeUndefined();
  });
});
