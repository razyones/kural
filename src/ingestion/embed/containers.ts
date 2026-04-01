/**
 * The assembler. Blends all unit embeddings from facet vectors — leaves
 * from identity and signature, files from children, directories bottom-up.
 * It is the only module that produces final embedding vectors — no other
 * module aggregates facets into identity and leaf embeddings.
 */

import type { ContainerData, LeafData } from "./collect.ts";
import { applySignatureSignals, blend, computeIdentity } from "./blend.ts";
import type { CacheResolution } from "./hash.ts";
import type { KuralDirectory } from "../parse/types.ts";
import { centroid } from "../../utils/vectors.ts";

const NONE = 0;
const IDENTITY_WEIGHT = 0.5;
const PATTERN_NONE = 0;

/**
 * Collapses leaf embeddings by pattern group: members sharing a
 * `patterns` tag are averaged into a single centroid so each concept
 * contributes equally to the file's leaf regardless of instance count.
 * @param indices - Child leaf indices for this file
 * @param leafEmbeddings - Computed leaf embeddings for leaf units
 * @param leaves - Leaf data for pattern tag lookup
 * @returns One representative vector per distinct concept
 * @kuralPure
 * @kuralHelper
 */
function collapseByPattern(
  indices: number[],
  leafEmbeddings: number[][],
  leaves: LeafData,
): number[][] {
  const groups = new Map<string, number[][]>();
  const ungrouped: number[][] = [];

  for (const idx of indices) {
    const patternId = leaves.patternIds[idx];
    const vec = leafEmbeddings[idx];
    if (vec === undefined || vec.length === PATTERN_NONE) {
      continue;
    }
    if (patternId !== undefined && patternId !== "") {
      const bucket = groups.get(patternId);
      if (bucket) {
        bucket.push(vec);
      } else {
        groups.set(patternId, [vec]);
      }
    } else {
      ungrouped.push(vec);
    }
  }

  const reps = [...ungrouped];
  for (const vecs of groups.values()) {
    reps.push(centroid(vecs));
  }
  return reps;
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
 * Collapses patterns and gives outward-bound children 2x weight.
 * @param childIndices - Leaf indices belonging to this file
 * @param leafEmbeddings - Computed leaf embeddings for leaf units
 * @param leaves - Leaf data for pattern and bound tag lookup
 * @returns Mean embedding after pattern collapse and outward boosting
 * @kuralPure
 * @kuralHelper
 */
function computeFileSigFacet(
  childIndices: number[],
  leafEmbeddings: number[][],
  leaves: LeafData,
): number[] {
  const reps = collapseByPattern(childIndices, leafEmbeddings, leaves);
  for (const idx of childIndices) {
    if (leaves.boundIds[idx] === "outward" && leafEmbeddings[idx].length > NONE) {
      reps.push(leafEmbeddings[idx]);
    }
  }
  return centroid(reps);
}

/**
 * Resolves sigFacet for an inward file from sibling leaf embeddings,
 * falling back to own children when no siblings are available.
 * @param filePath - Absolute path of the inward file
 * @param fileToDir - Mapping from file path to parent directory
 * @param leaves - Leaf data with file-to-child-index mapping
 * @param leafEmbeddings - Computed leaf embeddings for leaf units
 * @param pathToFileLeaf - Mapping from file path to blended leaf embedding
 * @returns Sibling-derived or self-derived signature facet
 * @kuralPure
 * @kuralHelper
 */
function resolveInwardSigFacet(
  filePath: string,
  fileToDir: Map<string, KuralDirectory>,
  leaves: LeafData,
  leafEmbeddings: number[][],
  pathToFileLeaf: Map<string, number[]>,
): number[] {
  const dir = fileToDir.get(filePath);
  if (dir !== undefined) {
    const siblingLeafs = dir.children
      .filter((p) => p !== filePath)
      .map((p) => pathToFileLeaf.get(p))
      .filter((e): e is number[] => e !== undefined && e.length > NONE);
    if (siblingLeafs.length > NONE) {
      return centroid(siblingLeafs);
    }
  }
  const childIndices = leaves.fileChildIndices.get(filePath) ?? [];
  return computeFileSigFacet(childIndices, leafEmbeddings, leaves);
}

/**
 * Blends each file's identity with children's leaf embeddings.
 * Outward children get 2x weight; inward files use sibling vectors.
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
  const pathToFileLeaf = new Map<string, number[]>();
  const fileToDir = new Map<string, KuralDirectory>();
  for (const dir of containers.dirs) {
    for (const child of dir.children) {
      fileToDir.set(child, dir);
    }
  }
  for (let i = NONE; i < containers.fileCount; i++) {
    if (containers.fileBounds[i] === "inward") {
      continue;
    }
    const childIndices = leaves.fileChildIndices.get(containers.unitPaths[i]) ?? [];
    const sigFacet = computeFileSigFacet(childIndices, leafEmbeddings, leaves);
    const leaf = blend(identities[i], IDENTITY_WEIGHT, sigFacet, IDENTITY_WEIGHT);
    containers.units[i].identityEmbedding = identities[i];
    containers.units[i].leafEmbedding = leaf;
    pathToFileLeaf.set(containers.unitPaths[i], leaf);
  }
  for (let i = NONE; i < containers.fileCount; i++) {
    if (containers.fileBounds[i] !== "inward") {
      continue;
    }
    const filePath = containers.unitPaths[i];
    const sigFacet = resolveInwardSigFacet(
      filePath,
      fileToDir,
      leaves,
      leafEmbeddings,
      pathToFileLeaf,
    );
    const leaf = blend(identities[i], IDENTITY_WEIGHT, sigFacet, IDENTITY_WEIGHT);
    containers.units[i].identityEmbedding = identities[i];
    containers.units[i].leafEmbedding = leaf;
    pathToFileLeaf.set(filePath, leaf);
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
    const leaf = blend(identities[vi], IDENTITY_WEIGHT, centroid(childLeafs), IDENTITY_WEIGHT);
    containers.units[vi].identityEmbedding = identities[vi];
    containers.units[vi].leafEmbedding = leaf;
    pathToLeaf.set(containers.dirs[di].path, leaf);
  }
}

/**
 * Builds identity embeddings for all containers from facet vectors.
 * Uncached get fresh identities; cached retain previous snapshot.
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

export { blendDirectories, blendFiles, blendLeaves, buildContainerIdentities, collapseByPattern };
