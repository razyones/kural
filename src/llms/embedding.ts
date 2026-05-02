/**
 * Crosses the network to turn text into vectors via the AI SDK's
 * embedMany call — reads gateway defaults (baseURL + default model)
 * from the registry so per-gateway knowledge lives in exactly one
 * place. It is the only module that produces embeddings from a
 * configured gateway — no other component instantiates an embedding
 * client or calls the embedding API.
 */

import { findGateway, listGateways } from "./gateways/registry.ts";
import type { GatewayConfig } from "./config.ts";
import type { GatewayOverrides } from "./apiKey.ts";
import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { resolveGatewayApiKey } from "./apiKey.ts";

const DEFAULT_RETRIES = 2;
const LOCAL_GATEWAY_DUMMY_KEY = "local";

/** A function that embeds a single batch of strings into vectors. */
type RawEmbedFn = (values: string[]) => Promise<number[][]>;

/**
 * Picks the API key by precedence — explicit config override beats the
 * resolved env var, which beats the local sentinel for gateways that
 * don't authenticate at all.
 * @param config - Gateway config with optional inline apiKey
 * @param envKey - Env var value resolved by resolveGatewayApiKey
 * @param allowLocalSentinel - True for local gateways with no auth (kind === "local")
 * @returns The chosen apiKey, or undefined when nothing is available
 * @kuralPure
 * @kuralHelper
 */
function pickApiKey(
  config: GatewayConfig,
  envKey: string | undefined,
  allowLocalSentinel: boolean,
): string | undefined {
  if (config.apiKey !== undefined) {
    return config.apiKey;
  }
  if (envKey !== undefined) {
    return envKey;
  }
  return allowLocalSentinel ? LOCAL_GATEWAY_DUMMY_KEY : undefined;
}

/**
 * Creates a raw embed function and model ID from gateway configuration.
 * @param config - Gateway configuration with gateway id, optional model and API key
 * @param overrides - Optional per-id env-var overrides from kural.config.json
 * @returns An object with a batch embed function and the resolved model ID
 * @kuralCauses initializes a remote embedding connection from gateway config
 */
function createEmbeddingModel(
  config: GatewayConfig,
  overrides?: GatewayOverrides,
): {
  embed: RawEmbedFn;
  modelId: string;
} {
  const adapter = findGateway(config.gateway);
  if (adapter === undefined) {
    throw new Error(
      `Unsupported embedding gateway "${config.gateway}". Supported: ${listGateways().join(", ")}`,
    );
  }
  const modelId = config.model ?? adapter.defaultEmbeddingModel;
  const baseURL = config.baseURL ?? adapter.baseURL;
  const { envName, apiKey: envKey } = resolveGatewayApiKey(adapter, overrides);
  const apiKey = pickApiKey(config, envKey, adapter.kind === "local");

  if (apiKey === undefined) {
    throw new Error(
      `No API key for gateway "${config.gateway}". Set ${envName ?? "the gateway's env var"} or pass --api-key`,
    );
  }

  const client = createOpenAI({
    ...(baseURL === "" ? {} : { baseURL }),
    ...(apiKey === "" ? {} : { apiKey }),
  });
  const model = client.embedding(modelId);

  return {
    embed: async (values: string[]) => {
      try {
        const { embeddings } = await embedMany({
          model,
          values,
          maxRetries: DEFAULT_RETRIES,
        });
        return embeddings;
      } catch (err) {
        throw new Error(
          `Embedding API call failed (gateway: ${config.gateway}, model: ${modelId}): ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    },
    modelId,
  };
}

export { createEmbeddingModel };
export type { RawEmbedFn };
