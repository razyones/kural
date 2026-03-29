/**
 * The interface. Defines the CLI argument schema and wires user input
 * into the generation pipeline. It is the only module that speaks the
 * Gunshi command protocol — no other module defines the generate
 * command's arguments or output.
 */

import type { EmbedOptions, Embedder } from "../../ingestion/embed/pipeline.ts";
import { createEmbeddingModel, embedSignatures } from "../../ingestion/embed/model.ts";
import { relative, resolve } from "node:path";
import type { GenerateCallbacks } from "./pipeline.ts";
import { define } from "gunshi";
import { generate } from "./pipeline.ts";

const NONE = 0;

/**
 * Builds progress callbacks that log each stage to stdout.
 */
function buildCallbacks(): GenerateCallbacks {
  return {
    onParsed: (files, dirs) => {
      console.log(`Parsed ${String(files)} files, ${String(dirs)} directories`);
    },
    onEmbedded: (count, cacheHits) => {
      if (cacheHits > NONE) {
        const embedded = count - cacheHits;
        console.log(
          `Embedded ${String(count)} items (${String(embedded)} new, ${String(cacheHits)} cached)`,
        );
      } else {
        console.log(`Embedded ${String(count)} items`);
      }
    },
    onScored: (count) => {
      console.log(`Scored ${String(count)} nodes`);
    },
    onStored: (dbPath) => {
      console.log(`Saved to ${relative(process.cwd(), dbPath)}`);
    },
  };
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
  },
  run: async (ctx) => {
    const targetPath = resolve(ctx.values.path);
    const provider = ctx.values.provider ?? "vercel";

    const { embed: embedFn, modelId } = createEmbeddingModel({
      provider,
      model: ctx.values.model,
      apiKey: ctx.values.apiKey,
    });

    const embedder: Embedder = async (sigs) => {
      const vectors = await embedSignatures(sigs, embedFn);
      return vectors;
    };

    const embedOptions: EmbedOptions = {
      rootPath: targetPath,
      domainKeywords: [],
      dictionary: {},
    };

    const root = process.cwd();
    await generate(root, targetPath, embedder, embedOptions, modelId, undefined, buildCallbacks());
  },
});
