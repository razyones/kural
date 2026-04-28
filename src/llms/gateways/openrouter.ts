/**
 * Adapts OpenRouter's catalog endpoints into the canonical CatalogEntry —
 * reads `/v1/models` for pricing fields (prompt/completion/input_cache_read)
 * and `/v1/models/{id}/endpoints` for latency_last_30m.p50 and
 * throughput_last_30m.p50. It is the only module that knows OpenRouter's
 * JSON field names or that its stats endpoint is gated behind bearer auth.
 */

import type { CatalogEntry, NormalizedThroughput, PricePerMillionTokens } from "./http.ts";
import type { CatalogFetchParams, GatewayAdapter } from "./registry.ts";
import {
  ModelNotFoundError,
  fetchJson,
  findModelRecord,
  parsePerToken,
  readFirstEndpoint,
} from "./http.ts";
import { isRecord } from "../../utils/record.ts";

const OPENROUTER_ID = "openrouter";
const DEFAULT_ENV = "OPENROUTER_API_KEY";
const MODELS_PATH = "/models";
const ENDPOINTS_SUFFIX = "/endpoints";
const MS_PER_SECOND = 1000;

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

/**
 * Reads one OpenRouter endpoint record's p50 latency and streaming rate
 * into the canonical NormalizedThroughput. OpenRouter exposes a 30-minute
 * window; Vercel exposes a 1-hour window.
 * @param endpoint - One endpoint record from /v1/models/{id}/endpoints
 * @returns Normalized throughput, or undefined when the data is absent
 * @kuralPure
 * @kuralHelper
 */
function adaptThroughput(endpoint: Record<string, unknown>): NormalizedThroughput | undefined {
  const latency = endpoint["latency_last_30m"];
  const throughput = endpoint["throughput_last_30m"];
  if (!isRecord(latency) || !isRecord(throughput)) {
    return undefined;
  }
  const ttftMs = latency["p50"];
  const tps = throughput["p50"];
  if (typeof ttftMs !== "number" || typeof tps !== "number") {
    return undefined;
  }
  return { ttftSeconds: ttftMs / MS_PER_SECOND, tokensPerSecond: tps };
}

/**
 * Fetches OpenRouter's catalog entry for one model. The /models call is
 * unauthed; the /endpoints call is gated behind bearer auth, so the
 * throughput half is silently skipped when the apiKey is absent.
 * Returns undefined when the /models call is transiently unavailable.
 * Throws ModelNotFoundError when the catalog is reachable but doesn't
 * list the requested model id.
 * @param params - Gateway, base URL, and resolved model id
 * @param apiKey - OpenRouter API key; only required for throughput
 * @returns Canonical CatalogEntry, or undefined when unavailable
 * @kuralCauses fetches /v1/models and /v1/models/{id}/endpoints over the network
 */
async function fetchCatalog(
  params: CatalogFetchParams,
  apiKey?: string,
): Promise<CatalogEntry | undefined> {
  const pricingRequest = fetchJson(`${params.baseURL}${MODELS_PATH}`);
  const endpointsRequest =
    apiKey === undefined
      ? Promise.resolve()
      : fetchJson(`${params.baseURL}${MODELS_PATH}/${params.modelId}${ENDPOINTS_SUFFIX}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
  const [pricingBody, endpointsBody] = await Promise.all([pricingRequest, endpointsRequest]);
  if (pricingBody === undefined) {
    return undefined;
  }
  const modelRecord = findModelRecord(pricingBody, params.modelId);
  if (modelRecord === undefined) {
    throw new ModelNotFoundError(OPENROUTER_ID, params.modelId);
  }
  const { pricing } = modelRecord;
  if (!isRecord(pricing)) {
    return undefined;
  }
  const price = adaptPrice(pricing);
  const firstEndpoint = endpointsBody === undefined ? undefined : readFirstEndpoint(endpointsBody);
  const throughput = firstEndpoint === undefined ? undefined : adaptThroughput(firstEndpoint);
  return throughput === undefined ? { price } : { price, throughput };
}

/** OpenRouter adapter — live catalog with bearer-authed stats endpoint. */
const openrouter: GatewayAdapter = {
  id: OPENROUTER_ID,
  defaultApiKeyEnv: DEFAULT_ENV,
  kind: "live",
  catalogRequiresAuth: true,
  fetchCatalog,
};

export { adaptPrice, adaptThroughput, openrouter };
