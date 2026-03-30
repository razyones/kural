/**
 * The voice. Provides the shared cliui instance and reusable log
 * patterns for all terminal output. It is the only module that
 * instantiates cliui — no other module creates a UI renderer.
 */

import { cliui } from "@poppinss/cliui";

const ui = cliui();
const { logger, colors } = ui;

const SEPARATOR_WIDTH = 40;

/**
 * Displays a command header with params and an underline separator.
 * @param command - The command being run
 * @param params - Key-value pairs to display
 */
function logBanner(command: string, params: Record<string, string>): void {
  logger.log(`${colors.cyan("kural")} ${colors.dim(`· ${command}`)}`);
  for (const [key, value] of Object.entries(params)) {
    logger.log(`${colors.dim(key)}: ${value}`);
  }
  logger.log(colors.dim("─".repeat(SEPARATOR_WIDTH)));
  logger.log("");
}

export { colors, logBanner, logger, ui };
