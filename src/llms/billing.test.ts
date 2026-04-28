import { describe, expect, it } from "vite-plus/test";
import type { ChatUsageCounts } from "./billing.ts";
import type { PricePerMillionTokens } from "./gateways/http.ts";
import { priceFromUsage } from "./billing.ts";

const PRICE: PricePerMillionTokens = {
  input: 3,
  cacheRead: 0.3,
  cacheWrite: 6,
  output: 15,
};

const INPUT_TOKENS = 1000;
const CACHE_READ_TOKENS = 400;
const CACHE_WRITE_TOKENS = 200;
const OUTPUT_TOKENS = 500;
const PER_MILLION = 1_000_000;
const ZERO = 0;
const TINY_CACHE_READ = 10;
const TINY_CACHE_WRITE = 5;

describe("priceFromUsage", () => {
  it("sums variable input, cache read, cache write, and output at their respective rates", () => {
    const usage: ChatUsageCounts = {
      inputTokens: INPUT_TOKENS,
      outputTokens: OUTPUT_TOKENS,
      cacheReadTokens: CACHE_READ_TOKENS,
      cacheCreateTokens: CACHE_WRITE_TOKENS,
    };
    const variable = INPUT_TOKENS - CACHE_READ_TOKENS - CACHE_WRITE_TOKENS;
    const expected =
      (variable * PRICE.input +
        CACHE_READ_TOKENS * PRICE.cacheRead +
        CACHE_WRITE_TOKENS * PRICE.cacheWrite +
        OUTPUT_TOKENS * PRICE.output) /
      PER_MILLION;
    expect(priceFromUsage(usage, PRICE)).toBeCloseTo(expected);
  });

  it("clamps variable input to zero when cache counts exceed reported inputTokens", () => {
    const usage: ChatUsageCounts = {
      inputTokens: TINY_CACHE_READ,
      outputTokens: ZERO,
      cacheReadTokens: CACHE_READ_TOKENS,
      cacheCreateTokens: CACHE_WRITE_TOKENS,
    };
    const expected =
      (CACHE_READ_TOKENS * PRICE.cacheRead + CACHE_WRITE_TOKENS * PRICE.cacheWrite) / PER_MILLION;
    expect(priceFromUsage(usage, PRICE)).toBeCloseTo(expected);
  });

  it("returns zero when every counter is zero", () => {
    const usage: ChatUsageCounts = {
      inputTokens: ZERO,
      outputTokens: ZERO,
      cacheReadTokens: ZERO,
      cacheCreateTokens: ZERO,
    };
    expect(priceFromUsage(usage, PRICE)).toBe(ZERO);
  });

  it("does not double-bill cache reads as variable input", () => {
    const usage: ChatUsageCounts = {
      inputTokens: CACHE_READ_TOKENS + TINY_CACHE_WRITE,
      outputTokens: ZERO,
      cacheReadTokens: CACHE_READ_TOKENS,
      cacheCreateTokens: TINY_CACHE_WRITE,
    };
    const expected =
      (CACHE_READ_TOKENS * PRICE.cacheRead + TINY_CACHE_WRITE * PRICE.cacheWrite) / PER_MILLION;
    expect(priceFromUsage(usage, PRICE)).toBeCloseTo(expected);
  });
});
