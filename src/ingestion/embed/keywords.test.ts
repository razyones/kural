import { describe, expect, it } from "vite-plus/test";
import { selectKeywords } from "./keywords.ts";

const TOP_COUNT = 3;
const ARRAY_FIRST = 0;
const ARRAY_SECOND = 1;
const ARRAY_THIRD = 2;

const ZERO = 0;
const ONE = 1;
const STRONG = 0.9;
const MODERATE = 0.8;
const LEAN = 0.7;
const SLIGHT = 0.6;
const HALF = 0.5;
const WEAK = 0.3;
const FAINT = 0.2;
const TRACE = 0.1;

/** Unit vector pointing along dimension 0. */
const DIM_0: number[] = [ONE, ZERO, ZERO];
/** Unit vector pointing along dimension 1. */
const DIM_1: number[] = [ZERO, ONE, ZERO];
/** Unit vector pointing along dimension 2. */
const DIM_2: number[] = [ZERO, ZERO, ONE];

describe("selectKeywords ranking", () => {
  it("returns top 3 keywords by aggregate cosine similarity", () => {
    const keywordVectors = [DIM_0, DIM_1, DIM_2, [STRONG, TRACE, ZERO]];
    const keywords = ["typescript", "python", "rust", "AST"];

    const nameVectors = [
      [MODERATE, FAINT, ZERO],
      [LEAN, WEAK, ZERO],
      [FAINT, MODERATE, ZERO],
      [SLIGHT, TRACE, ZERO],
    ];

    const result = selectKeywords(keywordVectors, nameVectors, keywords);

    expect(result).toHaveLength(TOP_COUNT);
    expect(result).toContain("typescript");
    expect(result).toContain("AST");
    expect(result).toContain("python");
    expect(result).not.toContain("rust");
  });

  it("preserves order by descending aggregate similarity", () => {
    const keywordVectors = [DIM_1, DIM_0, [HALF, HALF, ZERO]];
    const keywords = ["weak", "strong", "medium"];
    const nameVectors = [DIM_0, [STRONG, TRACE, ZERO], [MODERATE, FAINT, ZERO]];

    const result = selectKeywords(keywordVectors, nameVectors, keywords);

    expect(result[ARRAY_FIRST]).toBe("strong");
    expect(result[ARRAY_SECOND]).toBe("medium");
    expect(result[ARRAY_THIRD]).toBe("weak");
  });
});

describe("selectKeywords edge cases", () => {
  it("returns all keywords when fewer than 3 provided", () => {
    const keywordVectors = [
      [ONE, ZERO],
      [ZERO, ONE],
    ];
    const keywords = ["typescript", "code"];
    const nameVectors = [[HALF, HALF]];

    const result = selectKeywords(keywordVectors, nameVectors, keywords);

    expect(result).toHaveLength(keywords.length);
    expect(result).toContain("typescript");
    expect(result).toContain("code");
  });

  it("handles exactly 3 keywords", () => {
    const keywordVectors = [
      [ONE, ZERO],
      [ZERO, ONE],
      [HALF, HALF],
    ];
    const keywords = ["a", "b", "c"];
    const nameVectors = [[ONE, ZERO]];

    const result = selectKeywords(keywordVectors, nameVectors, keywords);

    expect(result).toHaveLength(TOP_COUNT);
  });

  it("returns empty array when no keywords provided", () => {
    const result = selectKeywords([], [[ONE, ZERO]], []);

    expect(result).toEqual([]);
  });

  it("returns empty array when no names provided", () => {
    const result = selectKeywords([[ONE, ZERO]], [], ["keyword"]);

    expect(result).toEqual([]);
  });
});
