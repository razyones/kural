/**
 * Declares the gateway-adapter contract every per-gateway module must
 * satisfy and indexes the registered adapters by their gateway id so
 * dispatchers can look up by id without naming a single gateway.
 * Adding a new gateway is a single import + entry here; no other module
 * gets touched. It is the only module that defines what an adapter
 * looks like and that enumerates the set of supported gateways at
 * runtime.
 * @kuralBound inward
 */

import type { CatalogEntry } from "./http.ts";
import { ollama } from "./ollama.ts";
import { openrouter } from "./openrouter.ts";
import { vercel } from "./vercel.ts";

/**
 * Discriminates live gateways (network catalog) from local ones (no billing).
 * Pricing dispatch maps this to the user-facing source label, and the
 * embedding client uses it to allow a placeholder API key for local gateways.
 */
type GatewayKind = "live" | "local";

/** Canonical input shape every adapter's catalog fetch receives — gateway id, base URL, and resolved model id. */
type CatalogFetchParams = {
  gateway: string;
  baseURL: string;
  modelId: string;
};

/**
 * Contract every gateway adapter implements — one module per gateway
 * declares its id, base URL, default API-key env var (or undefined for
 * local gateways), default embedding model, kind, and the single fetch
 * that returns a normalized CatalogEntry. A network failure returns
 * undefined so the pricing dispatcher raises catalog-unavailable; only
 * user-input problems (unknown model id) throw.
 */
type GatewayAdapter = {
  /** Stable gateway id the config and CLI use. */
  readonly id: string;
  /** Default base URL for this gateway. */
  readonly baseURL: string;
  /** Default embedding model id for this gateway — overridden by user config. */
  readonly defaultEmbeddingModel: string;
  /** Env var this gateway reads by default; undefined when no auth exists (local). */
  readonly defaultApiKeyEnv: string | undefined;
  /** "live" = fetchCatalog calls the network; "local" = static data with no billing. */
  readonly kind: GatewayKind;
  /**
   * Resolves this gateway's catalog entry for one model. Returns undefined
   * when a transient network/HTTP error makes the catalog unavailable or
   * the matched record is missing its pricing sub-record.
   */
  readonly fetchCatalog: (
    params: CatalogFetchParams,
    apiKey?: string,
  ) => Promise<CatalogEntry | undefined>;
};

/** Gateway adapters keyed by their gateway id. */
const GATEWAYS: Record<string, GatewayAdapter> = {
  [vercel.id]: vercel,
  [openrouter.id]: openrouter,
  [ollama.id]: ollama,
};

const GATEWAY_IDS: readonly string[] = Object.freeze(Object.keys(GATEWAYS));

/**
 * Looks up a gateway adapter by its id.
 * @param gateway - Gateway id from resolved config
 * @returns Gateway adapter when registered, otherwise undefined
 * @kuralPure
 */
function findGateway(gateway: string): GatewayAdapter | undefined {
  return GATEWAYS[gateway];
}

/**
 * Lists every registered gateway id — the canonical whitelist callers
 * validate user config against.
 * @returns Frozen array of registered gateway ids
 * @kuralPure
 */
function listGateways(): readonly string[] {
  return GATEWAY_IDS;
}

export { GATEWAYS, findGateway, listGateways };
export type { CatalogFetchParams, GatewayAdapter, GatewayKind };
