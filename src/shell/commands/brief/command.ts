/**
 * Defines the CLI argument schema for the brief command and
 * wires parsed flags to the pipeline. It is the only module that speaks
 * the Gunshi command protocol for this workflow — no other module
 * defines these arguments or renders this output.
 */

import { printBrief, printBriefFooter } from "./readout.ts";
import { define } from "gunshi";
import { logBanner } from "../../ui/log.ts";
import { runBrief } from "./pipeline.ts";

const JSON_INDENT = 2;

export default define({
  name: "brief",
  description: "Show existing code to consult before implementing a new concept",
  args: {
    description: {
      type: "positional" as const,
      description: "Text description of the code the agent plans to write",
      required: true,
    },
    gateway: {
      type: "string" as const,
      short: "g",
      description: "Embedding gateway (openrouter, openai, vercel, ollama)",
    },
    model: {
      type: "string" as const,
      short: "m",
      description: "Model ID override",
    },
    apiKey: {
      type: "string" as const,
      short: "k",
      description: "API key (falls back to the gateway's env var from kural config)",
    },
    json: {
      type: "boolean" as const,
      description: "Output brief as JSON",
    },
  },
  run: async (ctx) => {
    const root = process.cwd();
    const gateway = ctx.values.gateway ?? "vercel";
    const jsonMode = ctx.values.json === true;

    if (!jsonMode) {
      logBanner("brief", {
        query: ctx.values.description,
        gateway,
      });
    }

    const result = await runBrief(
      root,
      ctx.values.description,
      gateway,
      ctx.values.model,
      ctx.values.apiKey,
    );

    if (jsonMode) {
      console.log(JSON.stringify(result, null, JSON_INDENT));
      return;
    }

    printBrief(result, root);
    printBriefFooter();
  },
});
