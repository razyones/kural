import type { ContainerData, LeafData } from "./collect.ts";
import { applyParentSignal, applySignatureSignals, blend, cosineSimilarity } from "./blend.ts";
import { blendDirectories, blendFiles, buildContainerIdentities } from "./containers.ts";
import { describe, expect, it } from "vite-plus/test";
import { centroid } from "../../utils/vectors.ts";

const HALF = 0.5;
const TOLERANCE = 1e-6;
const ONE = 1;
const TWO = 2;
const THREE = 3;
const FOUR = 4;
const FIVE = 5;
const SIX = 6;
const ZERO = 0;
const ARRAY_FIRST = 0;
const ARRAY_SECOND = 1;
const ARRAY_THIRD = 2;
const NAME_WEIGHT = 0.7;
const SIGNAL_WEIGHT = 0.3;
const SIG_A = 10;
const SIG_B = 20;
const CAUSES_A = 100;
const CAUSES_B = 200;

describe("blend equal weights", () => {
  it("blends two vectors with equal weights", () => {
    const a = [ONE, ZERO, ZERO];
    const b = [ZERO, ONE, ZERO];
    const result = blend(a, HALF, b, HALF);

    expect(result[ARRAY_FIRST]).toBeCloseTo(HALF, TOLERANCE);
    expect(result[ARRAY_SECOND]).toBeCloseTo(HALF, TOLERANCE);
    expect(result[ARRAY_THIRD]).toBeCloseTo(ZERO, TOLERANCE);
  });

  it("handles identical vectors", () => {
    const v = [THREE, FOUR, FIVE];
    const result = blend(v, HALF, v, HALF);

    expect(result[ARRAY_FIRST]).toBeCloseTo(THREE, TOLERANCE);
    expect(result[ARRAY_SECOND]).toBeCloseTo(FOUR, TOLERANCE);
    expect(result[ARRAY_THIRD]).toBeCloseTo(FIVE, TOLERANCE);
  });
});

describe("blend unequal weights", () => {
  it("respects unequal weights", () => {
    const a = [ONE, ZERO];
    const b = [ZERO, ONE];
    const result = blend(a, NAME_WEIGHT, b, SIGNAL_WEIGHT);

    expect(result[ARRAY_FIRST]).toBeCloseTo(NAME_WEIGHT, TOLERANCE);
    expect(result[ARRAY_SECOND]).toBeCloseTo(SIGNAL_WEIGHT, TOLERANCE);
  });
});

describe("blend edge cases", () => {
  it("returns first vector when second is empty", () => {
    const a = [ONE, TWO, THREE];
    const result = blend(a, HALF, [], HALF);

    expect(result).toEqual(a);
  });

  it("returns second vector when first is empty", () => {
    const b = [FOUR, FIVE, SIX];
    const result = blend([], HALF, b, HALF);

    expect(result).toEqual(b);
  });

  it("returns empty when both are empty", () => {
    const result = blend([], HALF, [], HALF);

    expect(result).toEqual([]);
  });
});

describe("cosineSimilarity basic", () => {
  it("returns 1 for identical unit vectors", () => {
    const v = [ONE, ZERO, ZERO];
    const result = cosineSimilarity(v, v);

    expect(result).toBeCloseTo(ONE, TOLERANCE);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [ONE, ZERO, ZERO];
    const b = [ZERO, ONE, ZERO];
    const result = cosineSimilarity(a, b);

    expect(result).toBeCloseTo(ZERO, TOLERANCE);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [ONE, ZERO];
    const b = [-ONE, ZERO];
    const result = cosineSimilarity(a, b);

    expect(result).toBeCloseTo(-ONE, TOLERANCE);
  });

  it("handles non-unit vectors", () => {
    const a = [THREE, FOUR];
    const b = [SIX, ZERO];
    const EXPECTED_COS = 0.6;
    const result = cosineSimilarity(a, b);

    expect(result).toBeCloseTo(EXPECTED_COS, TOLERANCE);
  });
});

describe("cosineSimilarity edge cases", () => {
  it("returns 0 when either vector is zero", () => {
    const a = [ONE, TWO];
    const b = [ZERO, ZERO];
    const result = cosineSimilarity(a, b);

    expect(result).toBeCloseTo(ZERO, TOLERANCE);
  });

  it("returns 0 for empty vectors", () => {
    const result = cosineSimilarity([], []);

    expect(result).toBeCloseTo(ZERO, TOLERANCE);
  });
});

