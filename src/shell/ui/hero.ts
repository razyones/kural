/**
 * Renders the hero score display and owns the shared
 * vocabulary for score presentation — health-based coloring, delta
 * formatting, and human-readable verdicts. No other module decides
 * how scores look on screen.
 */

import { colors, logger } from "./log.ts";
import { formatDelta } from "./delta.ts";

const GOOD_THRESHOLD = 0.7;
const MODERATE_THRESHOLD = 0.4;
const SCORE_DECIMALS = 2;

/**
 * Score, kind label, optional child count, and delta — the values
 * renderHero formats with health colors and a verdict line.
 */
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
 * Renders a hero score display with verdict and metadata.
 * @param options - Hero display configuration including score, kind, and optional delta
 * @kuralBound outward
 * @kuralCauses writes hero display to stdout
 */
function renderHero(options: HeroOptions): void {
  const scoreText = colors.bold(
    colorByHealth(options.score, options.score.toFixed(SCORE_DECIMALS)),
  );
  const deltaText =
    options.delta === undefined ? "" : ` ${formatDelta(options.delta, { colored: true })}`;

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
