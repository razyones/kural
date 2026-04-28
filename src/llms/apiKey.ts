/**
 * Owns the runtime knowledge of which gateway ids the system recognises
 * and how each one's API key is sourced — the whitelist callers validate
 * against, the per-id override shape, and the env-var resolver that
 * consults user overrides before adapter defaults and falls through to
 * a universal fallback when no adapter is registered.
 */

import type { GatewayAdapter } from "./gateways/registry.ts";
import { findGateway } from "./gateways/registry.ts";

/** Whitelisted gateway ids — registered adapters plus fall-through ids the resolver still handles. */
const LLM_GATEWAYS = ["openrouter", "openai", "vercel", "ollama"] as const;

/** Per-id overrides nested under the LLMConfig overrides map. */
type GatewayOverride = {
  /** Env var the resolver reads instead of the built-in default. */
  apiKeyEnv?: string;
};

/** Universal fallback env var read when no adapter is registered for a gateway. */
const FALLBACK_ENV_NAME = "AI_GATEWAY_API_KEY";

/** Resolved name + current value of the env var a gateway reads. */
type ResolvedApiKey = {
  /** Env var the gateway reads; undefined for local gateways with no auth. */
  envName: string | undefined;
  /** Current value of that env var; undefined when unset or empty. */
  apiKey: string | undefined;
};

/** Per-gateway env-var overrides keyed by gateway id. */
type GatewayOverrides = Record<string, GatewayOverride>;

/**
 * Reads the current value of an env var, normalizing "" to undefined so
 * callers don't have to distinguish empty strings.
 * @param envName - Env var name to read
 * @returns Value when set and non-empty, otherwise undefined
 * @kuralPure
 * @kuralHelper
 */
function readEnv(envName: string): string | undefined {
  const value = process.env[envName];
  return value !== undefined && value !== "" ? value : undefined;
}

/**
 * Resolves a registered gateway adapter's API key by consulting (in order)
 * the per-gateway apiKeyEnv override and the adapter's declared default,
 * then reading the current process env.
 * @param adapter - Gateway adapter declaring its default env var
 * @param overrides - Per-gateway overrides from the user's kural config
 * @returns Resolved env var name and its current value
 * @kuralPure
 */
function resolveGatewayApiKey(
  adapter: GatewayAdapter,
  overrides?: GatewayOverrides,
): ResolvedApiKey {
  const override = overrides?.[adapter.id]?.apiKeyEnv;
  const envName = override ?? adapter.defaultApiKeyEnv;
  if (envName === undefined) {
    return { envName: undefined, apiKey: undefined };
  }
  return { envName, apiKey: readEnv(envName) };
}

/**
 * Resolves an LLM gateway's API key for callers that don't necessarily
 * have a registered adapter — applies the adapter's default env var when
 * one exists, otherwise falls back to the universal AI_GATEWAY_API_KEY.
 * The per-gateway config override wins in both cases.
 * @param gateway - Resolved gateway id from LLM config
 * @param overrides - Per-gateway overrides from the user's kural config
 * @returns Resolved env var name and its current value
 * @kuralPure
 */
function resolveLLMApiKey(gateway: string, overrides?: GatewayOverrides): ResolvedApiKey {
  const adapter = findGateway(gateway);
  if (adapter !== undefined) {
    return resolveGatewayApiKey(adapter, overrides);
  }
  const override = overrides?.[gateway]?.apiKeyEnv;
  const envName = override ?? FALLBACK_ENV_NAME;
  return { envName, apiKey: readEnv(envName) };
}

export { LLM_GATEWAYS, resolveGatewayApiKey, resolveLLMApiKey };
export type { GatewayOverride, GatewayOverrides, ResolvedApiKey };
