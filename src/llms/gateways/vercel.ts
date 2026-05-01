/**
 * Adapts Vercel AI Gateway's catalog endpoints into the canonical
 * CatalogEntry — reads `/v1/models` for pricing fields
 * (input/output/input_cache_read/input_cache_write) and
 * `/v1/models/{id}/endpoints` for latency_last_1h.p50 and
 * throughput_last_1h.p50. It is the only module that knows Vercel's
 * JSON field names or its catalog URL conventions.
 */

import type { CatalogEntry, CatalogFetchParams, PricePerMillionTokens } from "./http.ts";
import type { GatewayAdapter } from "./registry.ts";
import type { OpenAIStyleCatalogSpec } from "./catalogFetch.ts";
import { fetchOpenAIStyleCatalog } from "./catalogFetch.ts";
import { parsePerToken } from "./http.ts";

const VERCEL_ID = "vercel";
const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_EMBEDDING_MODEL = "google/gemini-embedding-2";
const DEFAULT_ENV = "AI_GATEWAY_API_KEY";
const LATENCY_KEY = "latency_last_1h";
const THROUGHPUT_KEY = "throughput_last_1h";
const REASONING_TAG = "reasoning";

/**
 * Reads one Vercel pricing object into the canonical PricePerMillionTokens.
 * Vercel uses input/output/input_cache_read/input_cache_write.
 * @param pricing - Vercel catalog pricing record
 * @returns Per-million USD rates
 * @kuralPure
 * @kuralHelper
 */
function adaptPrice(pricing: Record<string, unknown>): PricePerMillionTokens {
  return {
    input: parsePerToken(pricing["input"]),
    output: parsePerToken(pricing["output"]),
    cacheRead: parsePerToken(pricing["input_cache_read"]),
    cacheWrite: parsePerToken(pricing["input_cache_write"]),
  };
}

/**
 * Reads the "reasoning" marker from a Vercel model record's `tags` array —
 * present for reasoning-capable models (both always-on and opt-in). Absent
 * for models that don't support reasoning at all.
 * @param entry - One model record from /v1/models' data array
 * @returns True when the record is tagged as reasoning-capable
 * @kuralPure
 * @kuralHelper
 */
function hasReasoningTag(entry: Record<string, unknown>): boolean {
  const tags = entry["tags"];
  if (!Array.isArray(tags)) {
    return false;
  }
  return tags.some((tag) => tag === REASONING_TAG);
}

const SPEC: OpenAIStyleCatalogSpec = {
  gatewayId: VERCEL_ID,
  adaptPrice,
  latencyKey: LATENCY_KEY,
  throughputKey: THROUGHPUT_KEY,
  endpointsAuth: "unauthed",
  extractReasoning: hasReasoningTag,
};

/**
 * Delegates to the shared OpenAI-style catalog flow with Vercel's spec.
 * @param params - Gateway, base URL, and resolved model id
 * @param apiKey - Ignored by Vercel; the catalog endpoints are unauthed
 * @returns Canonical CatalogEntry, or undefined when unavailable
 * @kuralCauses fetches /v1/models and /v1/models/{id}/endpoints over the network
 * @kuralHelper
 */
async function fetchCatalog(
  params: CatalogFetchParams,
  apiKey?: string,
): Promise<CatalogEntry | undefined> {
  const entry = await fetchOpenAIStyleCatalog(SPEC, params, apiKey);
  return entry;
}

/** Vercel AI Gateway adapter — live catalog, unauthed, reads AI_GATEWAY_API_KEY for chat. */
const vercel: GatewayAdapter = {
  id: VERCEL_ID,
  baseURL: DEFAULT_BASE_URL,
  defaultEmbeddingModel: DEFAULT_EMBEDDING_MODEL,
  defaultApiKeyEnv: DEFAULT_ENV,
  kind: "live",
  fetchCatalog,
};

export { adaptPrice, vercel };
