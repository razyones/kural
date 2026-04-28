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
import { fetchJson, modelNotFound, parsePerToken, readFirstEndpoint } from "./http.ts";
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
 * Scans /v1/models' `data` array for the matching model id and returns
 * its pricing sub-record.
 * @param body - Parsed JSON body from the /v1/models response
 * @param modelId - Exact model id to look up
 * @returns Pricing record when found, otherwise undefined
 * @kuralPure
 * @kuralHelper
 */
function findModelRecord(body: unknown, modelId: string): Record<string, unknown> | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const { data } = body;
  if (!Array.isArray(data)) {
    return undefined;
  }
  for (const entry of data) {
    if (isRecord(entry) && entry["id"] === modelId) {
      return entry;
    }
  }
  return undefined;
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
  const pricingBody = await fetchJson(`${params.baseURL}${MODELS_PATH}`);
  if (pricingBody === undefined) {
    return undefined;
  }
  const modelRecord = findModelRecord(pricingBody, params.modelId);
  if (modelRecord === undefined) {
    throw modelNotFound(VERCEL_ID, params.modelId);
  }
  const { pricing } = modelRecord;
  if (!isRecord(pricing)) {
    throw modelNotFound(VERCEL_ID, params.modelId);
  }
  const price = adaptPrice(pricing);
  const isReasoning = hasReasoningTag(modelRecord);
  const endpointsBody = await fetchJson(
    `${params.baseURL}${MODELS_PATH}/${params.modelId}${ENDPOINTS_SUFFIX}`,
  );
  const firstEndpoint = endpointsBody === undefined ? undefined : readFirstEndpoint(endpointsBody);
  const throughput = firstEndpoint === undefined ? undefined : adaptThroughput(firstEndpoint);
  return buildEntry(price, throughput, isReasoning);
}

/**
 * Composes the canonical CatalogEntry, dropping optional fields when the
 * gateway didn't report them so downstream code can distinguish "gateway
 * didn't say" from "gateway said false".
 * @param price - Resolved per-million price table
 * @param throughput - Latency and streaming rate, undefined when unreported
 * @param isReasoning - Whether the gateway flagged the model as reasoning
 * @returns CatalogEntry with only reported fields populated
 * @kuralPure
 * @kuralHelper
 */
function buildEntry(
  price: CatalogEntry["price"],
  throughput: NormalizedThroughput | undefined,
  isReasoning: boolean,
): CatalogEntry {
  const entry: CatalogEntry = { price };
  if (throughput !== undefined) {
    entry.throughput = throughput;
  }
  if (isReasoning) {
    entry.isReasoning = true;
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
