/**
 * Adapts Vercel AI Gateway's catalog endpoints into the canonical
 * CatalogEntry — reads `/v1/models` for pricing fields
 * (input/output/input_cache_read/input_cache_write) and
 * `/v1/models/{id}/endpoints` for latency_last_1h.p50 and
 * throughput_last_1h.p50. It is the only module that knows Vercel's
 * JSON field names or its catalog URL conventions.
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

const VERCEL_ID = "vercel";
const DEFAULT_ENV = "AI_GATEWAY_API_KEY";
const MODELS_PATH = "/models";
const ENDPOINTS_SUFFIX = "/endpoints";
const MS_PER_SECOND = 1000;
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
 * Reads one Vercel endpoint record's p50 latency and streaming rate into
 * the canonical NormalizedThroughput. Returns undefined when either field
 * is missing or non-numeric.
 * @param endpoint - One endpoint record from /v1/models/{id}/endpoints
 * @returns Normalized throughput, or undefined when the data is absent
 * @kuralPure
 * @kuralHelper
 */
function adaptThroughput(endpoint: Record<string, unknown>): NormalizedThroughput | undefined {
  const latency = endpoint["latency_last_1h"];
  const throughput = endpoint["throughput_last_1h"];
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

/**
 * Fetches Vercel's catalog entry for one model. Vercel's catalog is
 * unauthed, so the apiKey is ignored. Returns undefined when the /models
 * call is transiently unavailable. Throws ModelNotFoundError when the
 * catalog is reachable but doesn't list the requested model id.
 * @param params - Gateway, base URL, and resolved model id
 * @param _apiKey - Ignored (catalog is unauthed)
 * @returns Canonical CatalogEntry, or undefined when unavailable
 * @kuralCauses fetches /v1/models and /v1/models/{id}/endpoints over the network
 */
async function fetchCatalog(
  params: CatalogFetchParams,
  _apiKey?: string,
): Promise<CatalogEntry | undefined> {
  const [pricingBody, endpointsBody] = await Promise.all([
    fetchJson(`${params.baseURL}${MODELS_PATH}`),
    fetchJson(`${params.baseURL}${MODELS_PATH}/${params.modelId}${ENDPOINTS_SUFFIX}`),
  ]);
  if (pricingBody === undefined) {
    return undefined;
  }
  const modelRecord = findModelRecord(pricingBody, params.modelId);
  if (modelRecord === undefined) {
    throw new ModelNotFoundError(VERCEL_ID, params.modelId);
  }
  const { pricing } = modelRecord;
  if (!isRecord(pricing)) {
    return undefined;
  }
  const price = adaptPrice(pricing);
  const isReasoning = hasReasoningTag(modelRecord);
  const firstEndpoint = endpointsBody === undefined ? undefined : readFirstEndpoint(endpointsBody);
  const throughput = firstEndpoint === undefined ? undefined : adaptThroughput(firstEndpoint);
  return buildEntry(price, throughput, isReasoning);
}

/**
 * Composes the canonical CatalogEntry. Throughput is dropped when the
 * gateway didn't report it (undefined ≠ "gateway said zero"); isReasoning
 * is always propagated because Vercel's tags array is the authoritative
 * signal for this gateway — absence of the "reasoning" tag is a positive
 * `false`, distinct from gateways that don't expose a reasoning signal at
 * all.
 * @param price - Resolved per-million price table
 * @param throughput - Latency and streaming rate, undefined when unreported
 * @param isReasoning - Whether the gateway flagged the model as reasoning
 * @returns CatalogEntry with throughput optional and isReasoning always set
 * @kuralPure
 * @kuralHelper
 */
function buildEntry(
  price: CatalogEntry["price"],
  throughput: NormalizedThroughput | undefined,
  isReasoning: boolean,
): CatalogEntry {
  const entry: CatalogEntry = { price, isReasoning };
  if (throughput !== undefined) {
    entry.throughput = throughput;
  }
  return entry;
}

/** Vercel AI Gateway adapter — live catalog, unauthed, reads AI_GATEWAY_API_KEY for chat. */
const vercel: GatewayAdapter = {
  id: VERCEL_ID,
  defaultApiKeyEnv: DEFAULT_ENV,
  kind: "live",
  catalogRequiresAuth: false,
  fetchCatalog,
};

export { adaptPrice, adaptThroughput, vercel };
