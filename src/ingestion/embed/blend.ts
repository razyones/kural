/**
 * The blender. Mixes separately-embedded facets into identity and leaf
 * vectors at fixed weights. It is the only module that performs weighted
 * vector addition on embeddings — no other module blends embedding
 * dimensions.
 */

import type { ContainerData, LeafData } from "./collect.ts";
import type { CacheResolution } from "./hash.ts";
import { cosineSimilarity } from "../../utils/vectors.ts";

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

/**
 * Computes the element-wise mean of a list of embedding vectors.
 * Ignores empty vectors. Returns empty if all inputs are empty.
 * @param vectors - Array of embedding vectors to average
 * @returns Element-wise mean vector
 * @kuralPure
 */
function mean(vectors: number[][]): number[] {
  const nonEmpty = vectors.filter((v) => v.length > NONE);
  if (nonEmpty.length === NONE) {
    return [];
  }
  const dim = nonEmpty[NONE].length;
  const result: number[] = [];
  for (let d = NONE; d < dim; d++) {
    let sum = NONE;
    for (const v of nonEmpty) {
      sum += v[d];
    }
    result.push(sum / nonEmpty.length);
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

/**
 * Blends each file's identity with the mean of its children's leaf
 * embeddings to produce the file's leaf embedding.
 * @param containers - Collected container data with file units
 * @param leaves - Collected leaf data with file-to-child mapping
 * @param identities - Pre-computed identity embeddings for containers
 * @param leafEmbeddings - Computed leaf embeddings for leaf units
 * @kuralPure
 * @kuralPatterns blendUnit
 */
function blendFiles(
  containers: ContainerData,
  leaves: LeafData,
  identities: number[][],
  leafEmbeddings: number[][],
): void {
  for (let i = NONE; i < containers.fileCount; i++) {
    const childIndices = leaves.fileChildIndices.get(containers.unitPaths[i]) ?? [];
    const sigFacet = mean(childIndices.map((idx) => leafEmbeddings[idx]));
    const leaf = blend(identities[i], IDENTITY_WEIGHT, sigFacet, IDENTITY_WEIGHT);
    containers.units[i].identityEmbedding = identities[i];
    containers.units[i].leafEmbedding = leaf;
  }
}

/**
 * Blends directory units deepest-first so each directory's leaf embedding
 * reflects the mean of its children's already-computed leaf embeddings.
 * @param containers - Collected container data with directory objects
 * @param identities - Pre-computed identity embeddings for containers
 * @kuralPure
 * @kuralPatterns blendUnit
 */
function blendDirectories(containers: ContainerData, identities: number[][]): void {
  const dirStart = containers.fileCount;
  const dirIndices = containers.dirs.map((_, i) => i);
  const SEPARATOR = "/";
  dirIndices.sort((a, b) => {
    const depthA = containers.dirs[a].path.split(SEPARATOR).length;
    const depthB = containers.dirs[b].path.split(SEPARATOR).length;
    return depthB - depthA;
  });

  const pathToLeaf = new Map<string, number[]>();
  for (let i = NONE; i < containers.fileCount; i++) {
    pathToLeaf.set(containers.unitPaths[i], containers.units[i].leafEmbedding);
  }

  for (const di of dirIndices) {
    const vi = dirStart + di;
    const childLeafs = containers.dirs[di].children
      .map((p) => pathToLeaf.get(p))
      .filter((e): e is number[] => e !== undefined && e.length > NONE);
    const leaf = blend(identities[vi], IDENTITY_WEIGHT, mean(childLeafs), IDENTITY_WEIGHT);
    containers.units[vi].identityEmbedding = identities[vi];
    containers.units[vi].leafEmbedding = leaf;
    pathToLeaf.set(containers.dirs[di].path, leaf);
  }
}

/**
 * Blends name, path, and description facets into identity embeddings for
 * every container unit. Uncached containers get fresh identities via
 * weighted vector addition; cached ones retain their previous snapshot.
 * @param containers - Collected container data
 * @param cr - Cache resolution with cached/uncached indices
 * @param nameVecs - Embedded name vectors (uncached leaves + containers)
 * @param pathVecs - Embedded path vectors (uncached leaves + containers)
 * @param descVecs - Embedded description vectors (uncached leaves + containers)
 * @returns Identity embeddings aligned with containers.units
 * @kuralPure
 * @kuralHelper
 */
function buildContainerIdentities(
  containers: ContainerData,
  cr: CacheResolution,
  nameVecs: number[][],
  pathVecs: number[][],
  descVecs: number[][],
): number[][] {
  const { cachedContainerIds, uCont, uLeaf } = cr;
  const identities = Array.from<number[]>({ length: containers.units.length });
  for (let j = NONE; j < uCont.length; j++) {
    const off = uLeaf.length + j;
    identities[uCont[j]] = computeIdentity(nameVecs[off], pathVecs[off], descVecs[off]);
  }
  for (const [i, identity] of cachedContainerIds) {
    identities[i] = identity;
  }
  return identities;
}

export {
  applyParentSignal,
  applySignatureSignals,
  blend,
  blendDirectories,
  blendFiles,
  blendLeaves,
  buildContainerIdentities,
  cosineSimilarity,
  mean,
};
