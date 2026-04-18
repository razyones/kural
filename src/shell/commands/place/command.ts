/**
 * Defines the CLI argument schema for the place command
 * and wires parsed flags to the engine. It is the only module that
 * speaks the Gunshi command protocol for this workflow — no other
 * module defines these arguments or invokes this run handler.
 */

import { printPlace, printPlaceFooter } from "./readout.ts";
import { define } from "gunshi";
import { logBanner } from "../../ui/log.ts";
import { runPlacement } from "./pipeline.ts";

const JSON_INDENT = 2;

export default define({
  name: "place",
  description: "Determine where new code should live in the codebase",
  args: {
    description: {
      type: "positional" as const,
      description: "Text description of the code to place",
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
      description: "Model ID override",
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
    const root = process.cwd();
    const provider = ctx.values.provider ?? "vercel";
    const jsonMode = ctx.values.json === true;

    if (!jsonMode) {
      logBanner("place", {
        query: ctx.values.description,
        provider,
      });
    }

    const result = await runPlacement(
      root,
      ctx.values.description,
      provider,
      ctx.values.model,
      ctx.values.apiKey,
    );

    if (jsonMode) {
      console.log(JSON.stringify(result, null, JSON_INDENT));
      return;
    }

    printPlace(result);
    printPlaceFooter();
  },
});
