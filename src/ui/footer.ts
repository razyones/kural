/**
 * The signpost. Renders glossary definitions and next-step hints at the
 * end of command output. It is the only module that owns the footer
 * layout — no other module prints glossary or hint sections.
 */

import { colors, logger } from "./log.ts";

/** A single glossary entry: abbreviation and its meaning. */
type GlossaryEntry = {
  term: string;
  definition: string;
};

/** A suggested next command with description. */
type HintEntry = {
  command: string;
  description: string;
};

/**
 * Renders a glossary section followed by next-step hints.
 * @param glossary - Array of glossary entries to display
 * @param hints - Array of hint entries with suggested next commands
 * @kuralCauses writes glossary and hints to stdout
 */
function renderFooter(glossary: GlossaryEntry[], hints: HintEntry[]): void {
  logger.log("");
  logger.log(colors.bold("Glossary:"));
  logger.log("");
  for (const entry of glossary) {
    logger.log(
      `${colors.cyan(entry.term)} ${colors.dim("\u2014")} ${colors.dim(entry.definition)}`,
    );
  }

  logger.log("");
  logger.log(colors.bold("Next steps:"));
  logger.log("");
  for (const hint of hints) {
    logger.log(
      `${colors.cyan(hint.command)} ${colors.dim("\u2014")} ${colors.dim(hint.description)}`,
    );
  }
  logger.log("");
}

export { renderFooter };
export type { GlossaryEntry, HintEntry };
