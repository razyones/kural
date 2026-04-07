/**
 * The recall. Reads embedding hashes and vectors from a previous snapshot
 * for cache comparison. It is the only module that loads cached embeddings —
 * no other module reads previous embedding data for reuse.
 */

import { activePath, closeSnapshot, openSnapshot } from "./snapshot.ts";
import type { EmbeddingCache } from "../analysis/ingestion/embed/types.ts";
import type { SnapshotCollections } from "./collections.ts";
import { existsSync } from "node:fs";

const SEP = "\0";

/**
 * Reads embeddings and facet hashes from all four collections into a cache map.
 * @param collections - Preloaded snapshot collections to read from
 * @returns Embedding cache map keyed by kind-prefixed unit paths
 * @kuralCauses iterates all snapshot collections
 */
function readCollectionsIntoCache(collections: SnapshotCollections): EmbeddingCache {
  const cache: EmbeddingCache = new Map();

  collections.files.forEach((row) => {
    if (row.facetHash !== undefined && row.facetHash !== "") {
      cache.set(`file${SEP}${row.path}`, {
        identityEmbedding: row.identityEmbedding,
        leafEmbedding: row.leafEmbedding,
        facetHash: row.facetHash,
      });
    }
  });

  collections.types.forEach((row) => {
    if (row.facetHash !== undefined && row.facetHash !== "") {
      cache.set(`type${SEP}${row.path}${SEP}${row.name}`, {
        identityEmbedding: row.identityEmbedding,
        leafEmbedding: row.leafEmbedding,
        facetHash: row.facetHash,
      });
    }
  });

  collections.functions.forEach((row) => {
    if (row.facetHash !== undefined && row.facetHash !== "") {
      cache.set(`func${SEP}${row.path}${SEP}${row.name}`, {
        identityEmbedding: row.identityEmbedding,
        leafEmbedding: row.leafEmbedding,
        facetHash: row.facetHash,
      });
    }
  });

  collections.directories.forEach((row) => {
    if (row.facetHash !== undefined && row.facetHash !== "") {
      cache.set(`dir${SEP}${row.path}`, {
        identityEmbedding: row.identityEmbedding,
        leafEmbedding: row.leafEmbedding,
        facetHash: row.facetHash,
      });
    }
  });

  return cache;
}

/**
 * Loads the embedding cache from the current active snapshot if it exists and the model ID matches. Returns undefined on first run, model mismatches, or corrupt databases.
 * @param root - Absolute path to the project root
 * @param branch - Current git branch name
 * @param modelId - Current embedding model ID for cache validation
 * @returns Embedding cache map or undefined if unavailable
 * @kuralCauses reads from the active snapshot database
 */
async function loadEmbeddingCache(
  root: string,
  branch: string,
  modelId: string,
): Promise<EmbeddingCache | undefined> {
  const dbPath = activePath(root, branch);
  if (!existsSync(dbPath)) {
    return undefined;
  }

  try {
    const snapshot = await openSnapshot(dbPath);
    try {
      const meta = snapshot.collections.metadata.get("model_id");
      if (meta === undefined || meta.value !== modelId) {
        return undefined;
      }
      return readCollectionsIntoCache(snapshot.collections);
    } finally {
      await closeSnapshot(snapshot);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Warning: cache load failed — embeddings will be recomputed: ${msg}`);
    return undefined;
  }
}

export { loadEmbeddingCache };
