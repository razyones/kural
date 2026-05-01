import { describe, expect, it } from "vite-plus/test";
import { NO_SIBLINGS } from "./metrics.ts";
import type { ParseResult } from "../ingestion/parse/pipeline.ts";
import { score } from "./score.ts";

/** Numeric constants. */
const NONE = 0;
const ONE = 1;
const FIRST_LINE = 1;

/** Simple embedding vectors for test data. */
const EMB_X = 0.9;
const EMB_Y = 0.1;
const EMB_Z = 0.05;
const ID_VEC = [EMB_X, EMB_Y, EMB_Z];
const LEAF_VEC = [EMB_X, EMB_Y, EMB_Z];

/** A completely different embedding to produce low similarity. */
const ALT_X = 0.1;
const ALT_Y = 0.9;
const ALT_Z = 0.05;
const ALT_VEC = [ALT_X, ALT_Y, ALT_Z];

/** Builds a minimal ParseResult with no files or directories. */
function emptyResult(): ParseResult {
  return { files: {}, directories: {} };
}

/** Builds a ParseResult with one file containing a function. */
function singleFileResult(): ParseResult {
  return {
    files: {
      "src/a.ts": {
        name: "a.ts",
        path: "src/a.ts",
        identityEmbedding: ID_VEC,
        leafEmbedding: LEAF_VEC,
        description: "test file",
        functions: {
          doStuff: {
            name: "doStuff",
            path: "src/a.ts",
            identityEmbedding: ID_VEC,
            leafEmbedding: LEAF_VEC,
            description: "does stuff",
            params: ["string"],
            paramNames: ["input"],
            returns: "void",
            exported: true,
            pure: true,
            util: false,
            helper: false,
            residuals: [],
            calls: [],
            documentedParams: ONE,
            hasReturnDoc: false,
            startLine: FIRST_LINE,
            endLine: FIRST_LINE,
          },
        },
        types: {},
        imports: { internalImports: [], externalImports: [] },
        helper: false,
        residuals: [],
      },
    },
    directories: {},
  };
}

/** Builds a ParseResult with a file containing a util function. */
function utilFileResult(): ParseResult {
  return {
    files: {
      "src/util.ts": {
        name: "util.ts",
        path: "src/util.ts",
        identityEmbedding: ID_VEC,
        leafEmbedding: LEAF_VEC,
        description: "utility file",
        functions: {
          helper: {
            name: "helper",
            path: "src/util.ts",
            identityEmbedding: ID_VEC,
            leafEmbedding: LEAF_VEC,
            description: "a helper",
            params: [],
            paramNames: [],
            returns: "void",
            exported: true,
            pure: true,
            util: true,
            helper: false,
            residuals: [],
            calls: [],
            documentedParams: NONE,
            hasReturnDoc: false,
            startLine: FIRST_LINE,
            endLine: FIRST_LINE,
          },
        },
        types: {},
        imports: { internalImports: [], externalImports: [] },
        helper: false,
        residuals: [],
      },
    },
    directories: {},
  };
}

describe("score empty input", () => {
  it("returns empty array for empty ParseResult", () => {
    const cards = score(emptyResult());
    expect(cards).toEqual([]);
  });
});

describe("score single file", () => {
  it("returns score cards for files with children", () => {
    const cards = score(singleFileResult());
    expect(cards.length).toBeGreaterThan(NONE);
  });

  it("ScoreCards have correct kind field", () => {
    const cards = score(singleFileResult());
    const fileCard = cards.find((c) => c.kind === "file");
    expect(fileCard).toBeDefined();
    expect(fileCard?.kind).toBe("file");
  });
});

describe("score null overallScore", () => {
  it("util file under domain parent has null fit and null overallScore", () => {
    const cards = score(utilFileResult());
    const utilCard = cards.find((c) => c.name === "util.ts");
    expect(utilCard).toBeDefined();
    expect(utilCard?.fit).toBeNull();
    expect(utilCard?.overallScore).toBeNull();
  });

  it("util file gets childrenFit since util containers are now scored", () => {
    const cards = score(utilFileResult());
    const utilCard = cards.find((c) => c.name === "util.ts");
    expect(utilCard).toBeDefined();
    expect(utilCard?.childrenFit).not.toBeNull();
  });

  it("overallScore is null when uniqueness is NO_SIBLINGS", () => {
    const cards = score(singleFileResult());
    const fileCard = cards.find((c) => c.kind === "file");
    if (fileCard !== undefined && fileCard.uniqueness === NO_SIBLINGS) {
      expect(fileCard.overallScore).toBeNull();
    }
  });
});

