/**
 * Turns a gateway's reported token usage into a billable USD number
 * under a resolved per-million price table. It is the only module that
 * multiplies realized usage against prices — no other component converts
 * usage counts into dollars.
 */

import { PER_MILLION } from "./gateways/http.ts";
import type { PricePerMillionTokens } from "./gateways/http.ts";

const NONE = 0;

/** Token usage shape returned by an OpenAI-compatible chat-completions response. */
type ChatUsageCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
};

/**
 * Measures the USD cost of one LLM call from the usage counts the gateway
 * returned, under a caller-supplied price table. Subtracts cache counts
 * from the variable-input line so a cache read is never double-billed.
 * @param usage - Token usage reported by the chat-completions response
 * @param price - Price table for the resolved model
 * @returns USD cost attributable to this single call
 * @kuralPure
 */
function priceFromUsage(usage: ChatUsageCounts, price: PricePerMillionTokens): number {
  const variable = usage.inputTokens - usage.cacheReadTokens - usage.cacheCreateTokens;
  const variableClamped = Math.max(NONE, variable);
  return (
    (variableClamped * price.input +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheCreateTokens * price.cacheWrite +
      usage.outputTokens * price.output) /
    PER_MILLION
  );
}

export { priceFromUsage };
export type { ChatUsageCounts };
