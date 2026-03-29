/**
 * The compass. Provides vector distance and similarity functions used
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
 * @param vectors - Vectors to average
 * @returns Mean vector
 * @kuralPure
 */
function centroid(vectors: number[][]): number[] {
  if (vectors.length === NONE) {
    return [];
  }
  const dim = vectors[NONE].length;
  const result = Array.from<number>({ length: dim }).fill(NONE);
  for (const v of vectors) {
    for (let i = NONE; i < dim; i++) {
      result[i] += v[i];
    }
  }
  for (let i = NONE; i < dim; i++) {
    result[i] /= vectors.length;
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

/**
 * Computes the harmonic mean of two values.
 * Penalizes imbalance — both values must be good to score well.
 * @param a - First value
 * @param b - Second value
 * @returns Harmonic mean, or 0 if either value is 0
 * @kuralPure
 */
function harmonicMean(a: number, b: number): number {
  if (a + b === NONE) {
    return NONE;
  }
  return (TWO * a * b) / (a + b);
}

export { avg, centroid, cosineSimilarity, harmonicMean, pruneOutliers, subtract };
