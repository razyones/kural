/**
 * Computes detection boundaries from value distributions —
 * Z-score fences, robust MAD fences, and leave-one-out variants. It is the
 * only module that turns a distribution into a threshold — no other module
 * decides where normal ends and abnormal begins.
 */

import { avg } from "../../utils/vectors.ts";

const NONE = 0;
const MIN_SAMPLE = 2;
const BESSEL = 1;

/** 1/Φ⁻¹(¾) — makes MAD consistent with σ for normal data. */
const MAD_SCALE = 1.4826;

/** IQR ≈ 2·MAD for normal data — converts IQR to MAD-equivalent scale. */
const IQR_TO_MAD = 2;

/** Quarter markers for IQR computation. */
const QUARTILE_FRACTION = 4;
const LOWER_QUARTILE = 1;
const UPPER_QUARTILE = 3;

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
 * Computes a quartile value via linear interpolation.
 * @param sorted - Already-sorted array of numbers
 * @param q - Which quartile (1 for Q1, 3 for Q3)
 * @returns The interpolated quartile value
 * @kuralPure
 * @kuralHelper
 */
function quartile(sorted: number[], q: number): number {
  const pos = (q * (sorted.length - BESSEL)) / QUARTILE_FRACTION;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo] * (BESSEL - frac) + sorted[hi] * frac;
}

/**
 * Computes the robust spread estimate for fence computation. Returns the
 * larger of MAD and IQR/2 — under normality these are equal, so the max is
 * MAD on well-behaved data and IQR-floored when MAD degenerates toward zero
 * faster than IQR (concentrated center with preserved tails).
 * @param values - Sample of values
 * @returns Spread estimate suitable for fence scaling, or 0 if both MAD and IQR are zero
 * @kuralPure
 */
function robustSpread(values: number[]): number {
  if (values.length < MIN_SAMPLE) {
    return NONE;
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const med = median(sorted);
  const deviations = sorted.map((v) => Math.abs(v - med));
  const mad = median(deviations);
  const iqr = quartile(sorted, UPPER_QUARTILE) - quartile(sorted, LOWER_QUARTILE);
  return Math.max(mad, iqr / IQR_TO_MAD);
}

/**
 * Lower fence built from a precomputed median and spread, letting callers
 * apply their own spread blending or flooring before fencing.
 * @param med - Center of the distribution
 * @param spread - MAD-scale spread estimate (may be a blended/floored value)
 * @param sensitivity - Number of scaled MAD units from the median
 * @returns Lower fence threshold, or -Infinity when spread is zero
 * @kuralPure
 */
function buildLowerFence(med: number, spread: number, sensitivity: number): number {
  if (spread === NONE) {
    return -Infinity;
  }
  return med - sensitivity * MAD_SCALE * spread;
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
 * Falls back to IQR-based spread when MAD is zero.
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
  return buildLowerFence(median(values), robustSpread(values), sensitivity);
}

/**
 * median + sensitivity·MAD_SCALE·MAD — robust upper fence for small samples.
 * Falls back to IQR-based spread when MAD is zero.
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
  const spread = robustSpread(values);
  if (spread === NONE) {
    return Infinity;
  }
  return median(values) + sensitivity * MAD_SCALE * spread;
}

export {
  buildLowerFence,
  lowerFence,
  median,
  quartile,
  robustLowerFence,
  robustSpread,
  robustUpperFence,
  stddev,
  upperFence,
};
