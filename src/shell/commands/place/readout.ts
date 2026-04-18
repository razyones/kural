/**
 * Converts placement results into terminal output. It is the only
 * module that decides how the place command's suggestion and
 * detection data appear on screen — no other module formats place
 * output for stdout.
 */

import type {
  PlacementResult,
  PlacementSuggestion,
  TrailEntry,
} from "../../../analysis/place/types.ts";
import { logger } from "../../ui/log.ts";
import { renderFooter } from "../../ui/footer.ts";

const NONE = 0;
const LAST_OFFSET = 1;

/**
 * Resolves the parent neighborhood name from the top placement path —
 * the directory the chain confidently descended into before the leaf
 * score collapsed. Used to frame ask-user outcomes around the broader
 * neighborhood instead of the misleading leaf match.
 * @param topPaths - Ranked placement paths from the engine.
 * @returns The parent directory name or null when no trail is available.
 * @kuralPure
 * @kuralHelper
 */
function parentNeighborhood(topPaths: PlacementResult["topPaths"]): string | null {
  const [first] = topPaths;
  if (first === undefined) {
    return null;
  }
  const trail = first.trail;
  if (trail.length === NONE) {
    return null;
  }
  const last: TrailEntry | undefined = trail[trail.length - LAST_OFFSET];
  return last?.node ?? null;
}

/**
 * Prints the suggestion section — auto-place or ask-user with context.
 * @param suggestion - The placement suggestion to print.
 * @param confidence - The confidence percentage for the suggestion.
 * @param topPaths - Ranked placement paths used to derive the neighborhood.
 * @kuralCauses writes suggestion section to stdout
 * @kuralHelper
 */
function printSuggestion(
  suggestion: PlacementSuggestion,
  confidence: number,
  topPaths: PlacementResult["topPaths"],
): void {
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
    const neighborhood = parentNeighborhood(topPaths);
    if (neighborhood === null) {
      logger.warning("Cannot auto-place \u2014 new concept");
    } else {
      logger.warning(`Likely belongs in ${neighborhood} \u2014 new concept (no exact match)`);
    }
    logger.info(`  ${suggestion.reason}`);
    logger.info(`  Method: ${suggestion.method}`);
    if (suggestion.neighborhoods !== undefined && suggestion.neighborhoods.length > NONE) {
      logger.info("  Nearest leaf matches:");
      for (const n of suggestion.neighborhoods) {
        logger.info(`    ${n.name} \u2014 ${n.description} (${String(n.confidence)}%)`);
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
 * @kuralCauses writes detection section to stdout
 * @kuralHelper
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
 * Composes the place command's suggestion verdict, detection metrics,
 * ranked paths, and related concepts into the terminal placement
 * readout for stdout.
 * @param result - The complete placement result to display.
 * @kuralCauses writes placement readout to stdout
 * @kuralPatterns commandPrinter
 */
function printPlace(result: PlacementResult): void {
  printSuggestion(result.suggestion, result.confidence, result.topPaths);
  printDetails(result);
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

export { printPlace, printPlaceFooter };
