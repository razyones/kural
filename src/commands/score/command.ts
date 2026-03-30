/**
 * The interface. Defines the CLI argument schema and wires user input
 * into the score display pipeline. It is the only module that speaks
 * the Gunshi command protocol for the score command — no other module
 * defines its arguments or orchestrates its output.
 */

import type { LoadedScore, ScoreDelta } from "./pipeline.ts";
import { colors, logBanner, logger } from "../../ui/log.ts";
import { computeDeltas, countChildren, loadScores } from "./pipeline.ts";
import { relative, resolve } from "node:path";
import type { ScoreTableRow } from "../../ui/table.ts";
import { define } from "gunshi";
import { renderFooter } from "../../ui/footer.ts";
import { renderHero } from "../../ui/hero.ts";
import { renderScoreTable } from "../../ui/table.ts";

const JSON_INDENT = 2;
const NONE = 0;
const DEFAULT_LIMIT = 20;
const SHOW_ALL = 0;

/**
 * Builds table rows from scores with optional deltas.
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
 */
function printScoreFooter(): void {
  renderFooter(
    [
      { term: "Self", definition: "how well this node fits under its parent (-1…1)" },
      { term: "Children", definition: "how coherent this node's direct children are (-1…1)" },
      { term: "Subtree", definition: "recursive health of the entire subtree below (-1…1)" },
      { term: "Overall", definition: "harmonic mean of Self and Subtree (-1…1)" },
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

/** CLI args for the score command. */
type ScoreArgs = {
  path?: string;
  snapshot?: string;
  compare?: string;
  explain?: boolean;
  limit?: string;
  json?: boolean;
};

/**
 * Builds banner params from CLI args and query result.
 */
function buildBannerParams(
  root: string,
  values: ScoreArgs,
  result: { branch: string; snapshotLabel: string },
): Record<string, string> {
  const params: Record<string, string> = {
    path:
      values.path !== undefined && values.path !== ""
        ? relative(root, `${root}/${values.path}`) || "."
        : "all",
    branch: result.branch,
    snapshot: result.snapshotLabel,
  };
  if (values.compare !== undefined && values.compare !== "") {
    params.compare = values.compare;
  }
  return params;
}

/**
 * Handles the score command logic.
 */
async function handleScore(values: ScoreArgs): Promise<void> {
  const root = process.cwd();
  const pathFilter =
    values.path !== undefined && values.path !== "" ? resolve(values.path) : undefined;
  const jsonMode = values.json === true;
  const explain = values.explain === true;
  const limit =
    values.limit !== undefined && values.limit !== "" ? Number(values.limit) : DEFAULT_LIMIT;

  const result = await loadScores(root, pathFilter, values.snapshot);

  if (result.scores.length === NONE) {
    if (jsonMode) {
      console.log(JSON.stringify({ error: "No scores found" }, null, JSON_INDENT));
    } else {
      logger.warning("No scores found. Run generate first.");
    }
    return;
  }

  const target = result.scores[NONE];

  let deltas: ScoreDelta[] | undefined;
  if (values.compare !== undefined && values.compare !== "") {
    const comparison = await loadScores(root, pathFilter, values.compare);
    deltas = computeDeltas(result.scores, comparison.scores);
  }

  if (jsonMode) {
    printJson(
      root,
      target,
      result.scores,
      result.branch,
      result.snapshotLabel,
      explain,
      limit,
      deltas,
    );
    return;
  }

  logBanner("score", buildBannerParams(root, values, result));
  renderScore(root, target, result.scores, explain, limit, deltas);
}

export default define({
  name: "score",
  description: "Display structural scores for codebase units",
  args: {
    path: {
      type: "string" as const,
      short: "p",
      description: "Path prefix to filter units",
    },
    snapshot: {
      type: "string" as const,
      short: "s",
      description: "Snapshot ID to read (defaults to active)",
    },
    compare: {
      type: "string" as const,
      short: "c",
      description: "Snapshot ID to compare against for deltas",
    },
    explain: {
      type: "boolean" as const,
      short: "e",
      description: "Show detailed score breakdown table",
    },
    limit: {
      type: "string" as const,
      short: "l",
      description: "Max rows in breakdown table (default 20, 0 for all)",
    },
    json: {
      type: "boolean" as const,
      description: "Output result as JSON",
    },
  },
  run: async (ctx) => {
    await handleScore(ctx.values);
  },
});
