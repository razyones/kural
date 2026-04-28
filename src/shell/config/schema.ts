/**
 * Defines the top-level application configuration shape — the single
 * aggregate type that joins audit tuning, embedding gateway, LLM
 * gateway, domain keywords, and dictionary settings into one root.
 * It is the only module that owns this aggregate; no other module
 * defines the combined configuration shape.
 */

import type { EmbeddingsConfig, LLMConfig } from "./models.ts";
import type { AuditsConfig } from "./audits.ts";
import type { BriefCaps } from "../../analysis/brief/types.ts";
import type { GatewayOverride } from "../../llms/apiKey.ts";

/** Top-level application configuration — joins audit, embedding, LLM, keyword, and dictionary settings. */
type KuralConfig = {
  /** Embedding gateway and model settings */
  embeddings: EmbeddingsConfig;
  /** LLM gateway settings for translation (used with --llm-organize / --llm-query) */
  llm?: LLMConfig;
  /** Per-id env-var overrides applied to both embeddings and llm — keyed by gateway id. */
  gateways?: Record<string, GatewayOverride>;
  /** Domain keywords for path signal context (top 3 auto-selected) */
  domainKeywords: string[];
  /** Codebase-specific term definitions for prose signature enrichment */
  dictionary: Record<string, string>;
  /** Structural audit tuning parameters */
  audits: AuditsConfig;
  /** Per-section caps for the brief command's facet index — any omitted field uses the built-in default. */
  brief?: Partial<BriefCaps>;
};

export type { KuralConfig };
