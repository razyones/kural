import {
  avg,
  centroid,
  cosineSimilarity,
  harmonicMean,
  pruneOutliers,
  subtract,
  unitizeCosine,
  unitizeDistance,
} from "./vectors.ts";
import { describe, expect, it } from "vite-plus/test";

const ZERO = 0;
const ONE = 1;
const TWO = 2;
const THREE = 3;
const FOUR = 4;
const FIVE = 5;
const SIX = 6;
const SEVEN = 7;
const EIGHT = 8;
const NINE = 9;
const TEN = 10;
const TWELVE = 12;
const FIFTEEN = 15;
const EIGHTEEN = 18;
const TWENTY = 20;
const THIRTY = 30;
const FORTY_TWO = 42;
const NEGATIVE_ONE = -1;
const NEGATIVE_THREE = -3;
const ARRAY_FIRST = 0;
const ARRAY_SECOND = 1;
const HALF = 0.5;
const TOLERANCE = 10;

/** Decimal constants for near-unit test vectors. */
const D_01 = 0.1;
const D_02 = 0.2;
const D_03 = 0.3;
const D_05 = 0.05;
const D_07 = 0.7;
const D_08 = 0.8;
const D_09 = 0.9;
const D_15 = 0.15;
const D_85 = 0.85;
const D_95 = 0.95;
const D_97 = 0.97;
const D_98 = 0.98;
const D_99 = 0.99;
const ONE_HALF = 1.5;
const TWO_HALF = 2.5;
const ONE_POINT_O = 1.0;

/** Test vectors reused across multiple tests. */
const V_EMPTY: number[] = [];
const V_UNIT_X = [ONE, ZERO, ZERO];
const V_UNIT_Y = [ZERO, ONE, ZERO];
const V_UNIT_Z = [ZERO, ZERO, ONE];
const V_SCALED_X = [FIVE, ZERO, ZERO];
const V_NEG_X = [NEGATIVE_ONE, ZERO, ZERO];
const V_ZERO_3D = [ZERO, ZERO, ZERO];
const V_123 = [ONE, TWO, THREE];
const V_456 = [FOUR, FIVE, SIX];

describe("cosineSimilarity", () => {
  it("returns 0 when the first vector is empty", () => {
    expect(cosineSimilarity(V_EMPTY, V_123)).toBe(ZERO);
  });

  it("returns 0 when the second vector is empty", () => {
    expect(cosineSimilarity(V_123, V_EMPTY)).toBe(ZERO);
  });

  it("returns 0 when both vectors are empty", () => {
    expect(cosineSimilarity(V_EMPTY, V_EMPTY)).toBe(ZERO);
  });

  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity(V_123, V_123)).toBeCloseTo(ONE, TOLERANCE);
  });

  it("returns 1 for parallel vectors with different magnitudes", () => {
    expect(cosineSimilarity(V_UNIT_X, V_SCALED_X)).toBeCloseTo(ONE, TOLERANCE);
  });

  it("returns approximately 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([ONE, ZERO], [ZERO, ONE])).toBeCloseTo(ZERO, TOLERANCE);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity(V_UNIT_X, V_NEG_X)).toBeCloseTo(NEGATIVE_ONE, TOLERANCE);
  });

  it("returns 0 when cosine distance is NaN (zero vectors)", () => {
    expect(cosineSimilarity(V_ZERO_3D, V_123)).toBe(ZERO);
  });
});

describe("cosineSimilarity non-trivial", () => {
  it("computes correct similarity for non-trivial vectors", () => {
    const FOURTEEN = 14;
    const SEVENTY_SEVEN = 77;
    const expected =
      (ONE * FOUR + TWO * FIVE + THREE * SIX) / (Math.sqrt(FOURTEEN) * Math.sqrt(SEVENTY_SEVEN));
    expect(cosineSimilarity(V_123, V_456)).toBeCloseTo(expected, TOLERANCE);
  });
});

