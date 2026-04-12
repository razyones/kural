/**
 * Reads raw audit command flags as strings and converts
 * each into a typed number, falling back to the caller's baseline when
 * a flag is absent or unparseable. It is the only module that performs
 * string-to-number argument translation for the audit command — no
 * other module parses these terminal inputs or splits the
 * comma-separated disable flag into a name set.
 */

import type { AuditsConfig } from "../../config/audits.ts";

const NONE = 0;
const DEFAULT_SENSITIVITY = 2.0;

/**
 * Parses a CLI string to a number, returning the fallback when the input is absent or not a number.
 * @param input - Raw CLI string value
 * @param fallback - Default value when input is missing or NaN
 * @param radix - Optional radix for integer parsing
 * @returns Parsed number or fallback
 * @kuralPure
 * @kuralHelper
 */
function parseOr(input: string | undefined, fallback: number, radix?: number): number {
  const parsed = radix === undefined ? parseFloat(input ?? "") : parseInt(input ?? "", radix);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Parses each CLI flag string to a number, falling back to the caller's
 * baseline when absent. Does not validate — callers clamp afterward.
 * @param values - Raw string values from CLI flags
 * @param baselines - Caller-provided numeric baselines
 * @returns Merged AuditsConfig with CLI values taking precedence
 * @kuralPure
 */
function parseFlags(
  values: { sensitivity?: string },
  baselines: Partial<AuditsConfig>,
): AuditsConfig {
  return {
    sensitivity: parseOr(values.sensitivity, baselines.sensitivity ?? DEFAULT_SENSITIVITY),
    disable: baselines.disable,
  };
}

/**
 * Parses all audit CLI flags and splits the disable list into a set.
 * @param values - Raw CLI string values for audit flags
 * @param baselines - Caller-provided numeric baselines
 * @returns Parsed AuditsConfig and computed disabled audit set
 * @kuralPure
 */
function parseAuditFlags(
  values: {
    sensitivity?: string;
    disable?: string;
  },
  baselines: Partial<AuditsConfig>,
): { config: AuditsConfig; disabledAudits: Set<string> } {
  const config = parseFlags(values, baselines);
  const cliDisabled = (values.disable ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > NONE);
  const configDisabled = config.disable ?? [];
  return { config, disabledAudits: new Set([...cliDisabled, ...configDisabled]) };
}

export { parseAuditFlags, parseFlags, parseOr };
