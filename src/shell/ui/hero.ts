/**
 * Renders the hero score display and owns the shared
 * vocabulary for score presentation — health-based coloring, delta
 * formatting, and human-readable verdicts. No other module decides
 * how scores look on screen.
 */

import { colors, logger } from "./log.ts";

const GOOD_THRESHOLD = 0.7;
const MODERATE_THRESHOLD = 0.4;
const UNCHANGED = 0;
const SCORE_DECIMALS = 2;
const DELTA_DECIMALS = 8;

/** Delta arrows for score comparison. */
const ARROW_UP = "\u25B4";
const ARROW_DOWN = "\u25BE";
const ARROW_FLAT = "\u25B8";

/** Options for rendering the hero score display. */
type HeroOptions = {
  score: number;
  kind: string;
  childCount?: number;
  delta?: number;
};

/**
 * Returns a health-colored string for a score value.
 * @param value - Score value used to determine color threshold
 * @param text - Text to colorize
 * @returns The text wrapped in a health-based color
 * @kuralPure
 */
function colorByHealth(value: number, text: string): string {
  if (value >= GOOD_THRESHOLD) {
    return colors.green(text);
  }
  if (value >= MODERATE_THRESHOLD) {
    return colors.yellow(text);
  }
  return colors.red(text);
}

/**
 * Returns a human-readable verdict for a score value.
 * @param value - Score value to evaluate
 * @returns A short verdict string describing structural fit
 * @kuralPure
 */
function verdict(value: number): string {
  if (value >= GOOD_THRESHOLD) {
    return "Strong structural fit.";
  }
  if (value >= MODERATE_THRESHOLD) {
    return "Moderate structural fit.";
  }
  return "Weak structural fit.";
}

/**
 * Formats the delta indicator with directional arrow and color.
 * @param delta - Score change value (positive, negative, or zero)
 * @returns Formatted string with directional arrow and color
 * @kuralPure
 */
function formatDelta(delta: number): string {
  const sign = delta > UNCHANGED ? "+" : "";
  const formatted = `${sign}${delta.toFixed(DELTA_DECIMALS)}`;
  if (delta > UNCHANGED) {
    return ` ${colors.green(`${ARROW_UP} ${formatted}`)}`;
  }
  if (delta < UNCHANGED) {
    return ` ${colors.red(`${ARROW_DOWN} ${formatted}`)}`;
  }
  return ` ${colors.dim(`${ARROW_FLAT} ${formatted}`)}`;
}

/**
 * Renders a hero score display with verdict and metadata.
 * @param options - Hero display configuration including score, kind, and optional delta
 * @kuralBound outward
 * @kuralCauses writes hero display to stdout
 */
function renderHero(options: HeroOptions): void {
  const scoreText = colors.bold(
    colorByHealth(options.score, options.score.toFixed(SCORE_DECIMALS)),
  );
  const deltaText = options.delta === undefined ? "" : formatDelta(options.delta);

  logger.log(`${colors.cyan("\u25C6")} ${scoreText}${deltaText}`);
  logger.log("");
  logger.log(colorByHealth(options.score, verdict(options.score)));
  const childInfo =
    options.childCount === undefined
      ? ""
      : ` ${colors.dim("\u00B7")} ${String(options.childCount)} children`;
  logger.log(colors.dim(`${options.kind}${childInfo}`));
}

export { colorByHealth, formatDelta, renderHero, SCORE_DECIMALS, verdict };
export type { HeroOptions };
