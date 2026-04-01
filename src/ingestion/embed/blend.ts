/**
 * The blender. Mixes separately-embedded facets into identity and leaf
 * vectors at fixed weights. It is the only module that performs weighted
 * vector addition on embeddings — no other module blends embedding dimensions.
 */

import { centroid, cosineSimilarity } from "../../utils/vectors.ts";
import type { LeafData } from "./collect.ts";

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

/**
 * Produces the full leaf embeddings array for all leaf units. Uncached
 * leaves are blended from fresh identity and signature vectors; cached
 * leaves are copied from their previously stored embeddings.
 * @param leaves - Collected leaf data with units for write-back
 * @param cached - Indices of cached leaf units
 * @param uLeaf - Indices of uncached leaf units
 * @param nameVecs - Embedded name vectors aligned with uncached leaves
 * @param descVecs - Embedded description vectors aligned with uncached leaves
 * @param pathVecs - Embedded path vectors aligned with uncached leaves
 * @param sigVecs - Embedded signature vectors aligned with uncached leaves
 * @param causesVecs - Embedded causes vectors aligned with uncached leaves
 * @param callsVecs - Embedded calls vectors aligned with uncached leaves
 * @returns Full leaf embeddings array with both cached and fresh entries
 * @kuralPure
 * @kuralPatterns blendUnit
 */
function blendLeaves(
  leaves: LeafData,
  cached: Set<number>,
  uLeaf: number[],
  nameVecs: number[][],
  descVecs: number[][],
  pathVecs: number[][],
  sigVecs: number[][],
  causesVecs: number[][],
  callsVecs: number[][],
): number[][] {
  const allLeafEmbs = Array.from<number[]>({ length: leaves.units.length });
  for (let j = NONE; j < uLeaf.length; j++) {
    const i = uLeaf[j];
    const identity = computeIdentity(nameVecs[j], pathVecs[j], descVecs[j]);
    const adjustedSig = applySignatureSignals(sigVecs[j], causesVecs[j], callsVecs[j]);
    const leaf = blend(identity, IDENTITY_WEIGHT, adjustedSig, IDENTITY_WEIGHT);
    leaves.units[i].identityEmbedding = identity;
    leaves.units[i].leafEmbedding = leaf;
    allLeafEmbs[i] = leaf;
  }
  for (const i of cached) {
    allLeafEmbs[i] = leaves.units[i].leafEmbedding;
  }
  return allLeafEmbs;
}

export {
  applyParentSignal,
  applySignatureSignals,
  blend,
  blendLeaves,
  centroid,
  computeIdentity,
  cosineSimilarity,
};
