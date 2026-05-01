/**
 * Declares the user-supplied gateway+model selection block read from
 * kural.config.json — one shape that fits both the embedding and text
 * blocks since they configure the same four fields against the same
 * gateway registry. It is the only module that owns this aggregate
 * shape; no other module redeclares its fields.
 */

/** User-supplied gateway+model selection. @kuralPatterns gatewayConfig */
type GatewayConfig = {
  /** Gateway id (e.g. "vercel", "openrouter", "ollama") */
  gateway: string;
  /** Model id override (uses the gateway's default if omitted) */
  model?: string;
  /** Base URL override (uses the gateway's default if omitted) */
  baseURL?: string;
  /** API key for the gateway (otherwise read from the env var) */
  apiKey?: string;
};

export type { GatewayConfig };
