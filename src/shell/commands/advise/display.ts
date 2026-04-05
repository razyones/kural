/**
 * The illustrator. Renders dendrograms, cut evaluations, and score
 * deltas for the advise command output. It is the only module that
 * owns the visual layout for reorganization recommendations — no
 * other module formats merge orders or cut comparisons.
 */

import type {
  AdviseResult,
  CutEvaluation,
  ProposedGroup,
} from "../../../analysis/advise/analyze.ts";
import { colors, logger } from "../../ui/log.ts";
import { renderFooter } from "../../ui/footer.ts";

const NONE = 0;
const FIRST = 0;
const ONE = 1;
const PERCENT = 100;
const PERCENT_DECIMALS = 1;
const BEST_CUT_MARKER = " \u2605 best";

/**
 * Formats a number as a percentage string with one decimal place.
 * @param value - The decimal value to format (0-100 scale)
 * @returns Formatted percentage string like "92.5%"
 * @kuralPure
 * @kuralHelper
 */
function pct(value: number): string {
  return `${(value * PERCENT).toFixed(PERCENT_DECIMALS)}%`;
}

/**
 * Formats a delta value with a directional arrow indicator.
 * @param delta - The signed difference value
 * @returns Formatted delta string like "+1.5" with an arrow
 * @kuralPure
 * @kuralHelper
 */
function formatDelta(delta: number): string {
  const scaled = delta * PERCENT;
  const sign = scaled >= NONE ? "+" : "";
  const arrow = scaled > NONE ? "\u25B4" : scaled < NONE ? "\u25BE" : " ";
  return `${arrow} ${sign}${scaled.toFixed(PERCENT_DECIMALS)}`;
}

/**
 * Computes the arithmetic mean of a number array.
 * @param values - Array of numbers to average
 * @returns The mean value, or zero if the array is empty
 * @kuralPure
 * @kuralHelper
 */
function average(values: number[]): number {
  if (values.length === NONE) {
    return NONE;
  }
  const sum = values.reduce((acc, v) => acc + v, NONE);
  return sum / values.length;
}

/**
 * Renders a single group with its label and member names.
 * @param group - The proposed group to display
 * @param index - The group number for labeling
 * @kuralCauses writes group info to stdout
 */
function printGroup(group: ProposedGroup, index: number): void {
  const label = `Group ${String(index)}`;
  logger.log(`    ${colors.cyan(label)}: ${group.names.join(", ")}`);
}

/**
 * Renders the current vs proposed score comparison for a cut.
 * @param cut - The cut evaluation containing proposed groups
 * @param result - The advise result with current baseline scores
 * @kuralCauses writes score delta table to stdout
 */
function printScoreDeltas(cut: CutEvaluation, result: AdviseResult): void {
  if (cut.groups.length === NONE) {
    return;
  }

  const avgFit = average(cut.groups.map((g) => g.childrenFit));
  const avgUniq = average(cut.groups.map((g) => g.childrenUniqueness));
  const avgScore = average(cut.groups.map((g) => g.childrenScore));

  logger.log("");
  logger.log(`    ${colors.dim("Current \u2192 Proposed:")}`);

  if (result.currentChildrenFit !== null) {
    const delta = avgFit - result.currentChildrenFit;
    logger.log(
      `      childrenFit:        ${pct(result.currentChildrenFit)} \u2192 ${pct(avgFit)}  ${formatDelta(delta)}`,
    );
  }

  const uniqDelta = avgUniq - result.currentChildrenUniqueness;
  logger.log(
    `      childrenUniqueness: ${pct(result.currentChildrenUniqueness)} \u2192 ${pct(avgUniq)}  ${formatDelta(uniqDelta)}`,
  );

  if (result.currentChildrenScore !== null) {
    const scoreDelta = avgScore - result.currentChildrenScore;
    logger.log(
      `      childrenScore:      ${pct(result.currentChildrenScore)} \u2192 ${pct(avgScore)}  ${formatDelta(scoreDelta)}`,
    );
  }
}

/**
 * Renders a single cut evaluation with groups and score deltas.
 * @param cut - The cut evaluation to display
 * @param cutIndex - The index of this cut in the cuts array
 * @param isBest - Whether this cut is the recommended best
 * @param result - The parent advise result for current score context
 * @kuralCauses writes cut details to stdout
 */
