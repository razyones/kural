/**
 * Enforces semantics for one user-supplied config block — checks
 * required and allowed values and narrows optional string fields. It
 * is the only file split off from the top-level config validator so
 * this block's rules don't bloat the parent — a sibling extension to
 * the audits and brief block validators.
 */

import { isRecord } from "../../utils/record.ts";
import { listGateways } from "../../llms/gateways/registry.ts";

type Bag = Record<string, unknown>;

const LLM_OPTIONAL_STRING_KEYS = ["model", "baseURL", "apiKey"] as const;

/**
 * Validates the llm block — gateway must be a recognized id; optional
 * fields must be strings when present. Returns false to signal the
 * whole llm block should be stripped (bad gateway means no usable
 * config).
 * @param llm - Mutable llm config bag
 * @param warnings - Accumulator for human-readable warnings
 * @returns True when the gateway id is valid; false to strip the llm block
 * @kuralPure
 * @kuralHelper
 */
function validateLLM(llm: Bag, warnings: string[]): boolean {
  const validGateways = listGateways();
  if (typeof llm.gateway !== "string") {
    if ("gateway" in llm) {
      warnings.push(`llm.gateway must be one of ${validGateways.join(", ")} — ignoring llm`);
    } else {
      warnings.push("llm.gateway is required — ignoring llm");
    }
    return false;
  }
  if (!validGateways.includes(llm.gateway)) {
    warnings.push(`llm.gateway must be one of ${validGateways.join(", ")} — ignoring llm`);
    return false;
  }
  for (const key of LLM_OPTIONAL_STRING_KEYS) {
    if (key in llm && typeof llm[key] !== "string") {
      warnings.push(`llm.${key} must be a string — removing field`);
      Reflect.deleteProperty(llm, key);
    }
  }
  return true;
}

/**
 * Branches on the llm block being a record vs a stray non-object value —
 * applies validateLLM when it is, warns and strips it when it isn't.
 * @param config - Mutable top-level config bag
 * @param warnings - Accumulator for human-readable warnings
 * @kuralPure
 */
function validateLLMBlock(config: Bag, warnings: string[]): void {
  if (isRecord(config.llm)) {
    const sanitized = { ...config.llm };
    if (validateLLM(sanitized, warnings)) {
      config.llm = sanitized;
    } else {
      delete config.llm;
    }
  } else if ("llm" in config) {
    warnings.push("llm must be an object with gateway, model, baseURL, apiKey — ignoring");
    delete config.llm;
  }
}

export { validateLLMBlock };
