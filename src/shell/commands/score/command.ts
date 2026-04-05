/**
 * The interface. Defines the CLI argument schema and wires user input
 * into the score display pipeline. It is the only module that speaks
 * the Gunshi command protocol for the score command — no other module
 * defines its arguments or orchestrates its output.
 */

import { computeDeltas, loadScores } from "./pipeline.ts";
import { logBanner, logger } from "../../ui/log.ts";
import { printJson, renderScore } from "./display.ts";
import { relative, resolve } from "node:path";
import type { ScoreDelta } from "./pipeline.ts";
import { define } from "gunshi";

const JSON_INDENT = 2;
const NONE = 0;
const DEFAULT_LIMIT = 20;

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
 * @param root - absolute path to the project root
 * @param values - parsed CLI arguments from the score command
 * @param result - query result containing branch and snapshot metadata
 * @returns a record of key-value pairs for the CLI banner display
 * @kuralPure
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
 * @param values - parsed CLI arguments from the score command
 * @returns a promise that resolves when the score display is complete
 * @kuralCauses orchestrates score display with I/O including disk reads and stdout writes
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
      description: "Snapshot ID or pin name to read (defaults to active)",
    },
    compare: {
      type: "string" as const,
      short: "c",
      description: "Snapshot ID or pin name to compare against for deltas",
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
