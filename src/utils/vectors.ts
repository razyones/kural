/**
 * Provides vector distance and similarity functions used
 * across the embedding and scoring layers. It is the only module that
 * wraps DruidJS vector operations — no other module calls DruidJS
 * distance functions directly.
 * @kuralUtil
 */

import { cosine } from "@saehrimnir/druidjs";

const NONE = 0;

/**
 * Computes cosine similarity between two vectors.
 * Wraps DruidJS cosine distance: cos(acos(similarity)) recovers similarity.
 * Returns 0 if either vector is empty.
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity in range [-1, 1]
 * @kuralPure
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === NONE || b.length === NONE) {
    return NONE;
  }
  const distance = cosine(a, b);
  if (Number.isNaN(distance)) {
    return NONE;
  }
  return Math.cos(distance);
}

/**
 * Element-wise vector subtraction.
 * @param a - First vector
 * @param b - Second vector
 * @returns A new vector where each element is a[i] - b[i]
 * @kuralPure
 */
function subtract(a: number[], b: number[]): number[] {
  const result: number[] = [];
  for (let i = NONE; i < a.length; i++) {
    result.push(a[i] - b[i]);
  }
  return result;
}

/**
 * Sums all samples and divides by count to produce the arithmetic mean.
 * Returns 0 for an empty array.
 * @param samples - Array of numeric samples to average
 * @returns The arithmetic mean
 * @kuralPure
 */
function avg(samples: number[]): number {
  if (samples.length === NONE) {
    return NONE;
  }
  let sum = NONE;
  for (const v of samples) {
    sum += v;
  }
  return sum / samples.length;
}

/**
 * Computes the element-wise centroid (mean) of a set of vectors.
 * Empty vectors are ignored. Returns empty if all inputs are empty.
 * @param vectors - Vectors to average
 * @returns Mean vector
 * @kuralPure
 */
function centroid(vectors: number[][]): number[] {
  const valid = vectors.filter((v) => v.length > NONE);
  if (valid.length === NONE) {
    return [];
  }
  const dim = valid[NONE].length;
  const result = Array.from<number>({ length: dim }).fill(NONE);
  for (const v of valid) {
    for (let i = NONE; i < dim; i++) {
      result[i] += v[i];
    }
  }
  for (let i = NONE; i < dim; i++) {
    result[i] /= valid.length;
  }
  return result;
}

/**
 * Prunes outlier vectors from a group. Vectors whose cosine similarity to the
 * group centroid falls more than `stddevMultiplier` standard deviations below
 * the mean similarity are removed.
 * @param vectors - Vectors to prune
 * @param minSize - Minimum group size to attempt pruning (smaller groups returned as-is)
 * @param stddevMultiplier - Number of standard deviations below the mean to set the cutoff
 * @returns Pruned vectors with outliers removed
 * @kuralPure
 */
function pruneOutliers(vectors: number[][], minSize: number, stddevMultiplier: number): number[][] {
  if (vectors.length < minSize) {
    return vectors;
  }
  const center = centroid(vectors);
  const sims = vectors.map((v) => cosineSimilarity(v, center));
  const meanSim = avg(sims);
  let sumSq = NONE;
  for (const s of sims) {
    sumSq += (s - meanSim) * (s - meanSim);
  }
  const besselCorrection = 1;
  const stddev = Math.sqrt(sumSq / (sims.length - besselCorrection));
  const threshold = meanSim - stddevMultiplier * stddev;
  return vectors.filter((_, i) => sims[i] >= threshold);
}

const TWO = 2;
const ONE = 1;

/**
 * Rescales a cosine similarity from [-1, 1] to [0, 1].
 * Required before harmonic-mean combination, which is only well-defined
 * on non-negative inputs.
 * @param value - Cosine similarity in [-1, 1]
 * @returns Rescaled value in [0, 1]
 * @kuralPure
 */
function unitizeCosine(value: number): number {
  return (value + ONE) / TWO;
}

/**
 * Rescales a pairwise cosine distance from [0, 2] to [0, 1].
 * Used for per-node uniqueness, which is the mean of (1 − cos) across
 * sibling pairs and can therefore exceed 1.
 * @param value - Cosine-distance mean in [0, 2]
 * @returns Rescaled value in [0, 1]
 * @kuralPure
 */
function unitizeDistance(value: number): number {
  return value / TWO;
}

/**
 * Computes the harmonic mean of two non-negative values. Mixed signs
 * or a near-zero sum make the formula produce values outside the input
 * range, so any non-positive input returns 0.
 * @param a - First value, expected in [0, 1]
 * @param b - Second value, expected in [0, 1]
 * @returns Harmonic mean, or 0 if either input is non-positive
 * @kuralPure
 */
function harmonicMean(a: number, b: number): number {
  if (a <= NONE || b <= NONE) {
    return NONE;
  }
  return (TWO * a * b) / (a + b);
}

export {
  avg,
  centroid,
  cosineSimilarity,
  harmonicMean,
  pruneOutliers,
  subtract,
  unitizeCosine,
  unitizeDistance,
};
