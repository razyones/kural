/**
 * Coordinates signature building and vector generation to
 * populate embeddings on every unit in a parse result. It is the only
 * entry point for enriching parsed code with numerical representations —
 * no other module triggers the embedding pipeline.
 */

import type { ContainerData, LeafData } from "./collect.ts";
import {
  blendDirectories,
  blendFiles,
  blendLeaves,
  buildContainerIdentities,
} from "./containers.ts";
import { collectContainers, collectLeaves } from "./collect.ts";
import type { EmbeddingCache } from "./types.ts";
import type { ParseResult } from "../parse/pipeline.ts";
import { applyParentSignal } from "./blend.ts";
import { resolveCache } from "./hash.ts";

const NONE = 0;

/**
 * A function that converts text strings into embedding vectors.
 * @kuralHelper
 */
type Embedder = (signatures: string[]) => Promise<number[][]>;

/**
 * Configuration that anchors the embed pipeline to a specific codebase — the root path, domain keywords, and term dictionary that shape how facet texts are generated.
 * @kuralHelper
 */
type EmbedOptions = {
  /** Absolute path to the generation root directory */
  rootPath: string;
  /** Top domain keywords (already selected) */
  domainKeywords: string[];
  /** Codebase-specific term definitions for prose signatures */
  dictionary?: Record<string, string>;
};

/**
 * Result of the embed pipeline including cache statistics.
 * @kuralHelper
 */
type EmbedResult = {
  total: number;
  cacheHits: number;
};

/**
 * Filters an array of texts to non-empty entries, embeds only those via
 * the embedder, and realigns the results to the original indices. Positions
 * with empty input text receive empty vectors.
 * @param causesTexts - Aligned texts where empty string means no content
 * @param embedder - Function that converts text strings to embedding vectors
 * @returns Aligned vectors with real embeddings for non-empty inputs and empty arrays for gaps
 * @kuralCauses delegates to embedder
 * @kuralPatterns embedPipeline
 */
async function embedCausesSelectively(
  causesTexts: string[],
  embedder: Embedder,
): Promise<number[][]> {
  const indices: number[] = [];
  const texts: string[] = [];
  for (let i = NONE; i < causesTexts.length; i++) {
    if (causesTexts[i].length > NONE) {
      indices.push(i);
      texts.push(causesTexts[i]);
    }
  }
  const result: number[][] = causesTexts.map(() => []);
  if (indices.length === NONE) {
    await embedder([]);
    return result;
  }
  const vectors = await embedder(texts);
  for (let j = NONE; j < indices.length; j++) {
    result[indices[j]] = vectors[j];
  }
  return result;
}

/**
 * Gathers name, description, and path texts for uncached leaves and
 * containers into three parallel arrays ready for batch embedding.
 * @param leaves - Collected leaf data with parallel facet arrays
 * @param containers - Collected container data with parallel facet arrays
 * @param uLeaf - Indices of uncached leaf units
 * @param uCont - Indices of uncached container units
 * @returns Three parallel arrays of facet texts for embedding
 * @kuralPure
 * @kuralHelper
 */
function selectUncachedFacets(
  leaves: LeafData,
  containers: ContainerData,
  uLeaf: number[],
  uCont: number[],
): { allNames: string[]; allDescs: string[]; allPaths: string[] } {
  return {
    allNames: [...uLeaf.map((i) => leaves.names[i]), ...uCont.map((i) => containers.names[i])],
    allDescs: [...uLeaf.map((i) => leaves.descs[i]), ...uCont.map((i) => containers.descs[i])],
    allPaths: [...uLeaf.map((i) => leaves.paths[i]), ...uCont.map((i) => containers.paths[i])],
  };
}

/**
 * Runs seven embedding passes for uncached units — names, descriptions,
 * paths, signatures, causes, calls, and parent context — and applies
 * the parent description signal to leaf descriptions before returning.
 * @param leaves - Collected leaf data with parallel facet arrays
 * @param containers - Collected container data with parallel facet arrays
 * @param uLeaf - Indices of uncached leaf units
 * @param uCont - Indices of uncached container units
 * @param embedder - Function that converts text strings to embedding vectors
 * @returns Facet vectors for uncached leaves and containers
 * @kuralCauses calls the embedding API via embedder
 * @kuralPatterns embedPipeline
 */
async function embedUncachedFacets(
  leaves: LeafData,
  containers: ContainerData,
  uLeaf: number[],
  uCont: number[],
  embedder: Embedder,
): Promise<{
  nameVecs: number[][];
  descVecs: number[][];
  pathVecs: number[][];
  sigVecs: number[][];
  causesVecs: number[][];
  callsVecs: number[][];
}> {
  const { allNames, allDescs, allPaths } = selectUncachedFacets(leaves, containers, uLeaf, uCont);

  const nameVecs = await embedder(allNames);
  const descVecs = await embedder(allDescs);
  const pathVecs = await embedder(allPaths);
  const sigVecs = await embedder(uLeaf.map((i) => leaves.sigs[i]));
  const causesVecs = await embedCausesSelectively(
    uLeaf.map((i) => leaves.causes[i]),
    embedder,
  );
  const callsVecs = await embedCausesSelectively(
    uLeaf.map((i) => leaves.calls[i]),
    embedder,
  );
  const parentDescVecs = await embedCausesSelectively(
    uLeaf.map((i) => leaves.parentDescs[i]),
    embedder,
  );

  for (let j = NONE; j < uLeaf.length; j++) {
    descVecs[j] = applyParentSignal(descVecs[j], parentDescVecs[j]);
  }

  return { nameVecs, descVecs, pathVecs, sigVecs, causesVecs, callsVecs };
}

/**
 * Populates identity and leaf embeddings on every unit in a parse result.
 * When a cache is provided, unchanged units are skipped.
 * @param result - The parsed codebase to enrich (mutated in place)
 * @param embedder - Function that converts text strings to embedding vectors
 * @param options - Root path, domain keywords, and dictionary for facet building
 * @param cache - Optional embedding cache from the previous snapshot
 * @returns Total units processed and cache hit count
 * @kuralCauses mutates unit embeddings in place via an embedder
 * @kuralPatterns embedPipeline
 */
async function embed(
  result: ParseResult,
  embedder: Embedder,
  options: EmbedOptions,
  cache?: EmbeddingCache,
): Promise<EmbedResult> {
  const dictionary = options.dictionary ?? {};
  const { rootPath, domainKeywords } = options;
  const leaves = collectLeaves(result, rootPath, domainKeywords, dictionary);
  const containers = collectContainers(result, rootPath, domainKeywords);
  const total = leaves.units.length + containers.units.length;
  if (total === NONE) {
    return { total: NONE, cacheHits: NONE };
  }

  const cr = resolveCache(leaves, containers, cache);
  const facets = await embedUncachedFacets(leaves, containers, cr.uLeaf, cr.uCont, embedder);
  const leafEmbs = blendLeaves(
    leaves,
    cr.cachedLeaves,
    cr.uLeaf,
    facets.nameVecs,
    facets.descVecs,
    facets.pathVecs,
    facets.sigVecs,
    facets.causesVecs,
    facets.callsVecs,
  );
  const contIds = buildContainerIdentities(
    containers,
    cr,
    facets.nameVecs,
    facets.pathVecs,
    facets.descVecs,
  );
  blendFiles(containers, leaves, contIds, leafEmbs);
  blendDirectories(containers, contIds);

  return { total, cacheHits: cr.cacheHits };
}

export { embed };
export type { Embedder, EmbedOptions, EmbedResult };
