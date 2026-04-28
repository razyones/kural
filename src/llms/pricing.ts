/**
 * Resolves a PriceResolution — canonical per-million USD rates plus the
 * TTFT/streaming-rate pair the plan's wall-clock projection consumes —
 * by dispatching through the gateway registry and falling through to
 * family-shape fallbacks when no adapter is registered or the catalog
 * call fails transiently. It is the only module that owns how a draft
 * run's prices get picked — no other module decides which table wins.
 */

import type { CatalogEntry, NormalizedThroughput, PricePerMillionTokens } from "./gateways/http.ts";
import { FREE_PRICES } from "./gateways/ollama.ts";
import type { GatewayAdapter } from "./gateways/registry.ts";
import type { GatewayOverrides } from "./apiKey.ts";
import { ModelNotFoundError } from "./gateways/http.ts";
import { findGateway } from "./gateways/registry.ts";
import { resolveGatewayApiKey } from "./apiKey.ts";

/** Conservative TTFT fallback when no gateway reports live latency. */
const FALLBACK_TTFT_SECONDS = 1.5;
/** Conservative streaming-rate fallback when no gateway reports live throughput. */
const FALLBACK_TOKENS_PER_SECOND = 60;

/** USD per million tokens for Claude Sonnet tiers. */
const SONNET_PRICES: PricePerMillionTokens = {
  input: 3,
  cacheRead: 0.3,
  cacheWrite: 6,
  output: 15,
};

/** USD per million tokens for Claude Haiku tiers. */
const HAIKU_PRICES: PricePerMillionTokens = {
  input: 1,
  cacheRead: 0.1,
  cacheWrite: 2,
  output: 5,
};

/** USD per million tokens for Claude Opus tiers. */
const OPUS_PRICES: PricePerMillionTokens = {
  input: 15,
  cacheRead: 1.5,
  cacheWrite: 30,
  output: 75,
};

/** Origin of a resolved price table — used by the readout to show provenance. */
type PriceSource = "live" | "fallback" | "local";

/** Resolved price plus throughput + a human-readable provenance label. */
type PriceResolution = {
  price: PricePerMillionTokens;
  throughput: NormalizedThroughput;
  source: PriceSource;
  sourceLabel: string;
  /**
   * Catalog-reported reasoning flag — true when the gateway tags the model as
   * a reasoning family. Undefined when the gateway doesn't report a signal
   * (e.g. fallback path or local Ollama), letting callers apply their own
   * default instead of inferring one from absence.
   */
  isReasoning?: boolean;
};

/** Inputs to a PriceResolver — gateway, base URL, and resolved model id. */
type PriceResolverInput = {
  gateway: string;
  baseURL: string;
  modelId: string;
  /** Optional per-id env-var overrides from kural.config.json. */
  overrides?: GatewayOverrides;
};

/** Async function that returns a PriceResolution for the resolved model. */
type PriceResolver = (input: PriceResolverInput) => Promise<PriceResolution>;

/**
 * Picks the price table that fits the resolved model by naive substring
 * inference — falls back to Sonnet when the family can't be recognised,
 * and to zero when the gateway is local (Ollama).
 * @param gateway - Resolved gateway id
 * @param modelId - Resolved model identifier
 * @returns Price table for the run
 * @kuralPure
 */
function priceForModel(gateway: string, modelId: string): PricePerMillionTokens {
  if (gateway === "ollama") {
    return FREE_PRICES;
  }
  const normalized = modelId.toLowerCase();
  if (normalized.includes("haiku")) {
    return HAIKU_PRICES;
  }
  if (normalized.includes("opus")) {
    return OPUS_PRICES;
  }
  return SONNET_PRICES;
}

/**
 * Returns the conservative TTFT + streaming-rate pair the plan uses when
 * no gateway reports live throughput.
 * @returns Fallback throughput pair
 * @kuralPure
 */
