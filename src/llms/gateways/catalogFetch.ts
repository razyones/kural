/**
 * Composes the OpenAI-style catalog flow every live adapter shares —
 * runs /models and /endpoints in parallel, locates the requested model,
 * adapts per-gateway pricing and throughput shapes through caller-supplied
 * spec callbacks, and assembles the canonical CatalogEntry. It is the
 * only module that owns this skeleton — per-gateway adapters declare
 * their pricing field map and endpoints-auth strategy and inherit the
 * fetch flow instead of repeating it.
 */

import type { CatalogEntry, CatalogFetchParams, PricePerMillionTokens } from "./http.ts";
import {
  ModelNotFoundError,
  adaptThroughput,
  buildCatalogEntry,
  fetchJson,
  findModelRecord,
  readFirstEndpoint,
} from "./http.ts";
import { isRecord } from "../../utils/record.ts";

const MODELS_PATH = "/models";
const ENDPOINTS_SUFFIX = "/endpoints";

/** "unauthed" always fetches /endpoints; "bearer-or-skip" requires an apiKey and skips when absent. */
type EndpointsAuth = "unauthed" | "bearer-or-skip";

/** Static per-adapter declarations an OpenAI-style catalog flow needs. */
type OpenAIStyleCatalogSpec = {
  /** Stable gateway id used in ModelNotFoundError messages. */
  gatewayId: string;
  /** Reads the gateway's pricing record into the canonical PricePerMillionTokens. */
  adaptPrice: (pricing: Record<string, unknown>) => PricePerMillionTokens;
  /** Endpoint field name wrapping p50 latency (e.g. "latency_last_1h"). */
  latencyKey: string;
  /** Endpoint field name wrapping p50 streaming rate (e.g. "throughput_last_1h"). */
  throughputKey: string;
  /** Auth strategy for the /endpoints call — unauthed always fetches; bearer-or-skip requires apiKey. */
  endpointsAuth: EndpointsAuth;
  /** Reads an authoritative reasoning flag from the model record; gateways without a signal pass nothing. */
  extractReasoning?: (modelRecord: Record<string, unknown>) => boolean | undefined;
};

/**
 * Resolves the /endpoints body for a spec's auth strategy. Returns
 * undefined when the call is skipped or transiently unavailable.
 * @param params - Gateway, base URL, and resolved model id
 * @param apiKey - Bearer key, consulted only by the bearer-or-skip strategy
 * @param auth - Strategy declared by the adapter spec
 * @returns Parsed JSON body, or undefined when skipped or unavailable
 * @kuralCauses fetches /v1/models/{id}/endpoints over the network when the strategy permits
 * @kuralHelper
 */
async function fetchEndpointsBody(
  params: CatalogFetchParams,
  apiKey: string | undefined,
  auth: EndpointsAuth,
): Promise<unknown> {
  if (auth === "bearer-or-skip" && apiKey === undefined) {
    return undefined;
  }
  const url = `${params.baseURL}${MODELS_PATH}/${params.modelId}${ENDPOINTS_SUFFIX}`;
  const init =
    auth === "bearer-or-skip" ? { headers: { Authorization: `Bearer ${apiKey}` } } : undefined;
  const body = await fetchJson(url, init);
  return body;
}

/**
 * Runs the OpenAI-style catalog flow for one adapter spec. Throws
 * ModelNotFoundError when the catalog is reachable but the id isn't
 * listed; returns undefined for transient /models failure or missing
 * pricing sub-record.
 * @param spec - Per-adapter declarations (pricing/throughput field map, auth strategy, optional reasoning extractor)
 * @param params - Gateway, base URL, and resolved model id
 * @param apiKey - Bearer key, consulted only by the bearer-or-skip strategy
 * @returns Canonical CatalogEntry, or undefined when unavailable
 * @kuralCauses fetches /v1/models and /v1/models/{id}/endpoints over the network
 */
async function fetchOpenAIStyleCatalog(
  spec: OpenAIStyleCatalogSpec,
  params: CatalogFetchParams,
  apiKey?: string,
): Promise<CatalogEntry | undefined> {
  const [pricingBody, endpointsBody] = await Promise.all([
    fetchJson(`${params.baseURL}${MODELS_PATH}`),
    fetchEndpointsBody(params, apiKey, spec.endpointsAuth),
  ]);
  if (pricingBody === undefined) {
    return undefined;
  }
  const modelRecord = findModelRecord(pricingBody, params.modelId);
  if (modelRecord === undefined) {
    throw new ModelNotFoundError(spec.gatewayId, params.modelId);
  }
  const { pricing } = modelRecord;
  if (!isRecord(pricing)) {
    return undefined;
  }
  const price = spec.adaptPrice(pricing);
  const isReasoning = spec.extractReasoning?.(modelRecord);
  const firstEndpoint = endpointsBody === undefined ? undefined : readFirstEndpoint(endpointsBody);
  const throughput =
    firstEndpoint === undefined
      ? undefined
      : adaptThroughput(firstEndpoint, spec.latencyKey, spec.throughputKey);
  return buildCatalogEntry(price, throughput, isReasoning);
}

export { fetchOpenAIStyleCatalog };
export type { OpenAIStyleCatalogSpec };
