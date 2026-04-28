/**
 * Resolves a PriceResolution — canonical per-million USD rates plus the
 * gateway-reported p50 latency/streaming rate when present — by dispatching
 * through the gateway registry. The gateway catalog endpoints are the
 * single source of truth: this module throws when no adapter is registered,
 * the catalog is unreachable, or the model id isn't listed. It is the
 * only module that owns how a draft run's prices get picked.
 */

import type { CatalogEntry, NormalizedThroughput, PricePerMillionTokens } from "./gateways/http.ts";
import type { GatewayAdapter } from "./gateways/registry.ts";
import type { GatewayOverrides } from "./apiKey.ts";
import { ModelNotFoundError } from "./gateways/http.ts";
import { findGateway } from "./gateways/registry.ts";
import { resolveGatewayApiKey } from "./apiKey.ts";

/** Origin of a resolved price table — used by the readout to show provenance. */
type PriceSource = "live" | "local";

/** Resolved price plus optional throughput + a human-readable provenance label. */
type PriceResolution = {
  price: PricePerMillionTokens;
  /** p50 latency + streaming rate; absent when the gateway didn't expose it for this model. */
  throughput?: NormalizedThroughput;
  source: PriceSource;
  sourceLabel: string;
  /**
   * Catalog-reported reasoning flag — true when the gateway tags the model as
   * a reasoning family. Undefined when the gateway doesn't report a signal
   * (e.g. local Ollama), letting callers apply their own default instead of
   * inferring one from absence.
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

/** Discriminator for why pricing resolution couldn't produce a live entry. */
type PricingErrorReason = "unknown-gateway" | "catalog-unavailable";

/**
 * Thrown when pricing resolution can't return a live entry — the gateway
 * has no registered adapter or the catalog endpoint is unreachable. The
 * structured `reason` lets callers branch without parsing the message;
 * model-not-listed is a separate ModelNotFoundError because that signals
 * a config mistake the user must fix, not a transient failure.
 */
class PricingResolutionError extends Error {
  readonly reason: PricingErrorReason;
  readonly gateway: string;
  constructor(reason: PricingErrorReason, gateway: string) {
    super(
      reason === "unknown-gateway"
        ? `No registered adapter for gateway "${gateway}"`
        : `Catalog unavailable for gateway "${gateway}"`,
    );
    this.name = "PricingResolutionError";
    this.reason = reason;
    this.gateway = gateway;
  }
}

/**
 * Composes the PriceResolution for a successful adapter fetch — tags the
 * source "live" or "local" depending on the adapter's kind, and passes
 * throughput through as the gateway reported it (absent when unreported).
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
  const resolution: PriceResolution = { price: entry.price, source, sourceLabel };
  if (entry.throughput !== undefined) {
    resolution.throughput = entry.throughput;
  }
  if (entry.isReasoning !== undefined) {
    resolution.isReasoning = entry.isReasoning;
  }
  return resolution;
}

/**
 * Resolves prices + optional throughput by looking up a gateway adapter and
 * calling its catalog fetch. Throws UnknownGatewayError when no adapter is
 * registered, CatalogUnavailableError when the catalog call fails transiently,
 * and ModelNotFoundError when the catalog is reachable but doesn't list the
 * requested model id.
 * @param input - Resolved gateway id, base URL, and model id
 * @returns Canonical PriceResolution with provenance label
 * @kuralCauses calls the gateway adapter's fetchCatalog (which may open a network connection)
 */
async function resolvePricing(input: PriceResolverInput): Promise<PriceResolution> {
  const adapter = findGateway(input.gateway);
  if (adapter === undefined) {
    throw new PricingResolutionError("unknown-gateway", input.gateway);
  }
  const { apiKey } = resolveGatewayApiKey(adapter, input.overrides);
  let entry: CatalogEntry | undefined;
  try {
    entry = await adapter.fetchCatalog(
      { gateway: input.gateway, baseURL: input.baseURL, modelId: input.modelId },
      apiKey,
    );
  } catch (err) {
    if (err instanceof ModelNotFoundError) {
      throw err;
    }
    throw new PricingResolutionError("catalog-unavailable", input.gateway);
  }
  if (entry === undefined) {
    throw new PricingResolutionError("catalog-unavailable", input.gateway);
  }
  return toResolution(adapter, entry);
}

export { PricingResolutionError, resolvePricing };
export type { PriceResolution, PriceResolver, PriceResolverInput, PriceSource, PricingErrorReason };