describe("subtract", () => {
  it("subtracts element-wise for simple vectors", () => {
    expect(subtract([FIVE, TEN, FIFTEEN], [ONE, TWO, THREE])).toEqual([FOUR, EIGHT, TWELVE]);
  });

  it("handles negative results", () => {
    expect(subtract(V_123, V_456)).toEqual([NEGATIVE_THREE, NEGATIVE_THREE, NEGATIVE_THREE]);
  });

  it("returns an empty array for empty input vectors", () => {
    expect(subtract(V_EMPTY, V_EMPTY)).toEqual([]);
  });

  it("returns zeros when subtracting a vector from itself", () => {
    expect(subtract([SEVEN, EIGHT, NINE], [SEVEN, EIGHT, NINE])).toEqual([ZERO, ZERO, ZERO]);
  });

  it("handles single-element vectors", () => {
    expect(subtract([TEN], [THREE])).toEqual([SEVEN]);
  });

  it("handles floating-point values", () => {
    const result = subtract([ONE_HALF, TWO_HALF], [HALF, ONE_HALF]);
    expect(result[ARRAY_FIRST]).toBeCloseTo(ONE_POINT_O);
    expect(result[ARRAY_SECOND]).toBeCloseTo(ONE_POINT_O);
  });
});

describe("avg", () => {
  it("returns 0 for an empty array", () => {
    expect(avg([])).toBe(ZERO);
  });

  it("returns the single value for a one-element array", () => {
    expect(avg([FORTY_TWO])).toBe(FORTY_TWO);
  });

  it("computes the mean of multiple values", () => {
    expect(avg([TWO, FOUR, SIX])).toBe(FOUR);
  });

  it("computes the mean with negative values", () => {
    expect(avg([-TEN, TEN])).toBe(ZERO);
  });

  it("handles floating-point averages", () => {
    expect(avg([ONE, TWO])).toBe(ONE_HALF);
  });

  it("handles all identical values", () => {
    expect(avg([FIVE, FIVE, FIVE, FIVE])).toBe(FIVE);
  });
});

describe("centroid", () => {
  it("returns an empty array for no vectors", () => {
    expect(centroid([])).toEqual([]);
  });

  it("returns the vector itself for a single vector", () => {
    expect(centroid([[THREE, FOUR, FIVE]])).toEqual([THREE, FOUR, FIVE]);
  });

  it("computes the element-wise mean of multiple vectors", () => {
    const vectors = [
      [TWO, FOUR, SIX],
      [FOUR, SIX, EIGHT],
    ];
    expect(centroid(vectors)).toEqual([THREE, FIVE, SEVEN]);
  });

  it("computes centroid of three vectors", () => {
    const vectors = [V_ZERO_3D, [THREE, SIX, NINE], [SIX, TWELVE, EIGHTEEN]];
    expect(centroid(vectors)).toEqual([THREE, SIX, NINE]);
  });

  it("handles vectors with negative components", () => {
    const vectors = [
      [-TWO, -FOUR],
      [TWO, FOUR],
    ];
    expect(centroid(vectors)).toEqual([ZERO, ZERO]);
  });

  it("handles single-dimension vectors", () => {
    const vectors = [[TEN], [TWENTY], [THIRTY]];
    expect(centroid(vectors)).toEqual([TWENTY]);
  });

  it("ignores empty vectors in a mixed array", () => {
    const vectors = [[TWO, FOUR], [], [SIX, TWO]];
    expect(centroid(vectors)).toEqual([FOUR, THREE]);
  });

  it("returns empty when all vectors are empty", () => {
    expect(centroid([[], []])).toEqual([]);
  });
});

describe("pruneOutliers below minSize", () => {
  it("returns vectors as-is when below minSize", () => {
    const vectors = [[ONE, ZERO], V_UNIT_Y];
    const result = pruneOutliers(vectors, FIVE, ONE);
    expect(result).toBe(vectors);
  });

  it("returns vectors as-is at minSize boundary", () => {
    const vectors = [V_UNIT_X, V_UNIT_Y, V_UNIT_Z];
    const result = pruneOutliers(vectors, FOUR, ONE);
    expect(result).toBe(vectors);
  });

  it("keeps all vectors when they are uniform", () => {
    const vectors = [
      [ONE, ZERO, ZERO],
      [TWO, ZERO, ZERO],
      [THREE, ZERO, ZERO],
      [FOUR, ZERO, ZERO],
      [FIVE, ZERO, ZERO],
    ];
    const result = pruneOutliers(vectors, THREE, ONE);
    expect(result).toHaveLength(FIVE);
  });
});

