/**
 * Computes content hashes for embedding facet texts so
 * unchanged units can skip re-embedding. It is the only module that decides
 * whether a unit's embedding inputs have changed — no other module computes
 * facet hashes or resolves cache hits.
 */

import type { ContainerData, LeafData } from "./collect.ts";
import type { EmbeddingCache } from "./types.ts";
import type { KuralUnit } from "../parse/types.ts";
import { createHash } from "node:crypto";

const NONE = 0;
const SEP = "\0";

/** Resolved cache state: which units are cached and which need embedding. */
type CacheResolution = {
  cachedLeaves: Set<number>;
  cachedContainerIds: Map<number, number[]>;
  cacheHits: number;
  uLeaf: number[];
  uCont: number[];
};

/**
 * Produces a hex-encoded SHA-256 digest from raw text.
 * @param text - Input string to hash
 * @returns Hex-encoded SHA-256 digest
 * @kuralPure
 * @kuralHelper
 */
function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Digests all seven facet texts of a leaf unit — name, description, parent
 * description, path, signature, causes, and calls — into a single SHA-256
 * hash for change detection.
 * @param leaves - Collected leaf data with parallel facet arrays
 * @param index - Index into the parallel arrays
 * @returns SHA-256 hex digest of the concatenated facets
 * @kuralPure
 * @kuralPatterns hashFacets
 */
function hashLeafFacets(leaves: LeafData, index: number): string {
  const parts = [
    leaves.names[index],
    leaves.descs[index],
    leaves.parentDescs[index],
    leaves.paths[index],
    leaves.sigs[index],
    leaves.causes[index],
    leaves.calls[index],
  ];
  return sha256(parts.join(SEP));
}

/**
 * Digests the three facet texts of a container unit — name, description,
 * and path — into a single SHA-256 hash for change detection.
 * @param containers - Collected container data with parallel facet arrays
 * @param index - Index into the parallel arrays
 * @returns SHA-256 hex digest of the concatenated facets
 * @kuralPure
 * @kuralPatterns hashFacets
 */
function hashContainerFacets(containers: ContainerData, index: number): string {
  return sha256(
    [containers.names[index], containers.descs[index], containers.paths[index]].join(SEP),
  );
}

/**
 * Builds a kind-prefixed lookup key for a leaf unit so types and functions
 * with the same path and name resolve to distinct cache entries.
 * @param unit - The leaf unit to build a key for
 * @returns A unique string key prefixed with "func" or "type"
 * @kuralPure
 * @kuralHelper
 * @kuralPatterns cacheKey
 */
function leafCacheKey(unit: KuralUnit): string {
  const kind = "params" in unit ? "func" : "type";
  return `${kind}\0${unit.path}\0${unit.name}`;
}

/**
 * Builds a kind-prefixed lookup key for a container unit, distinguishing
 * files from directories by their position in the containers array.
 * @param containers - Collected container data
 * @param index - Index into the parallel arrays
 * @returns A unique string key prefixed with "file" or "dir"
 * @kuralPure
 * @kuralPatterns cacheKey
 */
function containerCacheKey(containers: ContainerData, index: number): string {
  const kind = index < containers.fileCount ? "file" : "dir";
  return `${kind}\0${containers.unitPaths[index]}`;
}

/**
 * Computes facet hashes and resolves which units can be served from cache.
 * Sets facetHash on every unit and copies cached embeddings directly.
 * @param leaves - Collected leaf data with units and facet arrays
 * @param containers - Collected container data with units and facet arrays
 * @param cache - Optional embedding cache from the previous snapshot
 * @returns Cached/uncached index sets and total cache hit count
 * @kuralPure
 */
function resolveCache(
  leaves: LeafData,
  containers: ContainerData,
  cache?: EmbeddingCache,
): CacheResolution {
  for (let i = NONE; i < leaves.units.length; i++) {
    leaves.units[i].facetHash = hashLeafFacets(leaves, i);
  }
  for (let i = NONE; i < containers.units.length; i++) {
    containers.units[i].facetHash = hashContainerFacets(containers, i);
  }

  const cachedLeaves = new Set<number>();
  const cachedContainerIds = new Map<number, number[]>();
  let cacheHits = NONE;

  if (cache) {
    for (let i = NONE; i < leaves.units.length; i++) {
      const prev = cache.get(leafCacheKey(leaves.units[i]));
      if (prev !== undefined && prev.facetHash === leaves.units[i].facetHash) {
        leaves.units[i].identityEmbedding = prev.identityEmbedding;
        leaves.units[i].leafEmbedding = prev.leafEmbedding;
        cachedLeaves.add(i);
        cacheHits++;
      }
    }
    for (let i = NONE; i < containers.units.length; i++) {
      const prev = cache.get(containerCacheKey(containers, i));
      if (prev !== undefined && prev.facetHash === containers.units[i].facetHash) {
        cachedContainerIds.set(i, prev.identityEmbedding);
        cacheHits++;
      }
    }
  }

  const uLeaf: number[] = [];
  for (let i = NONE; i < leaves.units.length; i++) {
    if (!cachedLeaves.has(i)) {
      uLeaf.push(i);
    }
  }
  const uCont: number[] = [];
  for (let i = NONE; i < containers.units.length; i++) {
    if (!cachedContainerIds.has(i)) {
      uCont.push(i);
    }
  }

  return { cachedLeaves, cachedContainerIds, cacheHits, uLeaf, uCont };
}

export { resolveCache, sha256 };
export type { CacheResolution };