describe("centroid basic", () => {
  it("computes element-wise mean of vectors", () => {
    const result = centroid([
      [TWO, FOUR],
      [SIX, TWO],
    ]);

    expect(result[ARRAY_FIRST]).toBeCloseTo(FOUR, TOLERANCE);
    expect(result[ARRAY_SECOND]).toBeCloseTo(THREE, TOLERANCE);
  });

  it("returns the vector itself for a single input", () => {
    const result = centroid([[THREE, FIVE]]);

    expect(result[ARRAY_FIRST]).toBeCloseTo(THREE, TOLERANCE);
    expect(result[ARRAY_SECOND]).toBeCloseTo(FIVE, TOLERANCE);
  });
});

describe("centroid edge cases", () => {
  it("ignores empty vectors", () => {
    const result = centroid([[TWO, FOUR], [], [SIX, TWO]]);

    expect(result[ARRAY_FIRST]).toBeCloseTo(FOUR, TOLERANCE);
    expect(result[ARRAY_SECOND]).toBeCloseTo(THREE, TOLERANCE);
  });

  it("returns empty when all vectors are empty", () => {
    const result = centroid([[], []]);

    expect(result).toEqual([]);
  });

  it("returns empty for empty input array", () => {
    const result = centroid([]);

    expect(result).toEqual([]);
  });
});

const SINGLE_SIG = 0.7;
const SINGLE_SIGNAL = 0.3;
const BOTH_SIG = 0.6;
const BOTH_CAUSES = 0.25;
const BOTH_CALLS = 0.15;
const CALLS_A = 50;
const CALLS_B = 80;

describe("applySignatureSignals", () => {
  it("returns signature unchanged when both signals are empty", () => {
    const sig = [ONE, TWO, THREE];
    expect(applySignatureSignals(sig, [], [])).toEqual([ONE, TWO, THREE]);
  });

  it("blends causes only at 0.7/0.3", () => {
    const sig = [SIG_A, SIG_B];
    const causes = [CAUSES_A, CAUSES_B];
    const result = applySignatureSignals(sig, causes, []);
    expect(result[ARRAY_FIRST]).toBeCloseTo(SIG_A * SINGLE_SIG + CAUSES_A * SINGLE_SIGNAL);
    expect(result[ARRAY_SECOND]).toBeCloseTo(SIG_B * SINGLE_SIG + CAUSES_B * SINGLE_SIGNAL);
  });

  it("blends calls only at 0.7/0.3", () => {
    const sig = [SIG_A, SIG_B];
    const calls = [CALLS_A, CALLS_B];
    const result = applySignatureSignals(sig, [], calls);
    expect(result[ARRAY_FIRST]).toBeCloseTo(SIG_A * SINGLE_SIG + CALLS_A * SINGLE_SIGNAL);
    expect(result[ARRAY_SECOND]).toBeCloseTo(SIG_B * SINGLE_SIG + CALLS_B * SINGLE_SIGNAL);
  });

  it("blends both at 0.6/0.25/0.15", () => {
    const sig = [SIG_A, SIG_B];
    const causes = [CAUSES_A, CAUSES_B];
    const calls = [CALLS_A, CALLS_B];
    const result = applySignatureSignals(sig, causes, calls);
    const e0 = SIG_A * BOTH_SIG + CAUSES_A * BOTH_CAUSES + CALLS_A * BOTH_CALLS;
    const e1 = SIG_B * BOTH_SIG + CAUSES_B * BOTH_CAUSES + CALLS_B * BOTH_CALLS;
    expect(result[ARRAY_FIRST]).toBeCloseTo(e0);
    expect(result[ARRAY_SECOND]).toBeCloseTo(e1);
  });
});

const DESC_WEIGHT = 0.7;
const PARENT_WEIGHT = 0.3;
const DESC_A = 10;
const DESC_B = 20;
const PARENT_A = 100;
const PARENT_B = 200;

describe("applyParentSignal", () => {
  it("returns description unchanged when parent vector is empty", () => {
    const desc = [ONE, TWO, THREE];
    expect(applyParentSignal(desc, [])).toEqual([ONE, TWO, THREE]);
  });

  it("blends description with parent at 0.7/0.3", () => {
    const desc = [DESC_A, DESC_B];
    const parent = [PARENT_A, PARENT_B];
    const result = applyParentSignal(desc, parent);

    const expected0 = desc[ARRAY_FIRST] * DESC_WEIGHT + parent[ARRAY_FIRST] * PARENT_WEIGHT;
    const expected1 = desc[ARRAY_SECOND] * DESC_WEIGHT + parent[ARRAY_SECOND] * PARENT_WEIGHT;
    expect(result[ARRAY_FIRST]).toBeCloseTo(expected0);
    expect(result[ARRAY_SECOND]).toBeCloseTo(expected1);
  });

  it("returns description when both are empty", () => {
    expect(applyParentSignal([], [])).toEqual([]);
  });
});

