/**
 * The gatekeeper. Checks parsed configuration values for semantic validity
 * beyond shape — rejecting negative sensitivities, out-of-range floors,
 * and warning on empty collections. It is the only module that enforces
 * configuration semantics — no other module decides what constitutes a
 * valid tuning parameter.
 */

const MIN_SENSITIVITY = 0;
const MIN_FLOOR = 0;
const MAX_FLOOR = 1;
const MIN_GROUP = 1;
const NONE = 0;

type Bag = Record<string, unknown>;

/**
 * Type guard that narrows an unknown value to a string-keyed record.
 * @param value - Value to narrow
 * @returns True when value is a plain object
 * @kuralPure
 * @kuralHelper
 */
function isRecord(value: unknown): value is Bag {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates audit tuning parameters for semantic correctness.
 * Strips fields that violate constraints so downstream defaults apply.
 * @param audits - Mutable audit config bag
 * @param warnings - Accumulator for human-readable warnings
 * @kuralHelper
 */
function validateAudits(audits: Bag, warnings: string[]): void {
  if (typeof audits.sensitivity === "number" && audits.sensitivity <= MIN_SENSITIVITY) {
    warnings.push(
      `audits.sensitivity must be positive (got ${String(audits.sensitivity)}) — using default`,
    );
    delete audits.sensitivity;
  }
  if (
    typeof audits.containmentFloor === "number" &&
    (audits.containmentFloor < MIN_FLOOR || audits.containmentFloor > MAX_FLOOR)
  ) {
    warnings.push(
      `audits.containmentFloor must be between 0 and 1 (got ${String(audits.containmentFloor)}) — using default`,
    );
    delete audits.containmentFloor;
  }
  if (
    typeof audits.minGroup === "number" &&
    (!Number.isInteger(audits.minGroup) || audits.minGroup < MIN_GROUP)
  ) {
    warnings.push(
      `audits.minGroup must be a positive integer (got ${String(audits.minGroup)}) — using default`,
    );
    delete audits.minGroup;
  }
  if ("disable" in audits && Array.isArray(audits.disable)) {
    audits.disable = audits.disable.filter((v): v is string => typeof v === "string");
  } else if ("disable" in audits) {
    warnings.push("audits.disable must be an array of strings — ignoring");
    delete audits.disable;
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

  return { config, warnings };
}

export { validateConfig };
