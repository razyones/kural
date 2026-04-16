/**
 * Defines the top-level application configuration shape — the single
 * aggregate type that joins audit tuning, embedding provider, LLM
 * provider, domain keywords, and dictionary settings into one root.
 * It is the only module that owns this aggregate; no other module
 * defines the combined configuration shape.
 */

import type { AuditsConfig } from "./audits.ts";
import type { EmbeddingsConfig } from "./embeddings.ts";
import type { LLMConfig } from "./llm.ts";

/** Top-level application configuration — joins audit, embedding, LLM, keyword, and dictionary settings. */
type KuralConfig = {
  /** Embedding provider and model settings */
  embeddings: EmbeddingsConfig;
  /** LLM provider settings for translation (used with --llm-organize / --llm-query) */
  llm?: LLMConfig;
  /** Domain keywords for path signal context (top 3 auto-selected) */
  domainKeywords: string[];
  /** Codebase-specific term definitions for prose signature enrichment */
  dictionary: Record<string, string>;
  /** Structural audit tuning parameters */
  audits: AuditsConfig;
};

export type { KuralConfig };
