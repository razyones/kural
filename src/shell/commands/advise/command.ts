/**
 * Defines the CLI argument schema for the advise command
 * and wires parsed flags to the engine. It is the only module that
 * speaks the Gunshi command protocol for this workflow — no other
 * module defines these arguments or invokes this run handler.
 */

import { printAdvise, printAdviseFooter } from "./display.ts";
import { relative, resolve } from "node:path";
import { runAdvise, runAdviseFromFile } from "./pipeline.ts";
import type { AdviseResult } from "../../../analysis/advise/analyze.ts";
import { define } from "gunshi";
import { logBanner } from "../../ui/log.ts";

const DEFAULT_DEPTH = 1;
const JSON_INDENT = 2;
const RADIX = 10;

/** CLI args for the advise command. */
type AdviseArgs = {
  path: string;
  fromFile?: string;
  leaf?: boolean;
  json?: boolean;
  depth?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
};

/**
 * Runs the advise pipeline in the appropriate mode and prints output.
 * @param values - Parsed CLI arguments from the advise command
 * @returns Resolves when command output has been printed to stdout
 * @kuralCauses delegates to pipeline and prints output to stdout
 */
async function runAdviseCommand(values: AdviseArgs): Promise<void> {
  const jsonMode = values.json === true;
  const isFileMode = values.fromFile !== undefined && values.fromFile !== "";

  let results: AdviseResult[];
  let banner: Record<string, string>;

  if (isFileMode) {
    const filePath = resolve(values.fromFile ?? "");
    const result = await runAdviseFromFile(filePath, values.provider, values.model, values.apiKey);
    results = [result];
    banner = {
      source: relative(process.cwd(), filePath) || filePath,
      mode: "description",
    };
  } else {
    const root = process.cwd();
    const depth = parseInt(values.depth ?? "", RADIX) || DEFAULT_DEPTH;
    const targetPath = resolve(values.path);
    const run = await runAdvise(root, targetPath, values.leaf === true, depth);
    results = run.results;
    banner = {
      target: relative(root, targetPath) || values.path,
      branch: run.branch,
      snapshot: relative(root, run.dbPath) || run.dbPath,
      "directories analyzed": String(results.length),
    };
  }

  if (jsonMode) {
    console.log(JSON.stringify({ results }, null, JSON_INDENT));
    return;
  }

  logBanner("advise", banner);
  printAdvise(results);
  printAdviseFooter();
}

export default define({
  name: "advise",
  description: "Analyze directory structure and suggest improvements",
  args: {
    path: {
      type: "positional" as const,
      description: "Directory path to analyze",
      required: true as const,
    },
    fromFile: {
      type: "string" as const,
      short: "f",
      description: "JSON file with name/description pairs (description mode)",
    },
    leaf: {
      type: "boolean" as const,
      description: "Use leaf vectors instead of identity (snapshot mode only)",
    },
    json: {
      type: "boolean" as const,
      description: "Output result as JSON",
    },
    depth: {
      type: "string" as const,
      short: "d",
      description: "Recursion depth (default: 1)",
    },
    provider: {
      type: "string" as const,
      short: "p",
      description: "Embedding provider (for description mode)",
    },
    model: {
      type: "string" as const,
      short: "m",
      description: "Model ID override (for description mode)",
    },
    apiKey: {
      type: "string" as const,
      short: "k",
      description: "API key (for description mode)",
    },
  },
  run: async (ctx) => {
    await runAdviseCommand(ctx.values);
  },
});
