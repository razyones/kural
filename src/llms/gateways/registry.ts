/**
 * Declares the gateway-adapter contract every per-gateway module must
 * satisfy and indexes the registered adapters by their gateway id so the
 * pricing resolver can dispatch without naming a single gateway. Adding
 * a new gateway is a single import + entry here; no other module gets
 * touched. It is the only module that defines what an adapter looks
 * like and that enumerates the set of supported gateways at runtime.
 */

import type { CatalogEntry } from "./http.ts";
import { ollama } from "./ollama.ts";
import { openrouter } from "./openrouter.ts";
import { vercel } from "./vercel.ts";

/**
 * Discriminates live gateways (network catalog) from local ones (no billing).
 * The resolver maps this to the user-facing source label.
 */
type GatewayKind = "live" | "local";

/** Inputs an adapter's catalog fetch needs — gateway id, base URL, and resolved model id. */
type CatalogFetchParams = {
  gateway: string;
  baseURL: string;
  modelId: string;
};

/**
 * Contract every gateway adapter implements — one module per gateway
 * declares its id, its default API-key env var (or undefined for local
 * gateways), its kind, whether the catalog fetch itself needs auth,
 * and the single fetch that returns a normalized CatalogEntry. A
 * network failure returns undefined so the resolver can fall back;
 * only user-input problems (unknown model id) throw.
 */
type GatewayAdapter = {
  /** Stable gateway id the config and CLI use. */
  readonly id: string;
  /** Env var this gateway reads by default; undefined when no auth exists (local). */
  readonly defaultApiKeyEnv: string | undefined;
  /** "live" = fetchCatalog calls the network; "local" = static data with no billing. */
  readonly kind: GatewayKind;
  /** True when the catalog fetch itself needs an API key (some gateways gate stats). */
  readonly catalogRequiresAuth: boolean;
  /**
   * Resolves this gateway's catalog entry for one model. Returns undefined
   * when a transient network/HTTP error makes the catalog unavailable.
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

/**
 * Looks up a gateway adapter by its id.
 * @param gateway - Gateway id from resolved LLM config
 * @returns Gateway adapter when registered, otherwise undefined
 * @kuralPure
 */
function findGateway(gateway: string): GatewayAdapter | undefined {
  return GATEWAYS[gateway];
}

export { GATEWAYS, findGateway };
export type { CatalogFetchParams, GatewayAdapter, GatewayKind };
