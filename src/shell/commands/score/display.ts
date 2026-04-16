/**
 * Converts loaded scores and deltas into terminal and JSON
 * output formats. It is the only module that decides how score data
 * appears to the user — no other module formats score displays.
 */

import type { LoadedScore, ScoreDelta } from "./pipeline.ts";
import { colors, logger } from "../../ui/log.ts";
import type { ScoreTableRow } from "../../ui/table.ts";
import { countChildren } from "./pipeline.ts";
import { relative } from "node:path";
import { renderFooter } from "../../ui/footer.ts";
import { renderHero } from "../../ui/hero.ts";
import { renderScoreTable } from "../../ui/table.ts";

const JSON_INDENT = 2;
const NONE = 0;
const SHOW_ALL = 0;

/**
 * Builds table rows from scores with optional deltas.
 * @param root - absolute path to the project root, used to compute relative display paths
 * @param scores - loaded score cards to convert into table rows
 * @param deltas - optional deltas to attach change indicators to each row
 * @returns an array of ScoreTableRow objects ready for rendering
 * @kuralPure
 */
function buildTableRows(
  root: string,
  scores: LoadedScore[],
  deltas?: ScoreDelta[],
): ScoreTableRow[] {
  const deltaMap = new Map<string, ScoreDelta>();
  if (deltas) {
    for (const d of deltas) {
      deltaMap.set(d.current.key, d);
    }
  }

  return scores.map((s) => {
    const d = deltaMap.get(s.key);
    const relPath = relative(root, s.path) || ".";
    const displayPath = s.kind === "function" || s.kind === "type" ? `  :${s.name}` : relPath;
    return {
      path: displayPath,
      kind: s.kind,
      self: s.score,
      children: s.childrenScore,
      subtree: s.subtreeScore,
      overall: s.overallScore,
      selfDelta: d?.selfDelta,
      childrenDelta: d?.childrenDelta,
      subtreeDelta: d?.subtreeDelta,
      overallDelta: d?.overallDelta,
    };
  });
}

/**
 * Prints the score command footer with glossary and next steps.
 * @kuralPatterns commandFooter
 * @kuralCauses writes footer glossary and next-step hints to stdout
 */
function printScoreFooter(): void {
  renderFooter(
    [
      { term: "Self", definition: "how well this node fits under its parent (0…1)" },
      { term: "Children", definition: "how coherent this node's direct children are (0…1)" },
      { term: "Subtree", definition: "recursive health of the entire subtree below (0…1)" },
      { term: "Overall", definition: "harmonic mean of Self and Subtree (0…1)" },
      { term: "(\u2014)", definition: "not applicable (leaves have no Children or Subtree)" },
    ],
    [
      { command: "kural score -e", description: "detailed score breakdown table" },
      { command: "kural score -p <path>", description: "score a specific node or subtree" },
      { command: "kural score -e -l 0", description: "show all rows in breakdown" },
      { command: "kural score -c <id>", description: "compare against a previous snapshot" },
      { command: "kural score --json", description: "output as JSON" },
    ],
  );
}

/**
 * Renders the hero score and optional breakdown table.
 * @param root - absolute path to the project root
 * @param target - the primary node whose score is displayed as the hero
 * @param allScores - full list of loaded scores used for the breakdown table
 * @param explain - whether to render the detailed breakdown table
 * @param limit - maximum number of rows to show in the breakdown table
 * @param deltas - optional deltas to display change indicators
 * @kuralCauses renders score display to stdout
 */
function renderScore(
  root: string,
  target: LoadedScore,
  allScores: LoadedScore[],
  explain: boolean,
  limit: number,
  deltas?: ScoreDelta[],
): void {
  const targetDelta = deltas?.find((d) => d.current.key === target.key);

  logger.log(colors.bold("Score:"));
  logger.log("");
  if (target.overallScore === null) {
    logger.log("No overall score available for this node.");
  } else {
    renderHero({
      score: target.overallScore,
      kind: target.kind,
      childCount: countChildren(target, allScores) || undefined,
      delta: targetDelta?.overallDelta,
    });
  }

  if (explain) {
    const total = allScores.length;
    const visible = limit === SHOW_ALL ? allScores : allScores.slice(NONE, limit);
    const rows = buildTableRows(root, visible, deltas);

    logger.log("");
    logger.log(colors.bold("Explanation:"));
    logger.log("");
    renderScoreTable(rows, { showing: rows.length, total });
  }

  printScoreFooter();
}

/**
 * Outputs score data as JSON.
 * @param root - absolute path to the project root
 * @param target - the primary node whose score is output
 * @param allScores - full list of loaded scores for the breakdown
 * @param branch - current git branch name
 * @param snapshotLabel - human-readable snapshot identifier
 * @param explain - whether to include the detailed breakdown array
 * @param limit - maximum number of rows in the breakdown
 * @param deltas - optional deltas to include change indicators
 * @kuralCauses writes JSON to stdout
 */
function printJson(
  root: string,
  target: LoadedScore,
  allScores: LoadedScore[],
  branch: string,
  snapshotLabel: string,
  explain: boolean,
  limit: number,
  deltas?: ScoreDelta[],
): void {
  const base = {
    path: relative(root, target.path) || ".",
    kind: target.kind,
    branch,
    snapshot: snapshotLabel,
    overallScore: target.overallScore,
    delta: deltas?.find((d) => d.current.key === target.key)?.overallDelta,
  };

  if (!explain) {
    console.log(JSON.stringify(base, null, JSON_INDENT));
    return;
  }

  const total = allScores.length;
  const visible = limit === SHOW_ALL ? allScores : allScores.slice(NONE, limit);
  const breakdown = visible.map((s) => {
    const d = deltas?.find((dd) => dd.current.key === s.key);
    return {
      path: relative(root, s.path) || ".",
      kind: s.kind,
      name: s.name,
      self: s.score,
      children: s.childrenScore,
      subtree: s.subtreeScore,
      overall: s.overallScore,
      selfDelta: d?.selfDelta,
      childrenDelta: d?.childrenDelta,
      subtreeDelta: d?.subtreeDelta,
      overallDelta: d?.overallDelta,
    };
  });

  console.log(JSON.stringify({ ...base, total, limit, breakdown }, null, JSON_INDENT));
}

export { printJson, renderScore };
