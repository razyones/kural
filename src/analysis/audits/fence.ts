/**
 * The statistician. Computes detection boundaries from value distributions —
 * Z-score fences, robust MAD fences, and leave-one-out variants. It is the
 * only module that turns a distribution into a threshold — no other module
 * decides where normal ends and abnormal begins.
 */

import { avg } from "../../utils/vectors.ts";

const NONE = 0;
const MIN_SAMPLE = 2;
const BESSEL = 1;

/**
 * Half the noise floor of cosine similarity for d-dimensional unit vectors.
 * Random cosine similarity has σ ≈ 1/√d. Below half that, apparent variation
 * is noise, not signal. Default assumes 1536-dim (text-embedding-3-small).
 */
const DEFAULT_EMBEDDING_DIM = 1536;
const NOISE_FRACTION = 0.5;
const MIN_MAD = NOISE_FRACTION / Math.sqrt(DEFAULT_EMBEDDING_DIM);

/** 1/Φ⁻¹(¾) — makes MAD consistent with σ for normal data. */
const MAD_SCALE = 1.4826;

/**
 * Sorts the distribution and picks the middle element as the central tendency.
 * @param distribution - Sample of numbers to find the midpoint of
 * @returns The middle value (or average of two middle values for even length)
 * @kuralPure
 */
function median(distribution: number[]): number {
  const sorted = [...distribution].toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / MIN_SAMPLE);
  return sorted.length % MIN_SAMPLE === NONE
    ? (sorted[mid - BESSEL] + sorted[mid]) / MIN_SAMPLE
    : sorted[mid];
}

/**
 * Computes sample standard deviation with Bessel correction (n-1).
 * @param values - Array of numbers
 * @param mu - The mean of the values
 * @returns Standard deviation, or 0 for fewer than 2 values
 * @kuralPure
 */
function stddev(values: number[], mu: number): number {
  if (values.length < MIN_SAMPLE) {
    return NONE;
  }
  let sum = NONE;
  for (const v of values) {
    sum += (v - mu) * (v - mu);
  }
  return Math.sqrt(sum / (values.length - BESSEL));
}

/**
 * mean + sensitivity·σ — values above this are upper outliers.
 * @param values - Distribution of values
 * @param sensitivity - Number of standard deviations from the mean
 * @returns Upper fence threshold, or Infinity for fewer than 2 values
 * @kuralPatterns fenceComputation, zScoreFence
 * @kuralPure
 */
function upperFence(values: number[], sensitivity: number): number {
  if (values.length < MIN_SAMPLE) {
    return Infinity;
  }
  const mu = avg(values);
  return mu + sensitivity * stddev(values, mu);
}

/**
 * mean - sensitivity·σ — values below this are lower outliers.
 * @param values - Distribution of values
 * @param sensitivity - Number of standard deviations from the mean
 * @returns Lower fence threshold, or -Infinity for fewer than 2 values
 * @kuralPatterns fenceComputation, zScoreFence
 * @kuralPure
 */
function lowerFence(values: number[], sensitivity: number): number {
  if (values.length < MIN_SAMPLE) {
    return -Infinity;
  }
  const mu = avg(values);
  return mu - sensitivity * stddev(values, mu);
}

/**
 * median - sensitivity·MAD_SCALE·MAD — robust lower fence for small samples.
 * @param values - Distribution of values
 * @param sensitivity - Number of scaled MAD units from the median
 * @returns Robust lower fence, or -Infinity for fewer than 2 values
 * @kuralPatterns fenceComputation, robustFence
 * @kuralPure
 */
function robustLowerFence(values: number[], sensitivity: number): number {
  if (values.length < MIN_SAMPLE) {
    return -Infinity;
  }
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  const madValue = Math.max(median(deviations), MIN_MAD);
  return med - sensitivity * MAD_SCALE * madValue;
}

/**
 * median + sensitivity·MAD_SCALE·MAD — robust upper fence for small samples.
 * @param values - Distribution of values
 * @param sensitivity - Number of scaled MAD units from the median
 * @returns Robust upper fence, or Infinity for fewer than 2 values
 * @kuralPatterns fenceComputation, robustFence
 * @kuralPure
 */
function robustUpperFence(values: number[], sensitivity: number): number {
  if (values.length < MIN_SAMPLE) {
    return Infinity;
  }
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  const madValue = Math.max(median(deviations), MIN_MAD);
  return med + sensitivity * MAD_SCALE * madValue;
}

export { lowerFence, median, robustLowerFence, robustUpperFence, stddev, upperFence };
