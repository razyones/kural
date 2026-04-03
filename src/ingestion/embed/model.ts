/**
 * The gateway. Crosses the network boundary to turn text into vectors
 * via an external AI service. It is the only module that speaks the
 * AI SDK protocol — no other part of the system calls embedding APIs
 * directly.
 */

import type { KuralConfig } from "../../config/schema.ts";
import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_RETRIES = 2;
const DEFAULT_CONCURRENCY = 25;
const NONE = 0;

/** A function that embeds a single batch of strings into vectors. */
type RawEmbedFn = (values: string[]) => Promise<number[][]>;

const PROVIDER_DEFAULTS: Record<
  string,
  { baseURL?: string; model: string; apiKeyOptional?: boolean }
> = {
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    model: "google/gemini-embedding-001",
  },
  openai: {
    model: "text-embedding-3-small",
  },
  vercel: {
    baseURL: "https://ai-gateway.vercel.sh/v1",
    model: "google/gemini-embedding-2",
  },
  ollama: {
    baseURL: "http://localhost:11434/v1",
    model: "qwen3-embedding:latest",
    apiKeyOptional: true,
  },
};

/** Options for batch embedding calls. */
type EmbedBatchOptions = {
  /** Maximum signatures per API call */
  batchSize?: number;
  /** Maximum concurrent batch calls */
  concurrency?: number;
  /** Progress callback with completed and total counts */
  onProgress?: (completed: number, total: number) => void;
};

/**
 * Creates a raw embed function and model ID from provider configuration.
 * @param config - Embeddings configuration with provider, model, and API key
 * @returns An object with a batch embed function and the resolved model ID
 * @kuralCauses initializes a remote embedding connection from provider config
 */
function createEmbeddingModel(config: KuralConfig["embeddings"]): {
  embed: RawEmbedFn;
  modelId: string;
} {
  if (!(config.provider in PROVIDER_DEFAULTS)) {
    const supported = Object.keys(PROVIDER_DEFAULTS).join(", ");
    throw new Error(`Unsupported embedding provider "${config.provider}". Supported: ${supported}`);
  }
  const defaults = PROVIDER_DEFAULTS[config.provider];
  const modelId = config.model ?? defaults.model;

  const baseURL = config.baseURL ?? defaults.baseURL;
  const apiKey =
    config.apiKey ??
    process.env.AI_GATEWAY_API_KEY ??
    (defaults.apiKeyOptional === true ? "ollama" : undefined);

  if (apiKey === undefined) {
    throw new Error(
      `No API key for provider "${config.provider}". Set AI_GATEWAY_API_KEY or pass --api-key`,
    );
  }

  const provider = createOpenAI({
    ...(baseURL !== undefined && baseURL !== "" ? { baseURL } : {}),
    ...(apiKey === "" ? {} : { apiKey }),
  });
  const model = provider.embedding(modelId);

  return {
    embed: async (values: string[]) => {
      try {
        const { embeddings } = await embedMany({
          model,
          values,
          maxRetries: DEFAULT_RETRIES,
        });
        return embeddings;
      } catch (err) {
        throw new Error(
          `Embedding API call failed (provider: ${config.provider}, model: ${modelId}): ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    },
    modelId,
  };
}

/** A batch of signatures with their starting index for ordered reassembly. @kuralResidual merge-candidates [b6ad58df] */
type IndexedBatch = { index: number; values: string[] };

/**
 * Splits an array of strings into indexed batches.
 * @param values - The full array of strings to split
 * @param batchSize - Maximum number of items per batch
 * @returns An array of indexed batches for ordered reassembly
 * @kuralPure
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
 * Maps sparse results back into a full-length array with empty vectors for gaps.
 * @param total - The original array length
 * @param indices - Indices where real results belong
 * @param results - The real result vectors, aligned with indices
 * @returns Full-length array with empty vectors at filtered-out positions
 * @kuralPure
 */
function realign(total: number, indices: number[], results: number[][]): number[][] {
  const aligned: number[][] = Array.from({ length: total }, () => []);
  for (let i = NONE; i < indices.length; i++) {
    aligned[indices[i]] = results[i];
  }
  return aligned;
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
  if (values.length === NONE) {
    return signatures.map(() => []);
  }

  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const total = values.length;
  const batches = createBatches(values, batchSize);
  const results = Array.from<number[]>({ length: total });
  let completed = 0;

  const embedBatch = async (batch: IndexedBatch): Promise<void> => {
    const embeddings = await embed(batch.values);
    for (let j = 0; j < embeddings.length; j++) {
      results[batch.index + j] = embeddings[j];
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

  return realign(signatures.length, indices, results);
}

export { createEmbeddingModel, embedSignatures };
export type { EmbedBatchOptions };