/** Builds a ParseResult with two files inside a directory. */
function twoFileResult(): ParseResult {
  return {
    files: {
      "src/a.ts": makeKuralFile("a.ts", "src/a.ts", "fn1", ID_VEC),
      "src/b.ts": makeKuralFile("b.ts", "src/b.ts", "fn2", ALT_VEC),
    },
    directories: {
      src: {
        name: "src",
        path: "src",
        identityEmbedding: ID_VEC,
        leafEmbedding: LEAF_VEC,
        children: ["src/a.ts", "src/b.ts"],
        residuals: [],
        util: false,
      },
    },
  };
}

/** Builds a minimal KuralFile with one function. */
function makeKuralFile(
  name: string,
  path: string,
  fnName: string,
  vec: number[],
): {
  name: string;
  path: string;
  identityEmbedding: number[];
  leafEmbedding: number[];
  description: string;
  functions: Record<
    string,
    {
      name: string;
      path: string;
      identityEmbedding: number[];
      leafEmbedding: number[];
      description: string;
      params: string[];
      paramNames: string[];
      returns: string;
      exported: boolean;
      pure: boolean;
      util: boolean;
      helper: boolean;
      residuals: [];
      calls: string[];
      documentedParams: number;
      hasReturnDoc: boolean;
      startLine: number;
      endLine: number;
    }
  >;
  types: Record<string, never>;
  imports: { internalImports: string[]; externalImports: string[] };
  helper: boolean;
  residuals: [];
} {
  return {
    name,
    path,
    identityEmbedding: vec,
    leafEmbedding: vec,
    description: name,
    functions: {
      [fnName]: {
        name: fnName,
        path,
        identityEmbedding: vec,
        leafEmbedding: vec,
        description: fnName,
        params: [],
        paramNames: [],
        returns: "void",
        exported: true,
        pure: true,
        util: false,
        helper: false,
        residuals: [],
        calls: [],
        documentedParams: NONE,
        hasReturnDoc: false,
        startLine: FIRST_LINE,
        endLine: FIRST_LINE,
      },
    },
    types: {},
    imports: { internalImports: [], externalImports: [] },
    helper: false,
    residuals: [],
  };
}

describe("score card count", () => {
  it("produces one card per node including leaves", () => {
    const cards = score(twoFileResult());
    const FILE_COUNT = 2;
    const DIR_COUNT = 1;
    const FN_COUNT = 2;
    const EXPECTED_CARDS = FILE_COUNT + DIR_COUNT + FN_COUNT;
    expect(cards).toHaveLength(EXPECTED_CARDS);
  });

  it("leaf cards have null subtree fields", () => {
    const cards = score(twoFileResult());
    const leafCards = cards.filter((c) => c.kind === "function");
    expect(leafCards.length).toBeGreaterThan(NONE);
    for (const card of leafCards) {
      expect(card.subtreeFit).toBeNull();
      expect(card.subtreeUniqueness).toBeNull();
    }
  });

  it("childrenScore is null when file has a single child", () => {
    const cards = score(singleFileResult());
    const fileCard = cards.find((c) => c.kind === "file");
    expect(fileCard?.childrenScore).toBeNull();
  });
});

/** Opposing unit vectors produce a negative cosine fit, the case the rescale exists for. */
const POS_X = [ONE, NONE] as const;
const NEG_X = [-ONE, NONE] as const;

/** Builds a two-file ParseResult where one file's leaf opposes the directory identity. */
function adversarialResult(): ParseResult {
  return {
    files: {
      "src/a.ts": makeKuralFile("a.ts", "src/a.ts", "fn1", [...POS_X]),
      "src/b.ts": makeKuralFile("b.ts", "src/b.ts", "fn2", [...NEG_X]),
    },
    directories: {
      src: {
        name: "src",
        path: "src",
        identityEmbedding: [...POS_X],
        leafEmbedding: [...POS_X],
        children: ["src/a.ts", "src/b.ts"],
        residuals: [],
        util: false,
      },
    },
  };
}

describe("score range normalization", () => {
  it("keeps all score fields in [0, 1] even when a child's fit is negative", () => {
    const cards = score(adversarialResult());
    const fieldsToCheck = ["score", "childrenScore", "subtreeScore", "overallScore"] as const;
    for (const card of cards) {
      for (const field of fieldsToCheck) {
        const value = card[field];
        if (value === null) {
          continue;
        }
        expect(value).toBeGreaterThanOrEqual(NONE);
        expect(value).toBeLessThanOrEqual(ONE);
      }
    }
  });

  it("opposing leaf vector yields a negative fit but a clamped score", () => {
    const cards = score(adversarialResult());
    const bCard = cards.find((c) => c.name === "b.ts");
    expect(bCard?.fit).toBeLessThan(NONE);
    expect(bCard?.score).toBe(NONE);
  });
});