function printSingleCut(
  cut: CutEvaluation,
  cutIndex: number,
  isBest: boolean,
  result: AdviseResult,
): void {
  const simStr = pct(cut.similarity);
  const bestLabel = isBest ? colors.green(BEST_CUT_MARKER) : "";
  const groupCount = cut.groups.length;
  const singletonCount = cut.singletons.length;

  const parts: string[] = [];
  if (groupCount > NONE) {
    parts.push(`${String(groupCount)} group${groupCount > ONE ? "s" : ""}`);
  }
  if (singletonCount > NONE) {
    parts.push(`${String(singletonCount)} singleton${singletonCount > ONE ? "s" : ""}`);
  }

  logger.log(
    `  ${colors.bold(`Cut ${String(cutIndex + ONE)}`)} at ${simStr} (${parts.join(" + ")})${bestLabel}`,
  );
  logger.log("");

  let groupNumber = ONE;
  for (const group of cut.groups) {
    printGroup(group, groupNumber);
    groupNumber++;
  }

  if (singletonCount > NONE) {
    logger.log(`    ${colors.dim("Singletons")}: ${cut.singletons.join(", ")}`);
  }

  printScoreDeltas(cut, result);
  logger.log("");
}

/**
 * Renders the merge order dendrogram for a single advise result.
 * @param result - The advise result containing merge distances
 * @kuralCauses writes dendrogram to stdout
 */
function printDendrogram(result: AdviseResult): void {
  logger.log(colors.bold(`  Merge order for ${result.targetName}:`));
  logger.log("");
  const merges = result.merges;
  for (let i = FIRST; i < merges.length; i++) {
    const similarity = merges[i] ?? NONE;
    const step = i + ONE;
    const simStr = pct(Math.cos(similarity));
    logger.log(`    ${colors.dim(String(step) + ".")} ${simStr} similarity`);
  }
  logger.log("");
}

/**
 * Renders all cuts for a single advise result.
 * @param result - The advise result containing cuts to display
 * @kuralCauses writes cut sections to stdout
 */
function printCuts(result: AdviseResult): void {
  if (result.cuts.length === NONE) {
    logger.log(colors.dim("  No meaningful cuts found."));
    logger.log("");
    return;
  }

  logger.log(colors.bold(`  Cut analysis for ${result.targetName}:`));
  logger.log("");

  for (let i = FIRST; i < result.cuts.length; i++) {
    const cut = result.cuts[i];
    if (cut === undefined) {
      continue;
    }
    const isBest = result.bestCutIndex === i;
    printSingleCut(cut, i, isBest, result);
  }
}

/**
 * Renders all advise results to stdout with dendrograms and cuts.
 * @param results - Array of advise results to display
 * @kuralCauses writes analysis output to stdout
 */
function renderResults(results: AdviseResult[]): void {
  for (const result of results) {
    printDendrogram(result);
    printCuts(result);
  }
}

/**
 * Renders the footer with glossary terms and next-step hints.
 * @kuralCauses writes footer to stdout
 * @kuralPatterns commandFooter
 */
function printAdviseFooter(): void {
  renderFooter(
    [
      { term: "Merge order", definition: "sequence of pairwise merges by cosine similarity" },
      { term: "Cut", definition: "a similarity threshold that partitions children into groups" },
      { term: "Singleton", definition: "a child that does not cluster with any peer at the cut" },
      { term: "childrenFit", definition: "average parent-child cosine similarity (0\u2013100%)" },
      {
        term: "childrenUniqueness",
        definition: "average pairwise distance between siblings (0\u2013100%)",
      },
      { term: "childrenScore", definition: "combined metric of fit and uniqueness" },
    ],
    [
      { command: "kural advise <path>", description: "analyze a directory for reorganization" },
      { command: "kural advise <path> -d 2", description: "recurse into child directories" },
      {
        command: "kural advise <path> --leaf",
        description: "use leaf vectors instead of identity",
      },
      {
        command: "kural advise -f items.json",
        description: "analyze from description file (no snapshot)",
      },
      { command: "kural advise <path> --json", description: "output result as JSON" },
    ],
  );
}

export { printAdviseFooter, renderResults };
