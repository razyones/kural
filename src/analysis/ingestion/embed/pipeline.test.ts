import type { KuralDirectory, KuralFile, KuralFunction, KuralType } from "../parse/types.ts";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ParseResult } from "../parse/pipeline.ts";
import { embed } from "./pipeline.ts";

const EMPTY: number[] = [];
const FACET_PASSES = 7;
const ROOT_PATH = "/src";
const DOMAIN_KEYWORDS = ["code", "structure", "scoring"];

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
    documentedParams: 0,
    hasReturnDoc: false,
    ...overrides,
  };
}

function makeParseResult(): ParseResult {
  const userType = makeType({
    name: "User",
    description: "A user",
    exported: true,
    fields: { name: "string" },
    path: "/src/models/user.ts",
  });

  const createFn = makeFunction({
    name: "createUser",
    description: "Creates a user",
    exported: true,
    returns: "User",
    path: "/src/models/user.ts",
  });

  const file: KuralFile = {
    name: "user.ts",
    path: "/src/models/user.ts",
    identityEmbedding: EMPTY,
    leafEmbedding: EMPTY,
    description: "User module",
    functions: { createUser: createFn },
    types: { User: userType },
    imports: { internalImports: [], externalImports: [] },
    helper: false,
    residuals: [],
  };

  const dir: KuralDirectory = {
    name: "models",
    path: "/src/models",
    identityEmbedding: EMPTY,
    leafEmbedding: EMPTY,
    children: ["/src/models/user.ts"],
    description: "Model directory",
    residuals: [],
  };

  return {
    files: { "/src/models/user.ts": file },
    directories: { "/src/models": dir },
  };
}

/** Mock embedder that returns a single-dimension vector from string length. */
async function lengthEmbedder(sigs: string[]): Promise<number[][]> {
  const mapped = await Promise.resolve(sigs.map((sig) => [sig.length]));
  return mapped;
}

describe("embed populates units", () => {
  it("populates embeddings on all units", async () => {
    const result = makeParseResult();
    const embedder = vi.fn(lengthEmbedder);

    await embed(result, embedder, { rootPath: ROOT_PATH, domainKeywords: DOMAIN_KEYWORDS });

    const file = result.files["/src/models/user.ts"];
    expect(file.identityEmbedding).not.toEqual(EMPTY);
    expect(file.leafEmbedding).not.toEqual(EMPTY);

    expect(file.types["User"].identityEmbedding).not.toEqual(EMPTY);
    expect(file.types["User"].leafEmbedding).not.toEqual(EMPTY);

    expect(file.functions["createUser"].identityEmbedding).not.toEqual(EMPTY);
    expect(file.functions["createUser"].leafEmbedding).not.toEqual(EMPTY);

    expect(result.directories["/src/models"].identityEmbedding).not.toEqual(EMPTY);
    expect(result.directories["/src/models"].leafEmbedding).not.toEqual(EMPTY);
  });

  it("calls embedder five times: name, description, path, signatures, parent descriptions", async () => {
    const result = makeParseResult();
    const embedder = vi.fn(lengthEmbedder);

    await embed(result, embedder, { rootPath: ROOT_PATH, domainKeywords: DOMAIN_KEYWORDS });

    expect(embedder).toHaveBeenCalledTimes(FACET_PASSES);
  });
});

describe("embed counts", () => {
  it("returns unit count for populated result", async () => {
    const result = makeParseResult();
    const { total } = await embed(result, lengthEmbedder, {
      rootPath: ROOT_PATH,
      domainKeywords: DOMAIN_KEYWORDS,
    });

    expect(total).toBeGreaterThan(EMPTY.length);
  });

  it("returns zero for empty parse result", async () => {
    const result: ParseResult = { files: {}, directories: {} };
    const embedder = vi.fn(lengthEmbedder);

    const { total } = await embed(result, embedder, {
      rootPath: ROOT_PATH,
      domainKeywords: DOMAIN_KEYWORDS,
    });

    expect(total).toBe(EMPTY.length);
    expect(embedder).not.toHaveBeenCalled();
  });
});
