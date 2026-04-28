import { FREE_PRICES, ollama } from "./ollama.ts";
import { describe, expect, it } from "vite-plus/test";

const OLLAMA_BASE = "http://localhost:11434/v1";
const NONE = 0;

describe("ollama adapter", () => {
  it("declares no default api key env and uses local kind", () => {
    expect(ollama.defaultApiKeyEnv).toBeUndefined();
    expect(ollama.kind).toBe("local");
  });

  it("returns the static free-price catalog entry with no throughput", async () => {
    const entry = await ollama.fetchCatalog({
      gateway: "ollama",
      baseURL: OLLAMA_BASE,
      modelId: "llama3",
    });
    expect(entry?.price).toBe(FREE_PRICES);
    expect(entry?.price.input).toBe(NONE);
    expect(entry?.throughput).toBeUndefined();
  });
});
