import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { CatalogEntry } from "./gateways/http.ts";
import type { GatewayAdapter } from "./gateways/registry.ts";
import { resolveGatewayApiKey } from "./apiKey.ts";

const OVERRIDE_ENV = "MY_CUSTOM_KEY";
const OVERRIDE_VALUE = "sk-override";
const ADAPTER_ENV = "ADAPTER_DEFAULT";
const ADAPTER_VALUE = "sk-adapter";
const FALLBACK_ENV = "AI_GATEWAY_API_KEY";
const VERCEL_KEY_ENV = "VERCEL_KEY";

async function stubFetchCatalog(): Promise<CatalogEntry | undefined> {
  await Promise.resolve();
  return undefined;
}

function makeAdapter(defaultApiKeyEnv: string | undefined): GatewayAdapter {
  return {
    id: "fake",
    baseURL: "https://example.test/v1",
    defaultEmbeddingModel: "fake-embedding",
    defaultApiKeyEnv,
    kind: "live",
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
