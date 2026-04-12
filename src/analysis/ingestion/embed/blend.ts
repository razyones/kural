/**
 * Weighted vector addition primitives for embedding
 * facets — blend, signal application, and identity fusion. It is the
 * only module that defines the weight constants and mixing rules — no
 * other module decides how facets combine.
 */

import { cosineSimilarity } from "../../../utils/vectors.ts";

const NONE = 0;

/**
 * Blends two embedding vectors using weighted addition.
 * Returns the first vector if the second is empty, the second if the
 * first is empty, and an empty array if both are empty.
 * @param a - First embedding vector
 * @param weightA - Weight for the first vector
 * @param b - Second embedding vector
 * @param weightB - Weight for the second vector
 * @returns Weighted sum of both vectors
 * @kuralPure
 */
function blend(a: number[], weightA: number, b: number[], weightB: number): number[] {
  if (a.length === NONE && b.length === NONE) {
    return [];
  }
  if (a.length === NONE) {
    return b;
  }
  if (b.length === NONE) {
    return a;
  }

  const result: number[] = [];
  for (let i = NONE; i < a.length; i++) {
    result.push(a[i] * weightA + b[i] * weightB);
  }
  return result;
}

const SIG_ONLY_WEIGHT = 0.7;
const SINGLE_SIGNAL_WEIGHT = 0.3;
const SIG_BOTH_WEIGHT = 0.6;
const CAUSES_BOTH_WEIGHT = 0.25;
const CALLS_BOTH_WEIGHT = 0.15;
const PASSTHROUGH = 1;

/**
 * Applies causes and/or calls signals to a signature vector.
 * @param sigVector - Base signature embedding
 * @param causesVector - Causes signal embedding
 * @param callsVector - Calls signal embedding
 * @returns Blended signature with applied signals
 * @kuralPure
 */
function applySignatureSignals(
  sigVector: number[],
  causesVector: number[],
  callsVector: number[],
): number[] {
  const hasCauses = causesVector.length > NONE;
  const hasCalls = callsVector.length > NONE;
  if (hasCauses && hasCalls) {
    const partial = blend(sigVector, SIG_BOTH_WEIGHT, causesVector, CAUSES_BOTH_WEIGHT);
    return blend(partial, PASSTHROUGH, callsVector, CALLS_BOTH_WEIGHT);
  }
  if (hasCauses) {
    return blend(sigVector, SIG_ONLY_WEIGHT, causesVector, SINGLE_SIGNAL_WEIGHT);
  }
  if (hasCalls) {
    return blend(sigVector, SIG_ONLY_WEIGHT, callsVector, SINGLE_SIGNAL_WEIGHT);
  }
  return sigVector;
}

const DESC_WEIGHT = 0.7;
const PARENT_SIGNAL_WEIGHT = 0.3;

/**
 * Applies the parent file description signal to a leaf's description vector.
 * @param descVector - Leaf description embedding
 * @param parentVector - Parent file description embedding
 * @returns Blended description with parent signal
 * @kuralPure
 */
function applyParentSignal(descVector: number[], parentVector: number[]): number[] {
  if (parentVector.length === NONE) {
    return descVector;
  }
  return blend(descVector, DESC_WEIGHT, parentVector, PARENT_SIGNAL_WEIGHT);
}

const IDENTITY_WEIGHT = 0.5;
const NAME_WEIGHT = 0.7;
const PATH_WEIGHT = 0.3;

/**
 * Fuses a unit's name, path, and description vectors into a single identity
 * embedding that captures the unit's purpose independent of its structure.
 * @param nameVec - Embedded name vector
 * @param pathVec - Embedded path signal vector
 * @param descVec - Embedded description vector
 * @returns Identity embedding
 * @kuralPure
 */
function computeIdentity(nameVec: number[], pathVec: number[], descVec: number[]): number[] {
  const nameFacet = blend(nameVec, NAME_WEIGHT, pathVec, PATH_WEIGHT);
  return blend(nameFacet, IDENTITY_WEIGHT, descVec, IDENTITY_WEIGHT);
}

export { applyParentSignal, applySignatureSignals, blend, computeIdentity, cosineSimilarity };
