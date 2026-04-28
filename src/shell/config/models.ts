/**
 * Declares the shape of the two model-selection blocks a user supplies
 * in kural.config.json — one configuring the embedding tool, one
 * configuring the llm tool. It is the only module that owns these
 * shapes; no other module defines their fields.
 */

/** Embedding gateway and model configuration. @kuralPatterns gatewayConfig */
type EmbeddingsConfig = {
  /** Gateway id (e.g. "openrouter", "openai", "vercel", "ollama") */
  gateway: string;
  /** Model ID override (uses gateway default if omitted) */
  model?: string;
  /** Base URL override (uses gateway default if omitted) */
  baseURL?: string;
  /** API key for the gateway */
  apiKey?: string;
};

/** User-supplied llm settings block read from kural.config.json. @kuralPatterns gatewayConfig */
type LLMConfig = {
  /** Selected id (e.g. "vercel", "openrouter", "openai", "ollama") */
  gateway: string;
  /** Model id override (uses the resolver's default if omitted) */
  model?: string;
  /** Base URL override (uses the resolver's default if omitted) */
  baseURL?: string;
  /** Inline API key override (otherwise read from the env var) */
  apiKey?: string;
};

export type { EmbeddingsConfig, LLMConfig };
