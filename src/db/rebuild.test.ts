import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeSnapshot, openSnapshot } from "./snapshot.ts";
import { mkdirSync, rmSync } from "node:fs";
import type { FunctionRow } from "./schemas.ts";
import type { OpenSnapshot } from "./snapshot.ts";
import { join } from "node:path";
import { rebuildParseResult } from "./rebuild.ts";
import { tmpdir } from "node:os";

const TWO = 2;
const NONE = 0;
const DOC_PARAMS = 1;

function makeTmpRoot(): string {
  const root = join(
    tmpdir(),
    `kural-rebuild-${String(Date.now())}-${String(Math.random()).slice(TWO)}`,
  );
  mkdirSync(root, { recursive: true });
  return root;
}

function makeFunctionRow(name: string, path: string): FunctionRow {
  return {
    name,
    path,
    description: `desc-${name}`,
    params: ["string"],
    paramNames: ["arg"],
    returnsType: "void",
    exported: true,
    pure: false,
    util: false,
    helper: false,
    residuals: [],
    calls: [],
    identityEmbedding: [],
    leafEmbedding: [],
    facetHash: "abc123",
    documentedParams: DOC_PARAMS,
    hasReturnDoc: false,
  };
}

function makeTypeRow(
  name: string,
  path: string,
): {
  name: string;
  path: string;
  description: string;
  fields: Record<string, string>;
  exported: boolean;
  refs: string[];
  util: boolean;
  helper: boolean;
  residuals: { audit: string; hash?: string }[];
  identityEmbedding: number[];
  leafEmbedding: number[];
  facetHash: string;
} {
  return {
    name,
    path,
    description: `desc-${name}`,
    fields: { id: "string" },
    exported: true,
    refs: ["other.ts"],
    util: false,
    helper: false,
    residuals: [],
    identityEmbedding: [],
    leafEmbedding: [],
    facetHash: "def456",
  };
}

function makeFileRow(
  name: string,
  path: string,
): {
  name: string;
  path: string;
  description: string;
  identityEmbedding: number[];
  leafEmbedding: number[];
  facetHash: string;
  importsInternal: string[];
  importsExternal: string[];
  residuals: { audit: string; hash?: string }[];
} {
  return {
    name,
    path,
    description: `desc-${name}`,
    identityEmbedding: [],
    leafEmbedding: [],
    facetHash: "ghi789",
    importsInternal: ["/src/other.ts"],
    importsExternal: ["zod"],
    residuals: [],
  };
}

let tmpRoot = "";
let snapshot: OpenSnapshot | undefined;

afterEach(async () => {
  if (snapshot !== undefined) {
    await closeSnapshot(snapshot);
    snapshot = undefined;
  }
  if (tmpRoot !== "") {
    rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = "";
  }
});

describe("rebuildParseResult — function indexing", () => {
  it("indexes functions under the correct file path", async () => {
    tmpRoot = makeTmpRoot();
    const dbPath = join(tmpRoot, "test.db");
    snapshot = await openSnapshot(dbPath);

    const fnRow = makeFunctionRow("doWork", "/src/app.ts");
    const fileRow = makeFileRow("app.ts", "/src/app.ts");
    const fnTx = snapshot.collections.functions.insert(fnRow);
    await fnTx.isPersisted.promise;
    const fileTx = snapshot.collections.files.insert(fileRow);
    await fileTx.isPersisted.promise;

    const result = rebuildParseResult(snapshot.collections);

    expect(result.files["/src/app.ts"].functions["doWork"]).toBeDefined();
    expect(result.files["/src/app.ts"].functions["doWork"].name).toBe("doWork");
  });
});

describe("rebuildParseResult — field translations", () => {
  it("maps returnsType to returns on functions", async () => {
    tmpRoot = makeTmpRoot();
    const dbPath = join(tmpRoot, "test.db");
    snapshot = await openSnapshot(dbPath);

    const fnRow = makeFunctionRow("compute", "/src/math.ts");
    fnRow.returnsType = "number";
    const fileRow = makeFileRow("math.ts", "/src/math.ts");
    const fnTx = snapshot.collections.functions.insert(fnRow);
    await fnTx.isPersisted.promise;
    const fileTx = snapshot.collections.files.insert(fileRow);
    await fileTx.isPersisted.promise;

    const result = rebuildParseResult(snapshot.collections);
    expect(result.files["/src/math.ts"].functions["compute"].returns).toBe("number");
  });

  it("maps refs to references on types", async () => {
    tmpRoot = makeTmpRoot();
    const dbPath = join(tmpRoot, "test.db");
    snapshot = await openSnapshot(dbPath);

    const typeRow = makeTypeRow("User", "/src/models.ts");
    const fileRow = makeFileRow("models.ts", "/src/models.ts");
    const typeTx = snapshot.collections.types.insert(typeRow);
    await typeTx.isPersisted.promise;
    const fileTx = snapshot.collections.files.insert(fileRow);
    await fileTx.isPersisted.promise;

    const result = rebuildParseResult(snapshot.collections);
    expect(result.files["/src/models.ts"].types["User"].references).toEqual(["other.ts"]);
  });
});

describe("rebuildParseResult — imports mapping", () => {
  it("maps importsInternal and importsExternal to imports", async () => {
    tmpRoot = makeTmpRoot();
    const dbPath = join(tmpRoot, "test.db");
    snapshot = await openSnapshot(dbPath);

    const fileRow = makeFileRow("app.ts", "/src/app.ts");
    const fileTx = snapshot.collections.files.insert(fileRow);
    await fileTx.isPersisted.promise;

    const result = rebuildParseResult(snapshot.collections);
    const file = result.files["/src/app.ts"];
    expect(file.imports.internalImports).toEqual(["/src/other.ts"]);
    expect(file.imports.externalImports).toEqual(["zod"]);
  });
});

describe("rebuildParseResult — multiple files and empty children", () => {
  it("gives distinct entries for two different file paths", async () => {
    tmpRoot = makeTmpRoot();
    const dbPath = join(tmpRoot, "test.db");
    snapshot = await openSnapshot(dbPath);

    const file1 = makeFileRow("a.ts", "/src/a.ts");
    const file2 = makeFileRow("b.ts", "/src/b.ts");
    const tx1 = snapshot.collections.files.insert(file1);
    await tx1.isPersisted.promise;
    const tx2 = snapshot.collections.files.insert(file2);
    await tx2.isPersisted.promise;

    const result = rebuildParseResult(snapshot.collections);
    expect(Object.keys(result.files)).toHaveLength(TWO);
    expect(result.files["/src/a.ts"].name).toBe("a.ts");
    expect(result.files["/src/b.ts"].name).toBe("b.ts");
  });

  it("gives empty function and type records for a file with no children", async () => {
    tmpRoot = makeTmpRoot();
    const dbPath = join(tmpRoot, "test.db");
    snapshot = await openSnapshot(dbPath);

    const fileRow = makeFileRow("empty.ts", "/src/empty.ts");
    const fileTx = snapshot.collections.files.insert(fileRow);
    await fileTx.isPersisted.promise;

    const result = rebuildParseResult(snapshot.collections);
    const file = result.files["/src/empty.ts"];
    expect(Object.keys(file.functions)).toHaveLength(NONE);
    expect(Object.keys(file.types)).toHaveLength(NONE);
  });
});
