/**
 * The connection. Defines the shape of embedding provider settings —
 * which service to call, which model to use, and how to authenticate.
 * It is the only module that owns provider configuration — no other
 * module defines how the system connects to an embedding API.
 */

/** Embedding provider and model configuration. @kuralPatterns providerConfig */
type EmbeddingsConfig = {
  /** Provider name (e.g. "openrouter", "openai", "vercel", "ollama") */
  provider: string;
  /** Model ID override (uses provider default if omitted) */
  model?: string;
  /** Base URL override (uses provider default if omitted) */
  baseURL?: string;
  /** API key for the provider */
  apiKey?: string;
};

export type { EmbeddingsConfig };
