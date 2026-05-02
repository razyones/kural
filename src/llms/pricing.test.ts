import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { FREE_PRICES } from "./gateways/ollama.ts";
import { ModelNotFoundError } from "./gateways/http.ts";
import { jsonResponse } from "../../tests/helpers/http.ts";
import { resolvePricing } from "./pricing.ts";

const VERCEL_BASE = "https://ai-gateway.vercel.sh/v1";
const MINIMAX_INPUT = 0.3;
const NONE = 0;

describe("resolvePricing", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("short-circuits ollama through the local adapter without a network call", async () => {
    const result = await resolvePricing({
      gateway: "ollama",
      baseURL: "http://localhost:11434/v1",
      modelId: "qwen3",
    });
    expect(result.price).toEqual(FREE_PRICES);
    expect(result.source).toBe("local");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws PricingResolutionError(unknown-gateway) when no adapter is registered", async () => {
    await expect(
      resolvePricing({
        gateway: "anthropic",
        baseURL: "https://api.anthropic.com/v1",
        modelId: "claude-sonnet-4-7",
      }),
    ).rejects.toMatchObject({
      name: "PricingResolutionError",
      reason: "unknown-gateway",
      gateway: "anthropic",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses live catalog prices when the gateway returns a matching entry", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "minimax/minimax-m2.7",
            pricing: {
              input: "0.0000003",
              output: "0.0000012",
              input_cache_read: "0.00000006",
              input_cache_write: "0.000000375",
            },
          },
        ],
      }),
    );
    const result = await resolvePricing({
      gateway: "vercel",
      baseURL: VERCEL_BASE,
      modelId: "minimax/minimax-m2.7",
    });
    expect(result.source).toBe("live");
    expect(result.price.input).toBeCloseTo(MINIMAX_INPUT);
  });

  it("throws PricingResolutionError(catalog-unavailable) when the catalog fetch fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(
      resolvePricing({
        gateway: "vercel",
        baseURL: VERCEL_BASE,
        modelId: "anthropic/claude-sonnet-4-5",
      }),
    ).rejects.toMatchObject({
      name: "PricingResolutionError",
      reason: "catalog-unavailable",
      gateway: "vercel",
    });
  });

  it("propagates ModelNotFoundError so missing ids fail fast", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: "other/x", pricing: {} }] }));
    await expect(
      resolvePricing({
        gateway: "vercel",
        baseURL: VERCEL_BASE,
        modelId: "missing/model",
      }),
    ).rejects.toBeInstanceOf(ModelNotFoundError);
  });

  it("returns zero-usage prices for ollama regardless of base url", async () => {
    const result = await resolvePricing({
      gateway: "ollama",
      baseURL: "",
      modelId: "llama3",
    });
    expect(result.price.input).toBe(NONE);
    expect(result.price.output).toBe(NONE);
  });
});