describe("pruneOutliers filtering", () => {
  it("removes an outlier in opposite direction", () => {
    const vectors = [V_UNIT_X, [D_09, D_01, ZERO], [D_95, D_05, ZERO], [D_85, D_15, ZERO], V_NEG_X];
    const result = pruneOutliers(vectors, THREE, ONE);
    expect(result.length).toBeLessThan(vectors.length);
    expect(result).not.toContainEqual(V_NEG_X);
  });

  it("preserves non-outlier vectors", () => {
    const similar = [V_UNIT_X, [D_98, D_02, ZERO], [D_99, D_01, ZERO], [D_97, D_03, ZERO]];
    const vectors = [...similar, V_NEG_X];
    const result = pruneOutliers(vectors, THREE, ONE);
    for (const v of similar) {
      expect(result).toContainEqual(v);
    }
  });

  it("handles minSize equal to vector count", () => {
    const vectors = [
      [ONE, ZERO],
      [D_09, D_01],
      [D_08, D_02],
    ];
    const result = pruneOutliers(vectors, THREE, TWO);
    expect(result.length).toBeGreaterThan(ZERO);
  });

  it("uses stddevMultiplier to control aggressiveness", () => {
    const vectors = [
      V_UNIT_X,
      [D_09, D_01, ZERO],
      [D_08, D_02, ZERO],
      [D_07, D_03, ZERO],
      V_UNIT_Y,
    ];
    const lenient = pruneOutliers(vectors, THREE, TEN);
    const strict = pruneOutliers(vectors, THREE, HALF);
    expect(lenient.length).toBeGreaterThanOrEqual(strict.length);
  });
});

/** Harmonic mean test constants. */
const HM_A = 0.9;
const HM_B = 0.1;
const HM_EQUAL = 0.6;
const HM_HIGH = 0.8;
const HM_LOW = 0.4;

/** Negative and mixed-sign fixtures for harmonicMean clamping. */
const NEG_SMALL = -0.2;
const POS_SMALL = 0.1;
const NEG_LARGE = -0.5;
const NEAR_CANCEL_A = 0.5;
const NEAR_CANCEL_B = -0.49;
const UNIQ_ABOVE_ONE = 1.5;

describe("harmonicMean", () => {
  it("returns 0 when both inputs are 0", () => {
    expect(harmonicMean(ZERO, ZERO)).toBe(ZERO);
  });

  it("returns correct harmonic mean for equal values", () => {
    expect(harmonicMean(HM_EQUAL, HM_EQUAL)).toBeCloseTo(HM_EQUAL, TOLERANCE);
  });

  it("returns correct harmonic mean for different values", () => {
    const expected = (TWO * HM_HIGH * HM_LOW) / (HM_HIGH + HM_LOW);
    expect(harmonicMean(HM_HIGH, HM_LOW)).toBeCloseTo(expected, TOLERANCE);
  });

  it("penalizes imbalance below arithmetic mean", () => {
    const hm = harmonicMean(HM_A, HM_B);
    const arithmeticMean = (HM_A + HM_B) / TWO;
    expect(hm).toBeLessThan(arithmeticMean);
  });
});

describe("harmonicMean clamping", () => {
  it("returns 0 when either input is negative (mixed sign)", () => {
    expect(harmonicMean(HM_HIGH, NEG_SMALL)).toBe(ZERO);
    expect(harmonicMean(NEG_SMALL, POS_SMALL)).toBe(ZERO);
  });

  it("returns 0 when both inputs are negative", () => {
    expect(harmonicMean(NEG_LARGE, NEG_LARGE)).toBe(ZERO);
  });

  it("does not explode on near-cancellation once clamped", () => {
    expect(harmonicMean(NEAR_CANCEL_A, NEAR_CANCEL_B)).toBe(ZERO);
  });
});

describe("unitizeCosine", () => {
  it("maps -1 to 0", () => {
    expect(unitizeCosine(NEGATIVE_ONE)).toBeCloseTo(ZERO, TOLERANCE);
  });

  it("maps 0 to 0.5", () => {
    expect(unitizeCosine(ZERO)).toBeCloseTo(HALF, TOLERANCE);
  });

  it("maps 1 to 1", () => {
    expect(unitizeCosine(ONE)).toBeCloseTo(ONE, TOLERANCE);
  });
});

describe("unitizeDistance", () => {
  it("maps 0 to 0", () => {
    expect(unitizeDistance(ZERO)).toBeCloseTo(ZERO, TOLERANCE);
  });

  it("maps 2 to 1", () => {
    expect(unitizeDistance(TWO)).toBeCloseTo(ONE, TOLERANCE);
  });

  it("maps a distance above 1 into (0, 1]", () => {
    const result = unitizeDistance(UNIQ_ABOVE_ONE);
    expect(result).toBeLessThanOrEqual(ONE);
    expect(result).toBeGreaterThan(ZERO);
  });
});
