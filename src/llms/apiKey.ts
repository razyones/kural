/**
 * Resolves a gateway's API key by consulting (in order) the per-gateway
 * apiKeyEnv override from kural.config.json, then the adapter's
 * declared default env var, and finally reading the current process
 * env. It is the only module that owns this precedence — adapters
 * declare which env var they read, this resolver consults overrides
 * and reads the value.
 */

import type { GatewayAdapter } from "./gateways/registry.ts";

/** Per-id overrides nested under the GatewayConfig overrides map. */
type GatewayOverride = {
  /** Env var the resolver reads instead of the built-in default. */
  apiKeyEnv?: string;
};

/** Per-gateway env-var overrides keyed by gateway id. */
type GatewayOverrides = Record<string, GatewayOverride>;

/** Resolved name + current value of the env var a gateway reads. */
type ResolvedApiKey = {
  /** Env var the gateway reads; undefined for local gateways with no auth. */
  envName: string | undefined;
  /** Current value of that env var; undefined when unset or empty. */
  apiKey: string | undefined;
};

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
 * Resolves a gateway adapter's API key by consulting (in order) the
 * per-gateway apiKeyEnv override and the adapter's declared default,
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

export { resolveGatewayApiKey };
export type { GatewayOverride, GatewayOverrides, ResolvedApiKey };
