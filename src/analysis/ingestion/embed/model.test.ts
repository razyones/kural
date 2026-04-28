import { createEmbeddingModel, embedSignatures } from "./model.ts";
import { describe, expect, it, vi } from "vite-plus/test";

const NONE = 0;
const ARRAY_SECOND = 1;
const ARRAY_THIRD = 2;
const PAIR = 2;
const TRIPLE = 3;
const FIVE = 5;

/** A test embed function that returns [string.length] for each input. */
async function testEmbed(values: string[]): Promise<number[][]> {
  const result: number[][] = await new Promise((resolve) => {
    resolve(values.map((v) => [v.length]));
  });
  return result;
}

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
      gateway: "openai",
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
});

describe("createEmbeddingModel config options", () => {
  it("omits baseURL when empty string", () => {
    const { modelId } = createEmbeddingModel({ gateway: "openai", baseURL: "", apiKey: "test" });
    expect(modelId).toBe("text-embedding-3-small");
  });

  it("omits apiKey when empty string", () => {
    const { modelId } = createEmbeddingModel({ gateway: "openai", apiKey: "" });
    expect(modelId).toBe("text-embedding-3-small");
  });

  it("uses custom baseURL when provided", () => {
    const { modelId } = createEmbeddingModel({
      gateway: "openai",
      baseURL: "https://custom.api.example.com/v1",
      apiKey: "test",
    });
    expect(modelId).toBe("text-embedding-3-small");
  });

  it("returns an embed function", () => {
    const { embed } = createEmbeddingModel({ gateway: "openai", apiKey: "test" });
    expect(typeof embed).toBe("function");
  });
});

describe("embedSignatures empty input", () => {
  it("returns empty array and skips embed call", async () => {
    const spy = vi.fn(testEmbed);
    const result = await embedSignatures([], spy);
    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns empty vectors when all strings are empty", async () => {
    const spy = vi.fn(testEmbed);
    const result = await embedSignatures(["", "", ""], spy);

    expect(result).toHaveLength(TRIPLE);
    expect(result[NONE]).toEqual([]);
    expect(result[ARRAY_SECOND]).toEqual([]);
    expect(result[ARRAY_THIRD]).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("embedSignatures execution", () => {
  it("returns embeddings in input order", async () => {
    const sigs = ["ab", "abcdef"];
    const result = await embedSignatures(sigs, testEmbed);

    expect(result).toHaveLength(sigs.length);
    const [first, second] = result;
    const [sigA, sigB] = sigs;
    expect(first).toEqual([sigA.length]);
    expect(second).toEqual([sigB.length]);
  });

  it("splits into batches by batchSize", async () => {
    const batchSize = 2;
    const sigs = ["a", "b", "c"];
    const spy = vi.fn(testEmbed);

    await embedSignatures(sigs, spy, { batchSize });

    const expectedCalls = Math.ceil(sigs.length / batchSize);
    expect(spy).toHaveBeenCalledTimes(expectedCalls);
  });

  it("calls onProgress callback", async () => {
    const onProgress = vi.fn<(completed: number, total: number) => void>();
    const sigs = ["hello", "world"];

    await embedSignatures(sigs, testEmbed, { onProgress });

    expect(onProgress).toHaveBeenCalledWith(sigs.length, sigs.length);
  });

  it("preserves positions when some strings are empty", async () => {
    const sigs = ["hello", "", "world"];
    const result = await embedSignatures(sigs, testEmbed);

    expect(result).toHaveLength(TRIPLE);
    expect(result[NONE]).toEqual([FIVE]);
    expect(result[ARRAY_SECOND]).toEqual([]);
    expect(result[ARRAY_THIRD]).toEqual([FIVE]);
  });
});

describe("embedSignatures concurrency", () => {
  it("handles concurrency limiting with small concurrency", async () => {
    const batchSize = 1;
    const concurrency = 2;
    const sigs = ["a", "b", "c", "d", "e"];
    const spy = vi.fn(testEmbed);

    const result = await embedSignatures(sigs, spy, { batchSize, concurrency });

    expect(result).toHaveLength(FIVE);
    expect(spy).toHaveBeenCalledTimes(FIVE);
    for (let i = NONE; i < sigs.length; i++) {
      expect(result[i]).toEqual([sigs[i].length]);
    }
  });

  it("awaits when pending count reaches concurrency limit", async () => {
    const batchSize = 1;
    const concurrency = 1;
    const sigs = ["ab", "cd", "ef"];
    const callOrder: number[] = [];
    let callCount = NONE;

    const trackedEmbed = async (values: string[]): Promise<number[][]> => {
      const idx = callCount++;
      callOrder.push(idx);
      const result = await Promise.resolve(values.map((v) => [v.length]));
      return result;
    };

    const result = await embedSignatures(sigs, trackedEmbed, { batchSize, concurrency });

    expect(result).toHaveLength(TRIPLE);
    expect(callOrder).toHaveLength(TRIPLE);
    expect(result[NONE]).toEqual([PAIR]);
    expect(result[ARRAY_SECOND]).toEqual([PAIR]);
    expect(result[ARRAY_THIRD]).toEqual([PAIR]);
  });

  it("calls onProgress incrementally across batches", async () => {
    const batchSize = 2;
    const onProgress = vi.fn<(completed: number, total: number) => void>();
    const sigs = ["a", "b", "c"];

    await embedSignatures(sigs, testEmbed, { batchSize, onProgress });

    expect(onProgress).toHaveBeenCalledTimes(PAIR);
    expect(onProgress).toHaveBeenCalledWith(PAIR, TRIPLE);
    expect(onProgress).toHaveBeenCalledWith(TRIPLE, TRIPLE);
  });
});
