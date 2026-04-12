/**
 * Defines the CLI argument schema for the place command
 * and wires parsed flags to the engine. It is the only module that
 * speaks the Gunshi command protocol for this workflow — no other
 * module defines these arguments or renders this output.
 */

import type { PlacementResult, PlacementSuggestion } from "../../../analysis/place/types.ts";
import { logBanner, logger } from "../../ui/log.ts";
import { define } from "gunshi";
import { renderFooter } from "../../ui/footer.ts";
import { runPlacement } from "./pipeline.ts";

const JSON_INDENT = 2;
const NONE = 0;

/**
 * Prints the full placement output — suggestion, detection, paths, related.
 * @param result - The complete placement result to display.
 * @kuralCauses writes to stdout
 */
function printResult(result: PlacementResult): void {
  printSuggestion(result.suggestion, result.confidence);
  printDetails(result);
}

/**
 * Prints the suggestion section — auto-place or ask-user with context.
 * @param suggestion - The placement suggestion to print.
 * @param confidence - The confidence percentage for the suggestion.
 * @kuralCauses writes to stdout
 */
function printSuggestion(suggestion: PlacementSuggestion, confidence: number): void {
  if (suggestion.action === "add-to-directory") {
    logger.success(
      `Place in ${suggestion.name} (${String(confidence)}% confidence, via ${suggestion.method})`,
    );
    if (suggestion.bridgeType !== undefined) {
      logger.info(
        `  Bridge type: ${suggestion.bridgeType} (${suggestion.bridgeLayer ?? ""} layer)`,
      );
    }
  } else {
    logger.warning(`Cannot auto-place: ${suggestion.reason}`);
    logger.info(`  Method: ${suggestion.method}`);
    if (suggestion.neighborhoods !== undefined && suggestion.neighborhoods.length > NONE) {
      logger.info("  Nearest neighborhoods:");
      for (const n of suggestion.neighborhoods) {
        logger.info(`    ${n.name} — ${n.description} (${String(n.confidence)}%)`);
      }
    }
    if (suggestion.candidates !== undefined && suggestion.candidates.length > NONE) {
      logger.info("  Candidates:");
      for (const c of suggestion.candidates) {
        logger.info(`    ${c.name} (${String(c.confidence)}%)`);
      }
    }
  }
}

/**
 * Prints detection metrics, top paths, and related concepts.
 * @param result - The complete placement result to display.
 * @kuralCauses writes to stdout
 */
function printDetails(result: PlacementResult): void {
  const d = result.detection;
  console.log();
  logger.info(`Axis: ${result.axis.classification}`);
  logger.info(
    `  domain: ${String(result.axis.domainFit)}, capability: ${String(result.axis.capabilityFit)}`,
  );
  logger.info(`Alien fence: ${String(d.alienFence)} (${String(d.probeCount)} probes)`);
  logger.info(`Best leaf match: ${d.bestLeafMatch.name} (${String(d.bestLeafMatch.similarity)})`);
  if (d.globalAlien) {
    logger.warning("Global alien detected");
  }
  if (d.levelAlien !== null) {
    logger.warning(`Level alien at ${d.levelAlien}`);
  }

  console.log();
  logger.info("Top paths:");
  for (const p of result.topPaths) {
    const trail = p.trail.map((t) => `${t.node} → ${t.choice} (${String(t.probability)}%)`);
    logger.info(`  ${p.parentName} (${String(p.confidence)}%)`);
    for (const step of trail) {
      logger.info(`    ${step}`);
    }
  }

  if (result.relatedConcepts.length > NONE) {
    console.log();
    logger.info("Related concepts:");
    for (const group of result.relatedConcepts) {
      const items = group.items.map((i) => `${i.name} (${String(i.similarity)})`).join(", ");
      logger.info(`  ${group.file} → ${items}`);
    }
  }
}

/**
 * Prints the placement footer with glossary and next steps.
 * @kuralPatterns commandFooter
 * @kuralCauses writes footer to stdout
 */
function printPlaceFooter(): void {
  renderFooter(
    [
      { term: "confidence", definition: "relative probability of the top placement path" },
      { term: "alien", definition: "concept not found in the codebase tree" },
      { term: "bridge", definition: "cross-module concept routed by type classification" },
      {
        term: "LCPN",
        definition: "local projection that discards shared-ancestry dimensions",
      },
    ],
    [
      { command: "kural place -p <provider>", description: "use a specific embedding provider" },
      { command: "kural place --json", description: "output result as JSON" },
      { command: "kural score", description: "view the overall structural score" },
      { command: "kural audit", description: "run structural audits" },
    ],
  );
}

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

    printResult(result);
    printPlaceFooter();
  },
});
