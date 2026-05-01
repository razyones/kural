import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createEmbeddingModel } from "./embedding.ts";

const ENV_VALUE = "sk-from-env";
const OVERRIDE_ENV_VALUE = "sk-from-override";
const VERCEL_DEFAULT_ENV = "AI_GATEWAY_API_KEY";
const OPENROUTER_DEFAULT_ENV = "OPENROUTER_API_KEY";
const CUSTOM_OVERRIDE_ENV = "MY_CUSTOM_VERCEL_KEY";

describe("createEmbeddingModel gateways", () => {
  it("throws for unsupported gateway", () => {
    expect(() => createEmbeddingModel({ gateway: "unknown" })).toThrow(
      "Unsupported embedding gateway",
    );
  });

  it("returns default model id for known gateway", () => {
    const { modelId } = createEmbeddingModel({ gateway: "openrouter", apiKey: "test" });
    expect(modelId).toBe("google/gemini-embedding-001");
  });

  it("uses config model override", () => {
    const { modelId } = createEmbeddingModel({
      gateway: "vercel",
      model: "text-embedding-3-large",
      apiKey: "test",
    });
    expect(modelId).toBe("text-embedding-3-large");
  });

  it("uses ollama defaults without requiring apiKey", () => {
    const { modelId } = createEmbeddingModel({ gateway: "ollama" });
    expect(modelId).toBe("qwen3-embedding:latest");
  });

  it("returns default model id for vercel gateway", () => {
    const { modelId } = createEmbeddingModel({ gateway: "vercel", apiKey: "test" });
    expect(modelId).toBe("google/gemini-embedding-2");
  });

  it("rejects openai — it is a provider, not a gateway", () => {
    expect(() => createEmbeddingModel({ gateway: "openai", apiKey: "test" })).toThrow(
      "Unsupported embedding gateway",
    );
  });
});

describe("createEmbeddingModel config options", () => {
  it("omits baseURL when empty string", () => {
    const { modelId } = createEmbeddingModel({ gateway: "vercel", baseURL: "", apiKey: "test" });
    expect(modelId).toBe("google/gemini-embedding-2");
  });

  it("omits apiKey when empty string", () => {
    const { modelId } = createEmbeddingModel({ gateway: "vercel", apiKey: "" });
    expect(modelId).toBe("google/gemini-embedding-2");
  });

  it("uses custom baseURL when provided", () => {
    const { modelId } = createEmbeddingModel({
      gateway: "vercel",
      baseURL: "https://custom.api.example.com/v1",
      apiKey: "test",
    });
    expect(modelId).toBe("google/gemini-embedding-2");
  });

  it("returns an embed function", () => {
    const { embed } = createEmbeddingModel({ gateway: "vercel", apiKey: "test" });
    expect(typeof embed).toBe("function");
  });
});

describe("createEmbeddingModel api key resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when a live gateway has no inline key and no env var set", () => {
    vi.stubEnv(VERCEL_DEFAULT_ENV, "");
    expect(() => createEmbeddingModel({ gateway: "vercel" })).toThrow(/No API key/);
  });

  it("names the default env var in the no-key error message", () => {
    vi.stubEnv(OPENROUTER_DEFAULT_ENV, "");
    expect(() => createEmbeddingModel({ gateway: "openrouter" })).toThrow(OPENROUTER_DEFAULT_ENV);
  });

  it("falls through to the env var when no inline key is provided", () => {
    vi.stubEnv(VERCEL_DEFAULT_ENV, ENV_VALUE);
    const { modelId } = createEmbeddingModel({ gateway: "vercel" });
    expect(modelId).toBe("google/gemini-embedding-2");
  });

  it("honours the per-gateway apiKeyEnv override", () => {
    vi.stubEnv(VERCEL_DEFAULT_ENV, "");
    vi.stubEnv(CUSTOM_OVERRIDE_ENV, OVERRIDE_ENV_VALUE);
    const { modelId } = createEmbeddingModel(
      { gateway: "vercel" },
      { vercel: { apiKeyEnv: CUSTOM_OVERRIDE_ENV } },
    );
    expect(modelId).toBe("google/gemini-embedding-2");
  });
});
