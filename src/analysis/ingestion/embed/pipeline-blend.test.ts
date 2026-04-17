import type { KuralFile, KuralFunction, KuralType } from "../parse/types.ts";
import { describe, expect, it } from "vite-plus/test";
import type { ParseResult } from "../parse/pipeline.ts";
import { embed } from "./pipeline.ts";

const EMPTY: number[] = [];
const IDENTITY_WEIGHT = 0.5;
const NAME_WEIGHT = 0.7;
const PATH_WEIGHT = 0.3;
const DESC_WEIGHT = 0.7;
const PARENT_WEIGHT = 0.3;
const ARRAY_FIRST = 0;
const PAIR = 2;
const ROOT_PATH = "/src";
const DOMAIN_KEYWORDS = ["code", "structure", "scoring"];
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
    documentedParams: 0,
    hasReturnDoc: false,
    startLine: FIRST_LINE,
    endLine: FIRST_LINE,
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

  return {
    files: { "/src/models/user.ts": file },
    directories: {
      "/src/models": {
        name: "models",
        path: "/src/models",
        identityEmbedding: EMPTY,
        leafEmbedding: EMPTY,
        children: ["/src/models/user.ts"],
        description: "Model directory",
        residuals: [],
      },
    },
  };
}

/** Mock embedder that returns a single-dimension vector from string length. */
async function lengthEmbedder(sigs: string[]): Promise<number[][]> {
  const mapped = await Promise.resolve(sigs.map((sig) => [sig.length]));
  return mapped;
}

describe("embed name facet blending", () => {
  it("name facet is blended with path signal at 0.7/0.3", async () => {
    const result = makeParseResult();
    await embed(result, lengthEmbedder, {
      rootPath: ROOT_PATH,
      domainKeywords: DOMAIN_KEYWORDS,
    });
    const type = result.files["/src/models/user.ts"].types["User"];
    const nameLen = "User".length;
    const pathLen = "code/structure/scoring/models/".length;
    const nameFacet = nameLen * NAME_WEIGHT + pathLen * PATH_WEIGHT;
    const descLen = "A user".length;
    const parentDescLen = "User module".length;
    const descFacet = descLen * DESC_WEIGHT + parentDescLen * PARENT_WEIGHT;
    const expected = nameFacet * IDENTITY_WEIGHT + descFacet * IDENTITY_WEIGHT;
    expect(type.identityEmbedding[ARRAY_FIRST]).toBeCloseTo(expected);
  });
  it("leaf blends identity with signature", async () => {
    const result = makeParseResult();
    await embed(result, lengthEmbedder, {
      rootPath: ROOT_PATH,
      domainKeywords: DOMAIN_KEYWORDS,
    });
    const type = result.files["/src/models/user.ts"].types["User"];
    const nameLen = "User".length;
    const pathLen = "code/structure/scoring/models/".length;
    const nameFacet = nameLen * NAME_WEIGHT + pathLen * PATH_WEIGHT;
    const descLen = "A user".length;
    const parentDescLen = "User module".length;
    const descFacet = descLen * DESC_WEIGHT + parentDescLen * PARENT_WEIGHT;
    const identityVal = nameFacet * IDENTITY_WEIGHT + descFacet * IDENTITY_WEIGHT;
    const sigLen = "fields: name (string)".length;
    const expected = identityVal * IDENTITY_WEIGHT + sigLen * IDENTITY_WEIGHT;
    expect(type.leafEmbedding[ARRAY_FIRST]).toBeCloseTo(expected);
  });
});
describe("embed root path signal", () => {
  it("directory at root gets keyword-hyphen path signal", async () => {
    const result: ParseResult = {
      files: {},
      directories: {
        "/src": {
          name: "src",
          path: "/src",
          identityEmbedding: EMPTY,
          leafEmbedding: EMPTY,
          children: ["/src/models"],
          description: "Source root",
          residuals: [],
        },
      },
    };
    await embed(result, lengthEmbedder, {
      rootPath: ROOT_PATH,
      domainKeywords: DOMAIN_KEYWORDS,
    });
    const nameLen = "src".length;
    const pathLen = "code-structure-scoring/".length;
    const nameFacet = nameLen * NAME_WEIGHT + pathLen * PATH_WEIGHT;
    const descLen = "Source root".length;
    const expected = nameFacet * IDENTITY_WEIGHT + descLen * IDENTITY_WEIGHT;

    expect(result.directories["/src"].identityEmbedding[ARRAY_FIRST]).toBeCloseTo(expected);
  });
});
describe("embed container leaf uses mean of children", () => {
  it("file leaf signature is mean of children leaf embeddings", async () => {
    const result = makeParseResult();
    await embed(result, lengthEmbedder, {
      rootPath: ROOT_PATH,
      domainKeywords: DOMAIN_KEYWORDS,
    });
    const file = result.files["/src/models/user.ts"];
    const typeLeaf = file.types["User"].leafEmbedding[ARRAY_FIRST];
    const fnLeaf = file.functions["createUser"].leafEmbedding[ARRAY_FIRST];
    const childrenMean = (typeLeaf + fnLeaf) / PAIR;
    const nameLen = "user.ts".length;
    const pathLen = "code/structure/scoring/models/".length;
    const nameFacet = nameLen * NAME_WEIGHT + pathLen * PATH_WEIGHT;
    const descLen = "User module".length;
    const identityVal = nameFacet * IDENTITY_WEIGHT + descLen * IDENTITY_WEIGHT;
    const expected = identityVal * IDENTITY_WEIGHT + childrenMean * IDENTITY_WEIGHT;
    expect(file.leafEmbedding[ARRAY_FIRST]).toBeCloseTo(expected);
  });

  it("directory leaf signature is mean of children leaf embeddings", async () => {
    const result = makeParseResult();
    await embed(result, lengthEmbedder, {
      rootPath: ROOT_PATH,
      domainKeywords: DOMAIN_KEYWORDS,
    });
    const file = result.files["/src/models/user.ts"];
    const dir = result.directories["/src/models"];
    const fileLeaf = file.leafEmbedding[ARRAY_FIRST];
    const nameLen = "models".length;
    const pathLen = "code/structure/scoring/".length;
    const nameFacet = nameLen * NAME_WEIGHT + pathLen * PATH_WEIGHT;
    const descLen = "Model directory".length;
    const identityVal = nameFacet * IDENTITY_WEIGHT + descLen * IDENTITY_WEIGHT;
    const expected = identityVal * IDENTITY_WEIGHT + fileLeaf * IDENTITY_WEIGHT;
    expect(dir.leafEmbedding[ARRAY_FIRST]).toBeCloseTo(expected);
  });
});
