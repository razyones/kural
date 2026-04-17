/**
 * Renders signed deltas as arrow-prefixed badges with optional
 * percent scaling and sign-based coloring. It is the only module
 * that owns this indicator — no other module pairs an up/down glyph
 * with a numeric change.
 * @kuralHelper
 */

import { colors } from "./log.ts";

const UNCHANGED = 0;
const RAW_DECIMALS = 8;
const PERCENT_DECIMALS = 1;
const PERCENT_SCALE = 100;
const ARROW_UP = "\u25B4";
const ARROW_DOWN = "\u25BE";
const ARROW_FLAT = "\u25B8";

/** Rendering style for the delta badge. */
type DeltaStyle = {
  /** Multiply by 100 and append `%` to the numeric segment. */
  percent?: boolean;
  /** Apply green/red/dim color to the badge based on sign. */
  colored?: boolean;
  /** Override the default decimal places (8 for raw, 1 for percent). */
  decimals?: number;
};

/**
 * Formats a signed delta as an arrow glyph followed by the numeric
 * change, optionally scaled as a percent and tinted by sign.
 * @param delta - Signed change value
 * @param style - Rendering options
 * @returns The styled badge string
 * @kuralPure
 */
function formatDelta(delta: number, style: DeltaStyle = {}): string {
  const percent = style.percent ?? false;
  const colored = style.colored ?? false;
  const decimals = style.decimals ?? (percent ? PERCENT_DECIMALS : RAW_DECIMALS);
  const scaled = percent ? delta * PERCENT_SCALE : delta;
  const sign = scaled > UNCHANGED ? "+" : "";
  const suffix = percent ? "%" : "";
  const formatted = `${sign}${scaled.toFixed(decimals)}${suffix}`;
  const arrow = scaled > UNCHANGED ? ARROW_UP : scaled < UNCHANGED ? ARROW_DOWN : ARROW_FLAT;
  const body = `${arrow} ${formatted}`;
  if (!colored) {
    return body;
  }
  if (scaled > UNCHANGED) {
    return colors.green(body);
  }
  if (scaled < UNCHANGED) {
    return colors.red(body);
  }
  return colors.dim(body);
}

export { formatDelta };
