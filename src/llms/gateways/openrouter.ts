/**
 * Adapts OpenRouter's catalog endpoints into the canonical CatalogEntry —
 * reads `/v1/models` for pricing fields (prompt/completion/input_cache_read)
 * and `/v1/models/{id}/endpoints` for latency_last_30m.p50 and
 * throughput_last_30m.p50. It is the only module that knows OpenRouter's
 * JSON field names or that its stats endpoint is gated behind bearer auth.
 */

import type { CatalogEntry, CatalogFetchParams, PricePerMillionTokens } from "./http.ts";
import type { GatewayAdapter } from "./registry.ts";
import type { OpenAIStyleCatalogSpec } from "./catalogFetch.ts";
import { fetchOpenAIStyleCatalog } from "./catalogFetch.ts";
import { parsePerToken } from "./http.ts";

const OPENROUTER_ID = "openrouter";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_EMBEDDING_MODEL = "google/gemini-embedding-001";
const DEFAULT_ENV = "OPENROUTER_API_KEY";
const LATENCY_KEY = "latency_last_30m";
const THROUGHPUT_KEY = "throughput_last_30m";

/**
 * Reads one OpenRouter pricing object into the canonical PricePerMillionTokens.
 * OpenRouter uses prompt/completion where Vercel uses input/output.
 * @param pricing - OpenRouter catalog pricing record
 * @returns Per-million USD rates
 * @kuralPure
 * @kuralHelper
 */
function adaptPrice(pricing: Record<string, unknown>): PricePerMillionTokens {
  return {
    input: parsePerToken(pricing["prompt"]),
    output: parsePerToken(pricing["completion"]),
    cacheRead: parsePerToken(pricing["input_cache_read"]),
    cacheWrite: parsePerToken(pricing["input_cache_write"]),
  };
}

const SPEC: OpenAIStyleCatalogSpec = {
  gatewayId: OPENROUTER_ID,
  adaptPrice,
  latencyKey: LATENCY_KEY,
  throughputKey: THROUGHPUT_KEY,
  endpointsAuth: "bearer-or-skip",
};

/**
 * Delegates to the shared OpenAI-style catalog flow with OpenRouter's spec.
 * The /endpoints call is gated behind bearer auth, so the throughput half
 * is silently skipped when apiKey is absent.
 * @param params - Gateway, base URL, and resolved model id
 * @param apiKey - OpenRouter API key; only required for throughput
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

/** OpenRouter adapter — live catalog with bearer-authed stats endpoint. */
const openrouter: GatewayAdapter = {
  id: OPENROUTER_ID,
  baseURL: DEFAULT_BASE_URL,
  defaultEmbeddingModel: DEFAULT_EMBEDDING_MODEL,
  defaultApiKeyEnv: DEFAULT_ENV,
  kind: "live",
  fetchCatalog,
};

export { adaptPrice, openrouter };
