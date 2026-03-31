/**
 * The interface. Defines the CLI argument schema and wires user input
 * into the generation pipeline. It is the only module that speaks the
 * Gunshi command protocol — no other module defines the generate
 * command's arguments or output.
 */

import type { EmbedOptions, Embedder } from "../../ingestion/embed/pipeline.ts";
import type { GenerateCallbacks, GenerateResult } from "./pipeline.ts";
import { createEmbeddingModel, embedSignatures } from "../../ingestion/embed/model.ts";
import { logBanner, logger } from "../../ui/log.ts";
import { relative, resolve } from "node:path";
import { createStepTracker } from "../../ui/step-tracker.ts";
import { define } from "gunshi";
import { generate } from "./pipeline.ts";
import { renderFooter } from "../../ui/footer.ts";

const NONE = 0;
const JSON_INDENT = 2;
const FACET_NAMES = [
  "names",
  "descriptions",
  "structures",
  "paths",
  "causes",
  "calls",
  "parent context",
];

/**
 * Constructs the observer that reports pipeline milestones — parse counts, embed totals, score counts, and storage paths — to the terminal as each stage completes.
 * @returns Callback object with onParsed, onEmbedded, onScored, and onStored hooks
 * @kuralCauses logs progress to stdout via logger
 */
function buildCallbacks(): GenerateCallbacks {
  return {
    onParsed: (files, dirs) => {
      logger.success(`Parsed ${String(files)} files, ${String(dirs)} directories`);
    },
    onEmbedded: (count, cacheHits) => {
      if (cacheHits > NONE) {
        const embedded = count - cacheHits;
        logger.success(
          `Embedded ${String(count)} items (${String(embedded)} new, ${String(cacheHits)} cached)`,
        );
      } else {
        logger.success(`Embedded ${String(count)} items`);
      }
    },
    onScored: (count) => {
      logger.success(`Scored ${String(count)} nodes`);
    },
    onStored: (dbPath, snapshotId) => {
      logger.success(`Saved to ${relative(process.cwd(), dbPath)}`);
      logger.success(`Snapshot ${snapshotId}`);
    },
  };
}

/**
 * Serializes the generation outcome into a machine-readable JSON report for programmatic consumers.
 * @param targetPath - Absolute path to the scanned directory
 * @param provider - Embedding provider name
 * @param modelId - Resolved embedding model ID
 * @param result - Completed generation result with counts and paths
 * @kuralCauses writes JSON to stdout
 */
function printJson(
  targetPath: string,
  provider: string,
  modelId: string,
  result: GenerateResult,
): void {
  const output = {
    path: relative(process.cwd(), targetPath) || ".",
    provider,
    model: modelId,
    branch: result.branch,
    snapshotId: result.snapshotId,
    fileCount: result.fileCount,
    dirCount: result.dirCount,
    unitCount: result.unitCount,
    dbPath: relative(process.cwd(), result.dbPath),
  };
  console.log(JSON.stringify(output, null, JSON_INDENT));
}

/**
 * Wraps the raw embedding function with a multi-step spinner that visualizes progress through each facet pass.
 * @param embedFn - Raw embedding function to wrap with progress tracking
 * @returns An embedder that displays step-by-step spinner progress
 * @kuralCauses wraps embedFn with animated progress spinners
 */
function createTrackedEmbedder(embedFn: (values: string[]) => Promise<number[][]>): Embedder {
  const tracker = createStepTracker("Embedding", FACET_NAMES);
  return async (sigs) => {
    const vectors = await tracker(async (onProgress) => {
      const result = await embedSignatures(sigs, embedFn, { onProgress });
      return result;
    });
    return vectors;
  };
}

/**
 * Closes the generate output with term definitions and suggested follow-up commands.
 * @kuralCauses writes footer sections to stdout
 */
function printGenerateFooter(): void {
  renderFooter(
    [
      { term: "fileCount", definition: "number of source files parsed" },
      { term: "dirCount", definition: "number of directories discovered" },
      {
        term: "unitCount",
        definition: "total units embedded (files + types + functions + dirs)",
      },
    ],
    [
      { command: "kural score", description: "view the overall structural score" },
      { command: "kural score -p <path>", description: "score a specific node" },
      { command: "kural score -e", description: "detailed score breakdown table" },
      { command: "kural generate --json", description: "output result as JSON" },
    ],
  );
}

/**
 * Orchestrates the full generate flow — resolves the embedding provider, runs the pipeline, and renders either human or JSON output.
 * @param values - Parsed CLI arguments for the generate command
 * @returns Resolves when generation and output have completed
 * @kuralCauses orchestrates the full parse-embed-score-store pipeline with I/O
 */
async function handleGenerate(values: {
  path: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  json?: boolean;
}): Promise<void> {
  const targetPath = resolve(values.path);
  const provider = values.provider ?? "vercel";
  const jsonMode = values.json === true;

  const { embed: embedFn, modelId } = createEmbeddingModel({
    provider,
    model: values.model,
    apiKey: values.apiKey,
  });

  if (!jsonMode) {
    logBanner("generate", {
      path: relative(process.cwd(), targetPath) || ".",
      provider,
      model: modelId,
    });
  }

  const embedOptions: EmbedOptions = {
    rootPath: targetPath,
    domainKeywords: [],
    dictionary: {},
  };

  const root = process.cwd();
  const callbacks = jsonMode ? {} : buildCallbacks();
  const result = await generate(
    root,
    targetPath,
    createTrackedEmbedder(embedFn),
    embedOptions,
    modelId,
    callbacks,
  );

  if (jsonMode) {
    printJson(targetPath, provider, modelId, result);
    return;
  }

  printGenerateFooter();
}

export default define({
  name: "generate",
  description: "Parse, embed, and score a codebase snapshot",
  args: {
    path: {
      type: "positional" as const,
      description: "Path to the codebase directory",
      required: true,
    },
    provider: {
      type: "string" as const,
      short: "p",
      description: "Embedding provider (openrouter, openai, vercel, ollama)",
    },
    model: {
      type: "string" as const,
      short: "m",
      description: "Model ID override (uses provider default if omitted)",
    },
    apiKey: {
      type: "string" as const,
      short: "k",
      description: "API key (defaults to AI_GATEWAY_API_KEY env var)",
    },
    json: {
      type: "boolean" as const,
      description: "Output result as JSON",
    },
  },
  run: async (ctx) => {
    await handleGenerate(ctx.values);
  },
});
