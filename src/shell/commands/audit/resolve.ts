/**
 * The negotiator. Parses raw CLI dial strings into numbers and layers
 * them over project defaults — delegating constraint enforcement to the
 * validation module. It is the only module that translates command-line
 * audit arguments into resolved detection parameters.
 */

import { isValidFloor, isValidMinGroup, isValidSensitivity } from "../../config/validate.ts";
import type { AuditsConfig } from "../../config/audits.ts";
import { loadProjectConfig } from "../../config/loader.ts";

const NONE = 0;
const DEFAULT_SENSITIVITY = 2.0;
const DEFAULT_CONTAINMENT_FLOOR = 0.9;
const DEFAULT_MIN_GROUP = 4;
const RADIX = 10;

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
 * Warns and falls back to a default when a resolved value fails its constraint.
 * @param name - Config field name for the warning message
 * @param value - The resolved numeric value to check
 * @param valid - Whether the value passes its semantic constraint
 * @param fallback - Default to return when invalid
 * @returns The value if valid, otherwise the fallback
 * @kuralPure
 * @kuralHelper
 */
function clampOrWarn(name: string, value: number, valid: boolean, fallback: number): number {
  if (valid) {
    return value;
  }
  console.error(`Warning: ${name} is invalid (got ${String(value)}) — using default`);
  return fallback;
}

/**
 * Resolves the final audit config by layering CLI overrides on top of the project's persisted tuning parameters.
 * @param values - Raw string values from CLI argument parsing
 * @param projectAudits - Partial audit config loaded from the project config file
 * @returns A fully resolved AuditsConfig with defaults applied
 * @kuralPure
 */
function resolveConfig(
  values: { sensitivity?: string; containmentFloor?: string; minGroup?: string },
  projectAudits: Partial<AuditsConfig>,
): AuditsConfig {
  const s = parseOr(values.sensitivity, projectAudits.sensitivity ?? DEFAULT_SENSITIVITY);
  const f = parseOr(
    values.containmentFloor,
    projectAudits.containmentFloor ?? DEFAULT_CONTAINMENT_FLOOR,
  );
  const g = parseOr(values.minGroup, projectAudits.minGroup ?? DEFAULT_MIN_GROUP, RADIX);
  return {
    sensitivity: clampOrWarn("sensitivity", s, isValidSensitivity(s), DEFAULT_SENSITIVITY),
    containmentFloor: clampOrWarn(
      "containmentFloor",
      f,
      isValidFloor(f),
      DEFAULT_CONTAINMENT_FLOOR,
    ),
    minGroup: clampOrWarn("minGroup", g, isValidMinGroup(g), DEFAULT_MIN_GROUP),
    disable: projectAudits.disable,
  };
}

/**
 * Loads the project config and resolves audit parameters from CLI values.
 * @param values - Raw CLI string values for audit tuning
 * @returns Resolved AuditsConfig, project config, and computed disabled audit set
 * @kuralCauses reads project config from disk
 */
function resolveAuditConfig(values: {
  sensitivity?: string;
  containmentFloor?: string;
  minGroup?: string;
  disable?: string;
}): { config: AuditsConfig; disabledAudits: Set<string> } {
  const projectConfig = loadProjectConfig();
  const config = resolveConfig(values, projectConfig.audits ?? {});
  const cliDisabled = (values.disable ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > NONE);
  const configDisabled = config.disable ?? [];
  return { config, disabledAudits: new Set([...cliDisabled, ...configDisabled]) };
}

export { clampOrWarn, parseOr, resolveAuditConfig, resolveConfig };
