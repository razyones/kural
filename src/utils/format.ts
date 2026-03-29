/**
 * The printer. Converts numbers and ratios into human-readable display strings.
 * It is the only module that owns numeric formatting conventions — no other
 * module decides decimal places or percentage rounding.
 * @kuralUtil
 */

const DECIMAL_PLACES = 4;
const PERCENT = 100;

/**
 * Formats a number to fixed decimal places for display.
 * @param value - Number to format
 * @returns Fixed-point string representation
 * @kuralPure
 */
function fmt(value: number): string {
  return value.toFixed(DECIMAL_PLACES);
}

/**
 * Formats a 0–1 ratio as a rounded percentage string.
 * @param value - Ratio to format
 * @returns Percentage string like "85%"
 * @kuralPure
 */
function fmtPct(value: number): string {
  return `${Math.round(value * PERCENT)}%`;
}

export { fmt, fmtPct };
