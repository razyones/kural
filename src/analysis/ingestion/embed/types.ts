/**
 * Defines the shape of cached embedding data that flows
 * between the database boundary and the embedding pipeline. It is the only
 * module that owns the cache entry shape — no other module defines what a
 * cached unit looks like.
 */

import type { KuralUnit } from "../parse/types.ts";

/** A cached unit's hash and embeddings for cache comparison. */
type CachedUnit = Pick<KuralUnit, "identityEmbedding" | "leafEmbedding"> & {
  facetHash: string;
};

/** Map from cache key to cached embeddings. */
type EmbeddingCache = Map<string, CachedUnit>;

export type { CachedUnit, EmbeddingCache };