const ID_WEIGHT = 0.5;

describe("blendFiles — outward 2x weight", () => {
  it("gives outward-bound child double weight in file leaf", () => {
    const outwardLeaf = [ONE, ZERO];
    const normalLeaf = [ZERO, ONE];
    const fileIdentity = [ZERO, ZERO];

    const containers: ContainerData = {
      names: ["a.ts"],
      descs: [""],
      paths: ["/src/a.ts"],
      units: [{ name: "a.ts", path: "/src/a.ts", identityEmbedding: [], leafEmbedding: [] }],
      unitPaths: ["/src/a.ts"],
      fileCount: ONE,
      dirs: [],
      fileBounds: [undefined],
    };

    const leaves: LeafData = {
      names: ["outFn", "normFn"],
      descs: ["", ""],
      parentDescs: ["", ""],
      paths: ["", ""],
      sigs: ["", ""],
      causes: ["", ""],
      calls: ["", ""],
      units: [
        { name: "outFn", path: "/src/a.ts", identityEmbedding: [], leafEmbedding: [] },
        { name: "normFn", path: "/src/a.ts", identityEmbedding: [], leafEmbedding: [] },
      ],
      fileChildIndices: new Map([["/src/a.ts", [ZERO, ONE]]]),
      patternIds: [undefined, undefined],
      boundIds: ["outward", undefined],
    };

    const leafEmbs = [outwardLeaf, normalLeaf];
    const identities = [fileIdentity];

    blendFiles(containers, leaves, identities, leafEmbs);

    const result = containers.units[ZERO].leafEmbedding;
    // Without outward: mean([1,0], [0,1]) = [0.5, 0.5]
    // With outward 2x: mean([1,0], [0,1], [1,0]) = [0.667, 0.333]
    // Then: blend([0,0], 0.5, sigFacet, 0.5) = sigFacet * 0.5
    const EXPECTED_DIM0 = 0.333;
    const EXPECTED_DIM1 = 0.167;
    expect(result[ARRAY_FIRST]).toBeCloseTo(EXPECTED_DIM0, TOLERANCE);
    expect(result[ARRAY_SECOND]).toBeCloseTo(EXPECTED_DIM1, TOLERANCE);
  });
});

describe("blendFiles — inward uses sibling leaves", () => {
  it("derives inward file leaf from sibling file leaves", () => {
    const siblingLeaf = [ONE, ZERO];
    const inwardIdentity = [ZERO, ONE];
    const siblingIdentity = [ONE, ZERO];

    const containers: ContainerData = {
      names: ["index.ts", "sibling.ts"],
      descs: ["", ""],
      paths: ["/src/index.ts", "/src/sibling.ts"],
      units: [
        { name: "index.ts", path: "/src/index.ts", identityEmbedding: [], leafEmbedding: [] },
        { name: "sibling.ts", path: "/src/sibling.ts", identityEmbedding: [], leafEmbedding: [] },
      ],
      unitPaths: ["/src/index.ts", "/src/sibling.ts"],
      fileCount: TWO,
      dirs: [
        {
          name: "src",
          path: "/src",
          children: ["/src/index.ts", "/src/sibling.ts"],
          identityEmbedding: [],
          leafEmbedding: [],
          residuals: [],
          description: undefined,
        },
      ],
      fileBounds: ["inward", undefined],
    };

    const leaves: LeafData = {
      names: ["fn"],
      descs: [""],
      parentDescs: [""],
      paths: [""],
      sigs: [""],
      causes: [""],
      calls: [""],
      units: [{ name: "fn", path: "/src/sibling.ts", identityEmbedding: [], leafEmbedding: [] }],
      fileChildIndices: new Map([["/src/sibling.ts", [ZERO]]]),
      patternIds: [undefined],
      boundIds: [undefined],
    };

    const leafEmbs = [siblingLeaf];
    const identities = [inwardIdentity, siblingIdentity];

    blendFiles(containers, leaves, identities, leafEmbs);

    const result = containers.units[ZERO].leafEmbedding;
    // Sibling leaf = [1, 0]
    // Inward sigFacet = mean([[1, 0]]) = [1, 0]
    // Inward leaf = blend([0, 1], 0.5, [1, 0], 0.5) = [0.5, 0.5]
    expect(result[ARRAY_FIRST]).toBeCloseTo(ID_WEIGHT, TOLERANCE);
    expect(result[ARRAY_SECOND]).toBeCloseTo(ID_WEIGHT, TOLERANCE);
  });

  it("falls back to own children when no siblings exist", () => {
    const childLeaf = [ONE, ZERO];
    const inwardIdentity = [ZERO, ONE];

    const containers: ContainerData = {
      names: ["index.ts"],
      descs: [""],
      paths: ["/src/index.ts"],
      units: [
        { name: "index.ts", path: "/src/index.ts", identityEmbedding: [], leafEmbedding: [] },
      ],
      unitPaths: ["/src/index.ts"],
      fileCount: ONE,
      dirs: [
        {
          name: "src",
          path: "/src",
          children: ["/src/index.ts"],
          identityEmbedding: [],
          leafEmbedding: [],
          residuals: [],
          description: undefined,
        },
      ],
      fileBounds: ["inward"],
    };

    const leaves: LeafData = {
      names: ["fn"],
      descs: [""],
      parentDescs: [""],
      paths: [""],
      sigs: [""],
      causes: [""],
      calls: [""],
      units: [{ name: "fn", path: "/src/index.ts", identityEmbedding: [], leafEmbedding: [] }],
      fileChildIndices: new Map([["/src/index.ts", [ZERO]]]),
      patternIds: [undefined],
      boundIds: [undefined],
    };

    const leafEmbs = [childLeaf];
    const identities = [inwardIdentity];

    blendFiles(containers, leaves, identities, leafEmbs);

    const result = containers.units[ZERO].leafEmbedding;
    // Falls back to own children: mean([1,0]) = [1,0]
    // leaf = blend([0,1], 0.5, [1,0], 0.5) = [0.5, 0.5]
    expect(result[ARRAY_FIRST]).toBeCloseTo(ID_WEIGHT, TOLERANCE);
    expect(result[ARRAY_SECOND]).toBeCloseTo(ID_WEIGHT, TOLERANCE);
  });
});

