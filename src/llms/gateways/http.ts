/**
 * Shares the narrow fetch + JSON-shape helpers every gateway adapter
 * reuses — HTTP error swallowing, per-token price parsing, p50
 * throughput reading, the user-facing ModelNotFoundError, and the
 * canonical pricing/throughput/catalog-entry shapes adapters produce.
 * It is the only module that owns gateway-adapter plumbing and shapes —
 * per-gateway files and the OpenAI-style catalog flow call these
 * helpers and conform to these shapes instead of repeating the
 * boilerplate or redeclaring the contracts.
 */

import { isRecord } from "../../utils/record.ts";

/** Tokens-per-million scale factor — the unit prices and billing math operate in. */
const PER_MILLION = 1_000_000;
const MS_PER_SECOND = 1000;
const ZERO = 0;
const FIRST_INDEX = 0;

/** Per-million-token USD pricing for an LLM. */
type PricePerMillionTokens = {
  /** Normal input tokens — applied to variable user-message text */
  input: number;
  /** Cache-read tokens — applied to system prefix on every call after the first */
  cacheRead: number;
  /** Cache-write tokens — applied to system prefix on the first call only */
  cacheWrite: number;
  /** Output tokens — applied to the structured JSON response */
  output: number;
};

/** p50 time-to-first-token and streaming rate in canonical units. */
type NormalizedThroughput = {
  /** Time to first token in seconds. */
  ttftSeconds: number;
  /** Output tokens per second while streaming. */
  tokensPerSecond: number;
};

/** One gateway's resolved data for a single model — already in canonical shape. */
type CatalogEntry = {
  /** Per-million USD rates. */
  price: PricePerMillionTokens;
  /** Reported latency + streaming rate; absent when the gateway doesn't expose it. */
  throughput?: NormalizedThroughput;
  /**
   * True when the gateway flags this model as a reasoning family (emits
   * chain-of-thought tokens billed as output). Absent when the gateway
   * doesn't expose a reasoning signal — callers should treat undefined
   * as "not reported" rather than "not a reasoning model".
   */
  isReasoning?: boolean;
};

/** Inputs an adapter's catalog fetch needs — gateway id, base URL, and resolved model id. */
type CatalogFetchParams = {
  gateway: string;
  baseURL: string;
  modelId: string;
};

/**
 * Thrown when the configured model id is not offered by the gateway.
 * Fail-fast — the resolver surfaces this to the user rather than
 * falling back to family prices.
 */
class ModelNotFoundError extends Error {
  constructor(gateway: string, modelId: string) {
    super(`Model "${modelId}" is not offered by gateway "${gateway}"`);
    this.name = "ModelNotFoundError";
  }
}

/**
 * Converts a gateway's per-token USD price into the per-million number
 * the plan's cost math expects. Treats empty, negative, or non-numeric
 * values as zero so gateways that omit cache fields degrade cleanly.
 * @param raw - Price value as the gateway returned it
 * @returns USD per million tokens
 * @kuralPure
 * @kuralUtil
 */
function parsePerToken(raw: unknown): number {
  const value =
    typeof raw === "string" ? Number.parseFloat(raw) : typeof raw === "number" ? raw : ZERO;
  if (!Number.isFinite(value) || value < ZERO) {
    return ZERO;
  }
  return value * PER_MILLION;
}

/**
 * Fetches a URL and returns its parsed JSON body on success, or undefined
 * on any transient failure — network error, non-2xx status, or invalid
 * JSON. The resolver translates undefined into a catalog-unavailable
 * PricingResolutionError so callers see a typed transient failure.
 * @param url - Endpoint URL to GET
 * @param init - Optional fetch init (for auth headers)
 * @returns Parsed JSON body, or undefined on any failure
 * @kuralCauses opens a network connection to the given URL
 * @kuralUtil
 */
async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      return undefined;
    }
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Scans /v1/models' `data` array for the matching model id. Returns the
 * full model record so the caller can distinguish "model not in catalog"
 * (undefined) from "model present but pricing sub-record incomplete"
 * (record returned, pricing field missing).
 * @param body - Parsed JSON body from the /v1/models response
 * @param modelId - Exact model id to look up
 * @returns Model record when found, otherwise undefined
 * @kuralPure
 * @kuralUtil
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
 * Reads the first endpoint record from a /v1/models/{id}/endpoints response
 * so a gateway adapter's throughput reader can pull its p50 fields. Returns
 * undefined when the wrapper, the endpoints array, or its first item are
 * missing or unexpectedly shaped.
 * @param body - Parsed JSON body from the endpoints response
 * @returns First endpoint record, or undefined when the shape is unexpected
 * @kuralPure
 * @kuralUtil
 */
function readFirstEndpoint(body: unknown): Record<string, unknown> | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const data = body["data"];
  if (!isRecord(data)) {
    return undefined;
  }
  const endpoints: unknown = data["endpoints"];
  if (!Array.isArray(endpoints) || endpoints.length === ZERO) {
    return undefined;
  }
  const first: unknown = endpoints[FIRST_INDEX];
  return isRecord(first) ? first : undefined;
}

/**
 * Reads one OpenAI-style endpoint record's p50 latency (ms) and streaming
 * rate into the canonical NormalizedThroughput. Field names differ per
 * gateway — Vercel uses `_last_1h`, OpenRouter uses `_last_30m` — so the
 * caller passes them in. Returns undefined when either field is missing
 * or non-numeric.
 * @param endpoint - One endpoint record from /v1/models/{id}/endpoints
 * @param latencyKey - Field name on the endpoint that wraps the p50 latency
 * @param throughputKey - Field name on the endpoint that wraps the p50 streaming rate
 * @returns Normalized throughput, or undefined when the data is absent
 * @kuralPure
 * @kuralUtil
 */
function adaptThroughput(
  endpoint: Record<string, unknown>,
  latencyKey: string,
  throughputKey: string,
): NormalizedThroughput | undefined {
  const latency = endpoint[latencyKey];
  const throughput = endpoint[throughputKey];
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
 * Composes the canonical CatalogEntry from the parts an adapter resolved.
 * Throughput is dropped when the gateway didn't report it; isReasoning is
 * dropped when the gateway has no reasoning signal at all (callers pass
 * `false` only when the gateway authoritatively said "not a reasoning
 * model").
 * @param price - Resolved per-million price table
 * @param throughput - Latency and streaming rate, undefined when unreported
 * @param isReasoning - Authoritative reasoning flag, undefined when the gateway has no signal
 * @returns CatalogEntry with optional fields included only when set
 * @kuralPure
 * @kuralUtil
 */
function buildCatalogEntry(
  price: PricePerMillionTokens,
  throughput?: NormalizedThroughput,
  isReasoning?: boolean,
): CatalogEntry {
  const entry: CatalogEntry = { price };
  if (throughput !== undefined) {
    entry.throughput = throughput;
  }
  if (isReasoning !== undefined) {
    entry.isReasoning = isReasoning;
  }
  return entry;
}

export {
  ModelNotFoundError,
  PER_MILLION,
  adaptThroughput,
  buildCatalogEntry,
  fetchJson,
  findModelRecord,
  parsePerToken,
  readFirstEndpoint,
};
export type { CatalogEntry, CatalogFetchParams, NormalizedThroughput, PricePerMillionTokens };
