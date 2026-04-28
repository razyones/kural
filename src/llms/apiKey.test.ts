import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { resolveGatewayApiKey, resolveLLMApiKey } from "./apiKey.ts";
import type { CatalogEntry } from "./gateways/http.ts";
import type { GatewayAdapter } from "./gateways/registry.ts";

const OVERRIDE_ENV = "MY_CUSTOM_KEY";
const OVERRIDE_VALUE = "sk-override";
const ADAPTER_ENV = "ADAPTER_DEFAULT";
const ADAPTER_VALUE = "sk-adapter";
const FALLBACK_ENV = "AI_GATEWAY_API_KEY";
const FALLBACK_VALUE = "sk-fallback";
const VERCEL_KEY_ENV = "VERCEL_KEY";

async function stubFetchCatalog(): Promise<CatalogEntry | undefined> {
  await Promise.resolve();
  return undefined;
}

function makeAdapter(defaultApiKeyEnv: string | undefined): GatewayAdapter {
  return {
    id: "fake",
    defaultApiKeyEnv,
    kind: "live",
    catalogRequiresAuth: false,
    fetchCatalog: stubFetchCatalog,
  };
}

function clearAllEnv(): void {
  vi.stubEnv(OVERRIDE_ENV, "");
  vi.stubEnv(ADAPTER_ENV, "");
  vi.stubEnv(FALLBACK_ENV, "");
  vi.stubEnv(VERCEL_KEY_ENV, "");
}

describe("resolveGatewayApiKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers the per-gateway apiKeyEnv override over the adapter default", () => {
    clearAllEnv();
    vi.stubEnv(OVERRIDE_ENV, OVERRIDE_VALUE);
    vi.stubEnv(ADAPTER_ENV, ADAPTER_VALUE);
    const resolved = resolveGatewayApiKey(makeAdapter(ADAPTER_ENV), {
      fake: { apiKeyEnv: OVERRIDE_ENV },
    });
    expect(resolved.envName).toBe(OVERRIDE_ENV);
    expect(resolved.apiKey).toBe(OVERRIDE_VALUE);
  });

  it("falls through to the adapter default when no override is set", () => {
    clearAllEnv();
    vi.stubEnv(ADAPTER_ENV, ADAPTER_VALUE);
    const resolved = resolveGatewayApiKey(makeAdapter(ADAPTER_ENV));
    expect(resolved.envName).toBe(ADAPTER_ENV);
    expect(resolved.apiKey).toBe(ADAPTER_VALUE);
  });

  it("returns undefined envName when the adapter declares no default and no override exists", () => {
    clearAllEnv();
    const noDefault: string | undefined = undefined;
    const resolved = resolveGatewayApiKey(makeAdapter(noDefault));
    expect(resolved.envName).toBeUndefined();
    expect(resolved.apiKey).toBeUndefined();
  });

  it("treats an empty env value as unset", () => {
    clearAllEnv();
    const resolved = resolveGatewayApiKey(makeAdapter(ADAPTER_ENV));
    expect(resolved.envName).toBe(ADAPTER_ENV);
    expect(resolved.apiKey).toBeUndefined();
  });
});

describe("resolveLLMApiKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("dispatches through the gateway registry when an adapter is registered", () => {
    clearAllEnv();
    vi.stubEnv(FALLBACK_ENV, FALLBACK_VALUE);
    const resolved = resolveLLMApiKey("vercel");
    expect(resolved.envName).toBe(FALLBACK_ENV);
    expect(resolved.apiKey).toBe(FALLBACK_VALUE);
  });

  it("applies a per-gateway override for a registered adapter", () => {
    clearAllEnv();
    vi.stubEnv(VERCEL_KEY_ENV, OVERRIDE_VALUE);
    const resolved = resolveLLMApiKey("vercel", { vercel: { apiKeyEnv: VERCEL_KEY_ENV } });
    expect(resolved.envName).toBe(VERCEL_KEY_ENV);
    expect(resolved.apiKey).toBe(OVERRIDE_VALUE);
  });

  it("uses AI_GATEWAY_API_KEY as the universal fallback for unregistered gateways", () => {
    clearAllEnv();
    vi.stubEnv(FALLBACK_ENV, FALLBACK_VALUE);
    const resolved = resolveLLMApiKey("openai");
    expect(resolved.envName).toBe(FALLBACK_ENV);
    expect(resolved.apiKey).toBe(FALLBACK_VALUE);
  });

  it("lets the per-gateway override win for unregistered gateways too", () => {
    clearAllEnv();
    vi.stubEnv(OVERRIDE_ENV, OVERRIDE_VALUE);
    const resolved = resolveLLMApiKey("openai", { openai: { apiKeyEnv: OVERRIDE_ENV } });
    expect(resolved.envName).toBe(OVERRIDE_ENV);
    expect(resolved.apiKey).toBe(OVERRIDE_VALUE);
  });
});
