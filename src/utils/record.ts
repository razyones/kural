/**
 * Safely pulls typed values from untyped record bags.
 * It is the only module that handles unknown-to-typed property access —
 * no other module guards against missing or mistyped record fields.
 * @kuralUtil
 */

const NONE = 0;

/**
 * Narrows an unknown value to a string-keyed record.
 * @param value - Value to classify
 * @returns True when value is a plain object record
 * @kuralPure
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Safely extracts a numeric value from an untyped record.
 * @param record - Record with unknown value types
 * @param key - Property name to extract
 * @returns The numeric value, or 0 if missing or non-numeric
 * @kuralPure
 */
function num(record: Record<string, unknown> | undefined, key: string): number {
  const v = record?.[key];
  return typeof v === "number" ? v : NONE;
}

/**
 * Safely extracts a string value from an untyped record.
 * @param record - Record with unknown value types
 * @param key - Property name to extract
 * @returns The string value, or empty string if missing or non-string
 * @kuralPure
 */
function str(record: Record<string, unknown> | undefined, key: string): string {
  const v = record?.[key];
  return typeof v === "string" ? v : "";
}

export { isRecord, num, str };
