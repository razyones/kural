/**
 * Checks parsed configuration values for semantic validity
 * beyond shape — rejecting negative sensitivities, out-of-range floors,
 * and warning on empty collections. It is the only module that enforces
 * configuration semantics — no other module decides what constitutes a
 * valid tuning parameter.
 */

import type { AuditsConfig } from "./audits.ts";
import { isRecord } from "../../utils/record.ts";
import { validateLLMBlock } from "./validateLLM.ts";

const MIN_SENSITIVITY = 0;
const MIN_CAP = 0;
const NONE = 0;
const DEFAULT_SENSITIVITY = 2.0;

type Bag = Record<string, unknown>;

/**
 * Checks whether a sensitivity value is positive.
 * @param value - Sensitivity to check
 * @returns True when above the minimum threshold
 * @kuralPure
 * @kuralHelper
 */
function isValidSensitivity(value: number): boolean {
  return value > MIN_SENSITIVITY;
}

/**
 * Clamps resolved audit parameters to safe defaults when they violate
 * constraints. Returns warnings for each clamped field.
 * @param config - Resolved audit config with potentially invalid values
 * @returns Clamped config and human-readable warnings
 * @kuralPure
 * @kuralHelper
 */
function clampAudits(config: AuditsConfig): { config: AuditsConfig; warnings: string[] } {
  const warnings: string[] = [];
  let { sensitivity } = config;
  if (!isValidSensitivity(sensitivity)) {
    warnings.push(`sensitivity must be positive (got ${String(sensitivity)}) — using default`);
    sensitivity = DEFAULT_SENSITIVITY;
  }
  return { config: { ...config, sensitivity }, warnings };
}

/**
 * Validates audit tuning parameters for semantic correctness.
 * Strips fields that violate constraints so downstream defaults apply.
 * @param audits - Mutable audit config bag
 * @param warnings - Accumulator for human-readable warnings
 * @kuralPure
 * @kuralHelper
 */
function validateAudits(audits: Bag, warnings: string[]): void {
  if (typeof audits.sensitivity === "number" && !isValidSensitivity(audits.sensitivity)) {
    warnings.push(
      `audits.sensitivity must be positive (got ${String(audits.sensitivity)}) — using default`,
    );
    delete audits.sensitivity;
  }
  if ("disable" in audits && Array.isArray(audits.disable)) {
    const strings = audits.disable.filter((v): v is string => typeof v === "string");
    if (strings.length !== audits.disable.length) {
      warnings.push("audits.disable contains non-string items — they will be ignored");
    }
    audits.disable = strings;
  } else if ("disable" in audits) {
    warnings.push("audits.disable must be an array of strings — ignoring");
    delete audits.disable;
  }
}

const BRIEF_KEYS = [
  "siblings",
  "utilities",
  "symbols",
  "related",
  "ancestors",
  "patternMembers",
  "companionMembers",
] as const;

const GATEWAY_OVERRIDE_STRING_KEYS = ["apiKeyEnv"] as const;

/**
 * Validates the top-level gateways override map — each entry must be a
 * record whose apiKeyEnv (when present) is a string. Invalid entries
 * are stripped so adapters fall back to their declared defaults.
 * @param config - Mutable top-level config bag
 * @param warnings - Accumulator for human-readable warnings
 * @kuralPure
 * @kuralHelper
 */
function validateGateways(config: Bag, warnings: string[]): void {
  if (!("gateways" in config)) {
    return;
  }
  if (!isRecord(config.gateways)) {
    warnings.push("gateways must be an object keyed by gateway id — ignoring");
    delete config.gateways;
    return;
  }
  const result: Bag = {};
  for (const id of Object.keys(config.gateways)) {
    const override = config.gateways[id];
    if (!isRecord(override)) {
      warnings.push(`gateways.${id} must be an object — ignoring`);
      continue;
    }
    const sanitized: Bag = { ...override };
    for (const key of GATEWAY_OVERRIDE_STRING_KEYS) {
      if (key in sanitized && typeof sanitized[key] !== "string") {
        warnings.push(`gateways.${id}.${key} must be a string — ignoring`);
        Reflect.deleteProperty(sanitized, key);
      }
    }
    result[id] = sanitized;
  }
  config.gateways = result;
}

/**
 * Validates brief caps — each known field must be a non-negative
 * integer. Zero is accepted so consumers can disable a section.
 * Strips invalid or unknown fields so downstream defaults apply.
 * @param brief - Mutable brief config bag
 * @param warnings - Accumulator for human-readable warnings
 * @kuralPure
 * @kuralHelper
 */
function validateBrief(brief: Bag, warnings: string[]): void {
  const known = new Set<string>(BRIEF_KEYS);
  for (const key of Object.keys(brief)) {
    if (!known.has(key)) {
      warnings.push(`brief.${key} is not a recognized cap — ignoring`);
      Reflect.deleteProperty(brief, key);
      continue;
    }
    const value = brief[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < MIN_CAP) {
      warnings.push(`brief.${key} must be a non-negative integer — ignoring`);
      Reflect.deleteProperty(brief, key);
    }
  }
}

/**
 * Validates a parsed config object for semantic correctness. Strips fields
 * that violate constraints (so defaults apply downstream) and returns
 * human-readable warnings for the caller to surface.
 * @param raw - Untrusted parsed config from disk
 * @returns Sanitized config with invalid fields removed, plus warnings
 * @kuralPure
 */
function validateConfig(raw: unknown): { config: Bag; warnings: string[] } {
  if (!isRecord(raw)) {
    return { config: {}, warnings: ["config root is not a JSON object — using defaults"] };
  }
  const warnings: string[] = [];
  const config = { ...raw };

  if (isRecord(config.audits)) {
    const sanitized = { ...config.audits };
    validateAudits(sanitized, warnings);
    config.audits = sanitized;
  }

  if (isRecord(config.brief)) {
    const sanitized = { ...config.brief };
    validateBrief(sanitized, warnings);
    config.brief = sanitized;
  } else if ("brief" in config) {
    warnings.push("brief must be an object of non-negative integer caps — ignoring");
    delete config.brief;
  }

  if ("domainKeywords" in config && !Array.isArray(config.domainKeywords)) {
    warnings.push("domainKeywords must be an array of strings — ignoring");
    delete config.domainKeywords;
  } else if (Array.isArray(config.domainKeywords) && config.domainKeywords.length === NONE) {
    warnings.push("domainKeywords is empty — path signals will lack domain context");
  }

  if ("dictionary" in config && !isRecord(config.dictionary)) {
    warnings.push("dictionary must be an object mapping terms to definitions — ignoring");
    delete config.dictionary;
  } else if (isRecord(config.dictionary) && Object.keys(config.dictionary).length === NONE) {
    warnings.push("dictionary is empty — prose signatures will lack domain enrichment");
  }

  validateLLMBlock(config, warnings);
  validateGateways(config, warnings);

  return { config, warnings };
}

export { clampAudits, validateConfig };
