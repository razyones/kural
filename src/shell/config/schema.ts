/**
 * The assembler. Aggregates every configuration domain into the single
 * top-level shape the system reads at startup. It is the only module that
 * composes individual setting groups into a unified contract — no other
 * module defines the root configuration type.
 */

import type { AuditsConfig } from "./audits.ts";
import type { EmbeddingsConfig } from "./embeddings.ts";
import type { LLMConfig } from "./llm.ts";

/** Top-level application configuration. */
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
