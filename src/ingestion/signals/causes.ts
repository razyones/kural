/**
 * The voice of causes. Extracts the side-effect description from impure
 * functions as plain text. It is the only module that reads the causes
 * annotation — no other module extracts behavioral text from parsed units.
 */

/**
 * Extracts the causes description from a function.
 * Returns the causes text for impure functions, empty string otherwise.
 * @param fn - Object with an optional causes field
 * @returns The causes text, or empty string if absent
 * @kuralPure
 */
function getCausesText(fn: { causes?: string }): string {
  return fn.causes ?? "";
}

export { getCausesText };
