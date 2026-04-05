import type { KuralFile, KuralFunction } from "../parse/types.ts";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ParseResult } from "../parse/pipeline.ts";
import { embed } from "./pipeline.ts";

const EMPTY: number[] = [];
const FACET_PASSES = 7;
const IDENTITY_WEIGHT = 0.5;
const NAME_WEIGHT = 0.7;
const PATH_WEIGHT = 0.3;
const SIGNATURE_WEIGHT = 0.7;
const CAUSES_WEIGHT = 0.3;
const ARRAY_FIRST = 0;
const ROOT_PATH = "/src";
const DOMAIN_KEYWORDS = ["code", "structure", "scoring"];

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

function makeFileWith(fns: Record<string, KuralFunction>, filePath: string): KuralFile {
  return {
    name: filePath.split("/").pop() ?? "",
    path: filePath,
    identityEmbedding: EMPTY,
    leafEmbedding: EMPTY,
    functions: fns,
    types: {},
    imports: { internalImports: [], externalImports: [] },
    residuals: [],
  };
}

function makeParseResult(): ParseResult {
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
    types: {},
    imports: { internalImports: [], externalImports: [] },
    residuals: [],
  };

  return {
    files: { "/src/models/user.ts": file },
    directories: {},
  };
}

async function lengthEmbedder(sigs: string[]): Promise<number[][]> {
  const mapped = await Promise.resolve(sigs.map((sig) => [sig.length]));
  return mapped;
}

describe("embed causes embedder calls", () => {
  it("embedder called 5 times when impure functions exist", async () => {
    const impureFn = makeFunction({
      name: "readFile",
      description: "Reads a file",
      causes: "reads a source file from disk via readFileSync",
      path: "/src/models/user.ts",
    });

    const file = makeFileWith({ readFile: impureFn }, "/src/models/user.ts");
    const result: ParseResult = { files: { "/src/models/user.ts": file }, directories: {} };
    const embedder = vi.fn(lengthEmbedder);
    await embed(result, embedder, { rootPath: ROOT_PATH, domainKeywords: DOMAIN_KEYWORDS });

    expect(embedder).toHaveBeenCalledTimes(FACET_PASSES);
  });

  it("embedder called 5 times when parent descs present and no causes", async () => {
    const result = makeParseResult();
    const embedder = vi.fn(lengthEmbedder);
    await embed(result, embedder, { rootPath: ROOT_PATH, domainKeywords: DOMAIN_KEYWORDS });

    expect(embedder).toHaveBeenCalledTimes(FACET_PASSES);
  });
});
describe("embed causes impure leaf blending", () => {
  it("impure function leaf uses causes-blended signature", async () => {
    const causesText = "reads a source file from disk";
    const impureFn = makeFunction({
      name: "readFile",
      description: "Reads a file",
      causes: causesText,
      path: "/src/models/user.ts",
    });

    const file = makeFileWith({ readFile: impureFn }, "/src/models/user.ts");
    const result: ParseResult = { files: { "/src/models/user.ts": file }, directories: {} };
    await embed(result, lengthEmbedder, { rootPath: ROOT_PATH, domainKeywords: DOMAIN_KEYWORDS });

    const nameLen = "readFile".length;
    const pathLen = "code/structure/scoring/models/".length;
    const nameFacet = nameLen * NAME_WEIGHT + pathLen * PATH_WEIGHT;
    const descLen = "Reads a file".length;
    const identityVal = nameFacet * IDENTITY_WEIGHT + descLen * IDENTITY_WEIGHT;
    const sigLen = "returns: void".length;
    const causesLen = causesText.length;
    const blendedSig = sigLen * SIGNATURE_WEIGHT + causesLen * CAUSES_WEIGHT;
    const expected = identityVal * IDENTITY_WEIGHT + blendedSig * IDENTITY_WEIGHT;

    expect(impureFn.leafEmbedding[ARRAY_FIRST]).toBeCloseTo(expected);
  });
});

describe("embed causes pure leaf unchanged", () => {
  it("pure function leaf uses raw signature without causes", async () => {
    const pureFn = makeFunction({
      name: "add",
      description: "Adds numbers",
      pure: true,
      params: ["number", "number"],
      paramNames: ["a", "b"],
      returns: "number",
      path: "/src/utils/math.ts",
    });

    const file = makeFileWith({ add: pureFn }, "/src/utils/math.ts");
    const result: ParseResult = { files: { "/src/utils/math.ts": file }, directories: {} };
    await embed(result, lengthEmbedder, { rootPath: ROOT_PATH, domainKeywords: DOMAIN_KEYWORDS });

    const nameLen = "add".length;
    const pathLen = "code/structure/scoring/utils/".length;
    const nameFacet = nameLen * NAME_WEIGHT + pathLen * PATH_WEIGHT;
    const descLen = "Adds numbers".length;
    const identityVal = nameFacet * IDENTITY_WEIGHT + descLen * IDENTITY_WEIGHT;
    const sigLen = "params: a (number), b (number) | returns: number".length;
    const expected = identityVal * IDENTITY_WEIGHT + sigLen * IDENTITY_WEIGHT;

    expect(pureFn.leafEmbedding[ARRAY_FIRST]).toBeCloseTo(expected);
  });
});
