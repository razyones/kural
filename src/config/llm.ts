/**
 * The voice. Defines the shape of LLM provider settings — which service
 * to call for text generation tasks like translation. It is the only
 * module that owns LLM connection configuration — no other module
 * defines how the system connects to a generative language model.
 */

/** LLM provider and model configuration. */
type LLMConfig = {
  /** Provider name (e.g. "google", "openrouter", "openai", "ollama") */
  provider: string;
  /** Model ID override (uses provider default if omitted) */
  model?: string;
  /** Base URL override (uses provider default if omitted) */
  baseURL?: string;
  /** API key for the provider */
  apiKey?: string;
};

export type { LLMConfig };