describe("buildContainerIdentities — cached containers", () => {
  it("restores cached identity embeddings", () => {
    const cachedIdentity = [ONE, ZERO];
    const containers: ContainerData = {
      names: ["a.ts"],
      descs: [""],
      paths: ["/src/a.ts"],
      units: [{ name: "a.ts", path: "/src/a.ts", identityEmbedding: [], leafEmbedding: [] }],
      unitPaths: ["/src/a.ts"],
      fileCount: ONE,
      dirs: [],
      fileBounds: [undefined],
    };
    const cr = {
      cachedLeaves: new Set<number>(),
      cachedContainerIds: new Map<number, number[]>([[ZERO, cachedIdentity]]),
      uLeaf: [] as number[],
      uCont: [] as number[],
      cacheHits: ONE,
    };
    const result = buildContainerIdentities(containers, cr, [], [], []);
    expect(result[ZERO]).toEqual(cachedIdentity);
  });
});

describe("blendDirectories — depth-first blending", () => {
  it("blends nested directories deepest-first with sort comparator", () => {
    const fileLeaf = [ONE, ZERO];
    const childDirId = [ZERO, ONE];
    const parentDirId = [ONE, ONE];

    const containers: ContainerData = {
      names: ["a.ts", "child", "parent"],
      descs: ["", "", ""],
      paths: ["/src/child/a.ts", "/src/child", "/src"],
      units: [
        { name: "a.ts", path: "/src/child/a.ts", identityEmbedding: [], leafEmbedding: fileLeaf },
        { name: "child", path: "/src/child", identityEmbedding: [], leafEmbedding: [] },
        { name: "parent", path: "/src", identityEmbedding: [], leafEmbedding: [] },
      ],
      unitPaths: ["/src/child/a.ts", "/src/child", "/src"],
      fileCount: ONE,
      dirs: [
        {
          name: "parent",
          path: "/src",
          children: ["/src/child"],
          identityEmbedding: [],
          leafEmbedding: [],
          residuals: [],
          description: undefined,
        },
        {
          name: "child",
          path: "/src/child",
          children: ["/src/child/a.ts"],
          identityEmbedding: [],
          leafEmbedding: [],
          residuals: [],
          description: undefined,
        },
      ],
      fileBounds: [undefined],
    };

    const identities = [fileLeaf, childDirId, parentDirId];

    blendDirectories(containers, identities);

    // child dir: blend([0,1], 0.5, [1,0], 0.5) = [0.5, 0.5]
    const childResult = containers.units[ONE].leafEmbedding;
    expect(childResult[ARRAY_FIRST]).toBeCloseTo(ID_WEIGHT, TOLERANCE);
    expect(childResult[ARRAY_SECOND]).toBeCloseTo(ID_WEIGHT, TOLERANCE);

    // parent dir: blend([1,1], 0.5, childLeaf, 0.5)
    const parentResult = containers.units[TWO].leafEmbedding;
    expect(parentResult.length).toBe(TWO);
  });
});
