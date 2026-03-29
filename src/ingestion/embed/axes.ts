/**
 * The surveyor. Embeds anchor sentences and computes semantic axis vectors
 * from their pole centroids. It is the only module that turns axis
 * definitions into reusable measurement vectors — no other module builds
 * axes from anchor embeddings.
 */

import { centroid, pruneOutliers, subtract } from "../../utils/vectors.ts";
import type { AxisDefinition } from "../../config/axis-anchors.ts";
import type { Embedder } from "./pipeline.ts";

const NONE = 0;
const MIN_PRUNE_SIZE = 3;
const OUTLIER_THRESHOLD = 1.5;

/**
 * A computed semantic axis: a normalized difference vector between two
 * pole centroids, ready for dot-product scoring.
 * @kuralResidual duplicates [1618cc7f]
 */
type ComputedAxis = {
  /** Axis identifier matching the source definition */
  id: string;
  /** Normalized axis vector (positive pole minus negative pole) */
  vector: number[];
  /** Number of anchors retained after pruning (negative pole) */
  negativeRetained: number;
  /** Number of anchors retained after pruning (positive pole) */
  positiveRetained: number;
};

/**
 * Normalizes a vector to unit length.
 * @param v - Vector to normalize
 * @returns Unit-length vector in the same direction
 * @kuralPure
 */
function normalize(v: number[]): number[] {
  let mag = NONE;
  for (const x of v) {
    mag += x * x;
  }
  mag = Math.sqrt(mag);
  if (mag === NONE) {
    return v;
  }
  return v.map((x) => x / mag);
}

/**
 * Embeds anchor sentences for both poles and computes the axis vector.
 * Prunes outlier anchors before computing centroids to ensure a clean
 * semantic axis.
 * @param definition - Axis definition with anchor sentence groups
 * @param embedder - Function that converts text strings to embedding vectors
 * @returns Computed axis with normalized direction vector
 * @kuralCauses calls the embedding API via embedder
 */
async function computeAxis(definition: AxisDefinition, embedder: Embedder): Promise<ComputedAxis> {
  const [negVecs, posVecs] = await Promise.all([
    embedder(definition.negativeAnchors),
    embedder(definition.positiveAnchors),
  ]);

  const prunedNeg = pruneOutliers(negVecs, MIN_PRUNE_SIZE, OUTLIER_THRESHOLD);
  const prunedPos = pruneOutliers(posVecs, MIN_PRUNE_SIZE, OUTLIER_THRESHOLD);

  const negCentroid = centroid(prunedNeg);
  const posCentroid = centroid(prunedPos);
  const axis = normalize(subtract(posCentroid, negCentroid));

  return {
    id: definition.id,
    vector: axis,
    negativeRetained: prunedNeg.length,
    positiveRetained: prunedPos.length,
  };
}

/**
 * Scores a description embedding against a computed axis.
 * @param descriptionEmbedding - The embedding to score
 * @param axis - The computed axis vector
 * @returns Signed scalar: positive = "does", negative = "is", magnitude = confidence
 * @kuralPure
 */
function scoreOnAxis(descriptionEmbedding: number[], axis: ComputedAxis): number {
  if (descriptionEmbedding.length === NONE || axis.vector.length === NONE) {
    return NONE;
  }
  const normed = normalize(descriptionEmbedding);
  let dot = NONE;
  for (let i = NONE; i < normed.length; i++) {
    dot += normed[i] * axis.vector[i];
  }
  return dot;
}

export { computeAxis, scoreOnAxis };
export type { ComputedAxis };
