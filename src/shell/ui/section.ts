/**
 * Renders labeled sections with a left vertical gutter that
 * visually connects each item under its title. It is the only module
 * that owns the gutter-sectioned terminal layout — no other module
 * draws bordered groups of related lines.
 */

import { colors, logger } from "./log.ts";
import { icons } from "@poppinss/cliui";

const NONE = 0;
const GUTTER_INDENT = "  ";

const GUTTER = colors.grey().dim(icons.borderVertical);

/**
 * Renders one section: bold label, then each line indented under a
 * dim left gutter, followed by a blank gutter line as a separator.
 * Skips entirely when there are no lines to render.
 * @param label - Section name shown above the gutter
 * @param lines - Pre-formatted body lines (may include ANSI styles)
 * @kuralCauses writes the section block to stdout
 */
function renderSection(label: string, lines: string[]): void {
  if (lines.length === NONE) {
    return;
  }
  logger.log(colors.bold(label));
  for (const line of lines) {
    logger.log(line.length === NONE ? GUTTER : `${GUTTER}${GUTTER_INDENT}${line}`);
  }
  logger.log(GUTTER);
}

export { renderSection };
