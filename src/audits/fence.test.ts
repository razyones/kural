import { describe, expect, test } from "vite-plus/test";
import {
  lowerFence,
  median,
  robustLowerFence,
  robustUpperFence,
  stddev,
  upperFence,
} from "./fence.ts";

const NONE = 0;
const V1 = 1;
const V2 = 2;
const V3 = 3;
const V4 = 4;
const V5 = 5;
const V7 = 7;
const V9 = 9;
const V10 = 10;
const V11 = 11;
const V12 = 12;
const V13 = 13;
const V14 = 14;
const V15 = 15;
const V16 = 16;
const V17 = 17;
const V18 = 18;
const V19 = 19;
const V20 = 20;
const V100 = 100;

const K = 2;
const MAD_SCALE = 1.4826;
const EVEN_MEDIAN = 2.5;
const TOLERANCE = 0.2;
const MAX_CONTAMINATION_DRIFT = 5;

const ODD_SAMPLE = [V3, V1, V2];
const EVEN_SAMPLE = [V4, V1, V3, V2];
const STDDEV_SAMPLE = [V2, V4, V4, V4, V5, V5, V7, V9];
const SERIES = [V1, V2, V3, V4, V5];
const CLEAN = [V1, V2, V3, V4, V5];
const CONTAMINATED = [V1, V2, V3, V4, V100];
const UNIFORM_RANGE = [V10, V11, V12, V13, V14, V15, V16, V17, V18, V19, V20];

describe("median", () => {
  test("returns middle value for odd-length array", () => {
    expect(median(ODD_SAMPLE)).toBe(V2);
  });

  test("returns average of two middle values for even-length array", () => {
    expect(median(EVEN_SAMPLE)).toBe(EVEN_MEDIAN);
  });

  test("handles single element", () => {
    expect(median([V5])).toBe(V5);
  });
});

describe("stddev", () => {
  test("returns 0 for fewer than 2 values", () => {
    expect(stddev([V1], V1)).toBe(NONE);
    expect(stddev([], NONE)).toBe(NONE);
  });

  test("computes Bessel-corrected standard deviation", () => {
    const result = stddev(STDDEV_SAMPLE, V5);
    expect(result).toBeCloseTo(V2, NONE);
  });
});

describe("upperFence", () => {
  test("returns Infinity for fewer than 2 values", () => {
    expect(upperFence([], K)).toBe(Infinity);
    expect(upperFence([V1], K)).toBe(Infinity);
  });

  test("computes mean + k * stddev", () => {
    const result = upperFence(SERIES, K);
    const sd = stddev(SERIES, V3);
    expect(result).toBeCloseTo(V3 + K * sd);
  });
});

describe("lowerFence", () => {
  test("returns -Infinity for fewer than 2 values", () => {
    expect(lowerFence([], K)).toBe(-Infinity);
    expect(lowerFence([V1], K)).toBe(-Infinity);
  });

  test("computes mean - k * stddev", () => {
    const result = lowerFence(SERIES, K);
    const sd = stddev(SERIES, V3);
    expect(result).toBeCloseTo(V3 - K * sd);
  });
});

describe("robustUpperFence", () => {
  test("returns Infinity for fewer than 2 values", () => {
    expect(robustUpperFence([], K)).toBe(Infinity);
    expect(robustUpperFence([V1], K)).toBe(Infinity);
  });

  test("computes median + k * 1.4826 * MAD", () => {
    const expected = V3 + K * MAD_SCALE * V1;
    expect(robustUpperFence(SERIES, K)).toBeCloseTo(expected);
  });

  test("resists outlier contamination", () => {
    const cleanFence = robustUpperFence(CLEAN, K);
    const contaminatedFence = robustUpperFence(CONTAMINATED, K);
    expect(Math.abs(contaminatedFence - cleanFence)).toBeLessThan(MAX_CONTAMINATION_DRIFT);
  });
});

describe("robustLowerFence", () => {
  test("returns -Infinity for fewer than 2 values", () => {
    expect(robustLowerFence([], K)).toBe(-Infinity);
    expect(robustLowerFence([V1], K)).toBe(-Infinity);
  });

  test("computes median - k * 1.4826 * MAD", () => {
    const expected = V3 - K * MAD_SCALE * V1;
    expect(robustLowerFence(SERIES, K)).toBeCloseTo(expected);
  });
});

describe("fence consistency", () => {
  test("z-score and MAD fences agree on normal-ish data", () => {
    const zUpper = upperFence(UNIFORM_RANGE, K);
    const madUpper = robustUpperFence(UNIFORM_RANGE, K);
    expect(Math.abs(zUpper - madUpper) / zUpper).toBeLessThan(TOLERANCE);
  });
});
