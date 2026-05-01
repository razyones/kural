/**
 * Splits a list of signatures into bounded-concurrency batches and
 * reassembles the resulting vectors in input order, calling a
 * caller-supplied embed function per batch. It is the only module
 * that owns chunking, parallelism, and progress reporting for the
 * embedding flow — the network call itself is delegated.
 */

import type { RawEmbedFn } from "../../../llms/embedding.ts";

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_CONCURRENCY = 25;
const NONE = 0;

/** Options for batch embedding calls. */
type EmbedBatchOptions = {
  /** Maximum signatures per API call */
  batchSize?: number;
  /** Maximum concurrent batch calls */
  concurrency?: number;
  /** Progress callback with completed and total counts */
  onProgress?: (completed: number, total: number) => void;
};

/** A batch of signatures with their starting index for ordered reassembly. */
type IndexedBatch = { index: number; values: string[] };

/**
 * Splits an array of strings into indexed batches.
 * @param values - The full array of strings to split
 * @param batchSize - Maximum number of items per batch
 * @returns An array of indexed batches for ordered reassembly
 * @kuralPure
 * @kuralHelper
 */
function createBatches(values: string[], batchSize: number): IndexedBatch[] {
  const batches: IndexedBatch[] = [];
  for (let i = 0; i < values.length; i += batchSize) {
    batches.push({ index: i, values: values.slice(i, i + batchSize) });
  }
  return batches;
}

/** Filtered non-empty strings with their original indices. */
type NonEmptyFilter = { indices: number[]; values: string[] };

/**
 * Separates non-empty strings from an array, preserving original indices.
 * @param strings - The input array that may contain empty strings
 * @returns Non-empty values with their original indices for reassembly
 * @kuralPure
 * @kuralHelper
 */
function filterEmpty(strings: string[]): NonEmptyFilter {
  const indices: number[] = [];
  const values: string[] = [];
  for (let i = NONE; i < strings.length; i++) {
    if (strings[i].length > NONE) {
      indices.push(i);
      values.push(strings[i]);
    }
  }
  return { indices, values };
}

/**
 * Batch-embeds an array of strings with bounded concurrency.
 * @param signatures - Array of text strings to embed
 * @param embed - Raw embed function that handles a single batch
 * @param options - Batch size, concurrency, and progress settings
 * @returns Array of embedding vectors, one per input string
 * @kuralCauses splits strings into batches and calls a remote API with bounded concurrency
 */
async function embedSignatures(
  signatures: string[],
  embed: RawEmbedFn,
  options: EmbedBatchOptions = {},
): Promise<number[][]> {
  if (signatures.length === NONE) {
    return [];
  }

  const { indices, values } = filterEmpty(signatures);
  const aligned: number[][] = signatures.map(() => []);
  if (values.length === NONE) {
    return aligned;
  }

  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const total = values.length;
  const batches = createBatches(values, batchSize);
  let completed = 0;

  const embedBatch = async (batch: IndexedBatch): Promise<void> => {
    const embeddings = await embed(batch.values);
    for (let j = 0; j < embeddings.length; j++) {
      aligned[indices[batch.index + j]] = embeddings[j];
    }
    completed += batch.values.length;
    options.onProgress?.(completed, total);
  };

  const pending = new Set<Promise<void>>();
  for (const batch of batches) {
    const p = embedBatch(batch).then(() => {
      pending.delete(p);
    });
    pending.add(p);
    if (pending.size >= concurrency) {
      await Promise.race(pending);
    }
  }
  await Promise.all(pending);

  return aligned;
}

export { embedSignatures };
export type { EmbedBatchOptions };
