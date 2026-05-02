/**
 * Implements the Ollama adapter — holds a hardcoded zero-rate price table,
 * the single CatalogEntry built on top of it, and a fetchCatalog that hands
 * that entry back without any HTTP request or API key. It is the only
 * adapter that synthesizes its CatalogEntry from baked-in data instead of
 * a remote response, so local inference flows through the same registry
 * path as live adapters while skipping the network and costing nothing.
 */

import type { CatalogEntry, PricePerMillionTokens } from "./http.ts";
import type { GatewayAdapter } from "./registry.ts";

const OLLAMA_ID = "ollama";
const DEFAULT_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_EMBEDDING_MODEL = "qwen3-embedding:latest";
const FREE = 0;

/** Per-million USD rates pinned at zero across every billable line. */
const FREE_PRICES: PricePerMillionTokens = {
  input: FREE,
  output: FREE,
  cacheRead: FREE,
  cacheWrite: FREE,
};

/** Pre-built CatalogEntry the adapter hands back instead of a fetched one. */
const STATIC_ENTRY: CatalogEntry = { price: FREE_PRICES };

/**
 * Returns the pre-known free-price catalog entry. No network call occurs
 * and no API key is consulted.
 * @returns Canonical CatalogEntry with all-zero prices
 * @kuralPure
 */
async function fetchCatalog(): Promise<CatalogEntry> {
  await Promise.resolve();
  return STATIC_ENTRY;
}

/** Ollama adapter — registers under id "ollama" with kind "local" and a no-op fetchCatalog. */
const ollama: GatewayAdapter = {
  id: OLLAMA_ID,
  baseURL: DEFAULT_BASE_URL,
  defaultEmbeddingModel: DEFAULT_EMBEDDING_MODEL,
  defaultApiKeyEnv: undefined,
  kind: "local",
  fetchCatalog,
};

export { FREE_PRICES, ollama };