function fallbackThroughput(): NormalizedThroughput {
  return {
    ttftSeconds: FALLBACK_TTFT_SECONDS,
    tokensPerSecond: FALLBACK_TOKENS_PER_SECOND,
  };
}

/**
 * Returns the PriceResolution used when no gateway adapter is registered —
 * family fallback prices plus conservative throughput.
 * @param input - Resolver input with gateway id + model id
 * @returns Fallback resolution labeled with the gateway id
 * @kuralPure
 * @kuralHelper
 */
function unknownGatewayFallback(input: PriceResolverInput): PriceResolution {
  return {
    price: priceForModel(input.gateway, input.modelId),
    throughput: fallbackThroughput(),
    source: "fallback",
    sourceLabel: `${input.gateway} family fallback`,
  };
}

/**
 * Returns the PriceResolution used when a registered adapter's catalog
 * call fails transiently — family fallback prices with a label that
 * explains the catalog was unavailable.
 * @param input - Resolver input with gateway id + model id
 * @returns Fallback resolution annotated for an unavailable catalog
 * @kuralPure
 * @kuralHelper
 */
function unavailableCatalogFallback(input: PriceResolverInput): PriceResolution {
  return {
    price: priceForModel(input.gateway, input.modelId),
    throughput: fallbackThroughput(),
    source: "fallback",
    sourceLabel: `${input.gateway} family fallback (catalog unavailable)`,
  };
}

/**
 * Composes the PriceResolution for a successful adapter fetch — tags the
 * source "live" or "local" depending on the adapter's kind and fills in
 * fallback throughput when the adapter didn't report live latency.
 * @param adapter - Gateway adapter that produced the entry
 * @param entry - Canonical catalog entry from the adapter
 * @returns Fully-formed PriceResolution
 * @kuralPure
 * @kuralHelper
 */
function toResolution(adapter: GatewayAdapter, entry: CatalogEntry): PriceResolution {
  const source: PriceSource = adapter.kind === "local" ? "local" : "live";
  const sourceLabel =
    adapter.kind === "local" ? `${adapter.id} local (no billing)` : `${adapter.id} catalog`;
  const resolution: PriceResolution = {
    price: entry.price,
    throughput: entry.throughput ?? fallbackThroughput(),
    source,
    sourceLabel,
  };
  if (entry.isReasoning !== undefined) {
    resolution.isReasoning = entry.isReasoning;
  }
  return resolution;
}

/**
 * Resolves prices + throughput by looking up a gateway adapter, calling
 * its catalog fetch, and mapping the outcome to a canonical PriceResolution.
 * Falls back to the family tables when the gateway isn't registered or
 * the catalog call fails transiently. Propagates ModelNotFoundError so
 * the caller can surface a configuration mistake.
 * @param input - Resolved gateway id, base URL, and model id
 * @returns Canonical PriceResolution with provenance label
 * @kuralCauses calls the gateway adapter's fetchCatalog (which may open a network connection)
 */
async function resolvePricing(input: PriceResolverInput): Promise<PriceResolution> {
  const adapter = findGateway(input.gateway);
  if (adapter === undefined) {
    return unknownGatewayFallback(input);
  }
  const { apiKey } = resolveGatewayApiKey(adapter, input.overrides);
  try {
    const entry = await adapter.fetchCatalog(
      { gateway: input.gateway, baseURL: input.baseURL, modelId: input.modelId },
      apiKey,
    );
    if (entry === undefined) {
      return unavailableCatalogFallback(input);
    }
    return toResolution(adapter, entry);
  } catch (err) {
    if (err instanceof ModelNotFoundError) {
      throw err;
    }
    return unavailableCatalogFallback(input);
  }
}

export {
  HAIKU_PRICES,
  OPUS_PRICES,
  SONNET_PRICES,
  fallbackThroughput,
  priceForModel,
  resolvePricing,
};
export type { PriceResolution, PriceResolver, PriceResolverInput, PriceSource };
