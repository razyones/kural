/**
 * Shares the narrow fetch + JSON-shape helpers every gateway adapter
 * reuses — HTTP error swallowing, per-token price parsing, the
 * user-facing ModelNotFoundError, and the canonical pricing, throughput,
 * and catalog-entry shapes adapters produce. It is the only module that
 * owns gateway-adapter plumbing and shapes — per-gateway files call
 * these helpers and conform to these shapes instead of repeating the
 * boilerplate or redeclaring the contracts.
 */

import { isRecord } from "../../utils/record.ts";

const PER_MILLION = 1_000_000;
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

export { ModelNotFoundError, fetchJson, parsePerToken, readFirstEndpoint };
export type { CatalogEntry, NormalizedThroughput, PricePerMillionTokens };
