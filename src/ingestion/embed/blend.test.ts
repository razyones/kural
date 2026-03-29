import {
  applyParentSignal,
  applySignatureSignals,
  blend,
  cosineSimilarity,
  mean,
} from "./blend.ts";
import { describe, expect, it } from "vite-plus/test";

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

describe("mean basic", () => {
  it("computes element-wise mean of vectors", () => {
    const result = mean([
      [TWO, FOUR],
      [SIX, TWO],
    ]);

    expect(result[ARRAY_FIRST]).toBeCloseTo(FOUR, TOLERANCE);
    expect(result[ARRAY_SECOND]).toBeCloseTo(THREE, TOLERANCE);
  });

  it("returns the vector itself for a single input", () => {
    const result = mean([[THREE, FIVE]]);

    expect(result[ARRAY_FIRST]).toBeCloseTo(THREE, TOLERANCE);
    expect(result[ARRAY_SECOND]).toBeCloseTo(FIVE, TOLERANCE);
  });
});

describe("mean edge cases", () => {
  it("ignores empty vectors", () => {
    const result = mean([[TWO, FOUR], [], [SIX, TWO]]);

    expect(result[ARRAY_FIRST]).toBeCloseTo(FOUR, TOLERANCE);
    expect(result[ARRAY_SECOND]).toBeCloseTo(THREE, TOLERANCE);
  });

  it("returns empty when all vectors are empty", () => {
    const result = mean([[], []]);

    expect(result).toEqual([]);
  });

  it("returns empty for empty input array", () => {
    const result = mean([]);

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
