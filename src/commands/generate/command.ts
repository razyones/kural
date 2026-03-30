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
 * Builds progress callbacks that log each stage to stdout.
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
    onStored: (dbPath) => {
      logger.success(`Saved to ${relative(process.cwd(), dbPath)}`);
    },
  };
}

/**
 * Prints the generation result as JSON to stdout.
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
    fileCount: result.fileCount,
    dirCount: result.dirCount,
    unitCount: result.unitCount,
    dbPath: relative(process.cwd(), result.dbPath),
  };
  console.log(JSON.stringify(output, null, JSON_INDENT));
}

/**
 * Creates an embedder that tracks progress through named facet steps.
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
 * Runs the generate command with the given CLI arguments.
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
    undefined,
    callbacks,
  );

  if (jsonMode) {
    printJson(targetPath, provider, modelId, result);
  }
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
