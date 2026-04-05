import { buildDendrogram, hasSignificantGap } from "./cluster.ts";
import { describe, expect, test } from "vite-plus/test";

const NONE = 0;
const ONE = 1;
const TWO = 2;
const FOUR = 4;
const SENSITIVITY_LOW = 0.5;
const SENSITIVITY_HIGH = 10.0;

const MERGE_A = 0.1;
const MERGE_B = 0.2;
const MERGE_C = 0.3;
const MERGE_D = 0.9;

const MERGE_UNIFORM_A = 0.1;
const MERGE_UNIFORM_B = 0.2;
const MERGE_UNIFORM_C = 0.3;
const MERGE_UNIFORM_D = 0.4;

const EMB_DIM = 3;
const EMB_V1 = 1.0;
const EMB_V2 = 0.0;
const EMB_V3 = 0.99;
const EMB_V4 = 0.01;
const EMB_V5 = 0.5;

describe("hasSignificantGap — fewer than 2 merges", () => {
  test("returns false for empty merges", () => {
    expect(hasSignificantGap([], SENSITIVITY_LOW)).toBe(false);
  });

  test("returns false for single merge", () => {
    expect(hasSignificantGap([MERGE_A], SENSITIVITY_LOW)).toBe(false);
  });
});

describe("hasSignificantGap — significant gap detected", () => {
  test("returns true when largest gap exceeds median by threshold", () => {
    const merges = [MERGE_A, MERGE_B, MERGE_C, MERGE_D];

    expect(hasSignificantGap(merges, SENSITIVITY_LOW)).toBe(true);
  });
});

describe("hasSignificantGap — no significant gap", () => {
  test("returns false for uniform merges at low sensitivity", () => {
    const merges = [MERGE_UNIFORM_A, MERGE_UNIFORM_B, MERGE_UNIFORM_C, MERGE_UNIFORM_D];

    expect(hasSignificantGap(merges, SENSITIVITY_HIGH)).toBe(false);
  });
});

describe("hasSignificantGap — edge case with two merges", () => {
  test("returns false when exactly two merges produce one gap", () => {
    const merges = [MERGE_A, MERGE_B];

    expect(hasSignificantGap(merges, SENSITIVITY_LOW)).toBe(false);
  });
});

describe("hasSignificantGap — median gap is zero", () => {
  test("returns false when median gap is zero", () => {
    const merges = [MERGE_A, MERGE_A, MERGE_A, MERGE_D];

    expect(hasSignificantGap(merges, SENSITIVITY_LOW)).toBe(false);
  });
});

describe("buildDendrogram — insufficient input", () => {
  test("returns null for empty embeddings", () => {
    expect(buildDendrogram([])).toBeNull();
  });

  test("returns null for single embedding", () => {
    expect(buildDendrogram([[EMB_V1, EMB_V2, EMB_V2]])).toBeNull();
  });
});

describe("buildDendrogram — two embeddings", () => {
  test("returns valid result with clusters and merges", () => {
    const embeddings = [
      [EMB_V1, EMB_V2, EMB_V2],
      [EMB_V2, EMB_V1, EMB_V2],
    ];
    const result = buildDendrogram(embeddings);

    expect(result).not.toBeNull();
    expect(result?.clusters.length).toBeGreaterThan(NONE);
    expect(result?.gap).toBeGreaterThanOrEqual(NONE);
  });
});

describe("buildDendrogram — clear clusters", () => {
  test("identifies distinct groups from well-separated embeddings", () => {
    const embeddings = [
      [EMB_V1, EMB_V2, EMB_V2],
      [EMB_V3, EMB_V4, EMB_V2],
      [EMB_V2, EMB_V2, EMB_V1],
      [EMB_V2, EMB_V4, EMB_V3],
    ];
    const result = buildDendrogram(embeddings);

    expect(result).not.toBeNull();
    expect(result?.clusters.length).toBeGreaterThanOrEqual(ONE);
  });

  test("returns sorted merges array", () => {
    const embeddings = [
      [EMB_V1, EMB_V2, EMB_V2],
      [EMB_V3, EMB_V4, EMB_V2],
      [EMB_V2, EMB_V2, EMB_V1],
    ];
    const result = buildDendrogram(embeddings);

    expect(result).not.toBeNull();
    if (result !== null && result.merges.length >= TWO) {
      for (let i = NONE; i < result.merges.length - ONE; i++) {
        expect(result.merges[i]).toBeLessThanOrEqual(result.merges[i + ONE]);
      }
    }
  });
});

describe("buildDendrogram — all identical embeddings", () => {
  test("handles identical embeddings gracefully", () => {
    const embeddings = [
      [EMB_V5, EMB_V5, EMB_V5],
      [EMB_V5, EMB_V5, EMB_V5],
      [EMB_V5, EMB_V5, EMB_V5],
    ];
    const result = buildDendrogram(embeddings);

    expect(result).not.toBeNull();
    expect(result?.gap).toBe(NONE);
  });
});

describe("buildDendrogram — result structure", () => {
  test("result contains clusters, gap, and merges fields", () => {
    const embeddings = [
      [EMB_V1, EMB_V2, EMB_V2],
      [EMB_V2, EMB_V1, EMB_V2],
      [EMB_V2, EMB_V2, EMB_V1],
      [EMB_V1, EMB_V1, EMB_V2],
    ];
    const result = buildDendrogram(embeddings);

    expect(result).not.toBeNull();
    expect(Array.isArray(result?.clusters)).toBe(true);
    expect(typeof result?.gap).toBe("number");
    expect(Array.isArray(result?.merges)).toBe(true);
  });

  test("each cluster is an array of indices", () => {
    const embeddings = [
      [EMB_V1, EMB_V2, EMB_V2],
      [EMB_V2, EMB_V1, EMB_V2],
      [EMB_V2, EMB_V2, EMB_V1],
    ];
    const result = buildDendrogram(embeddings);

    expect(result).not.toBeNull();
    if (result !== null) {
      const allIndices = result.clusters.flat();
      expect(allIndices.length).toBe(EMB_DIM);
      const sorted = [...allIndices].toSorted((a, b) => a - b);
      expect(sorted).toEqual([NONE, ONE, TWO]);
    }
  });

  test("total indices across clusters equals embedding count", () => {
    const embeddings = [
      [EMB_V1, EMB_V2, EMB_V2],
      [EMB_V3, EMB_V4, EMB_V2],
      [EMB_V2, EMB_V2, EMB_V1],
      [EMB_V2, EMB_V4, EMB_V3],
    ];
    const result = buildDendrogram(embeddings);

    expect(result).not.toBeNull();
    if (result !== null) {
      const totalIndices = result.clusters.flat().length;
      expect(totalIndices).toBe(FOUR);
    }
  });
});
