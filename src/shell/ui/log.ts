/**
 * Provides the shared cliui instance and reusable log
 * patterns for all terminal output. It is the only module that
 * instantiates cliui — no other module creates a UI renderer.
 */

import { cliui } from "@poppinss/cliui";

const ui = cliui();
const { logger, colors } = ui;

const SEPARATOR_WIDTH = 47;
const OWL_BODY = ["  {\\_/}  ", "  (O,O)  ", "  (:::)  "];
const OWL_FOOT = "  -^-^v--";
const OWL_PAD = " ".repeat(OWL_FOOT.length);

/**
 * Displays a command header with params and an underline separator.
 * @param command - The command being run
 * @param params - Key-value pairs to display
 * @kuralCauses writes banner to stdout
 */
function logBanner(command: string, params: Record<string, string>): void {
  const lines: string[] = [`${colors.cyan("kural")} ${colors.dim(`· ${command}`)}`];
  for (const [key, value] of Object.entries(params)) {
    lines.push(`${colors.dim(key)}: ${value}`);
  }

  const owl = [...OWL_BODY, OWL_FOOT];
  const rowCount = Math.max(owl.length, lines.length);
  for (let i = 0; i < rowCount; i++) {
    const left = i < owl.length ? owl[i] : OWL_PAD;
    const right = i < lines.length ? lines[i] : "";
    logger.log(`${colors.dim(left)}${colors.dim("│")} ${right}`);
  }

  const sepWidth = SEPARATOR_WIDTH - OWL_FOOT.length;
  logger.log(`${OWL_PAD}${colors.dim("└")}${colors.dim("─".repeat(sepWidth))}`);
  logger.log("");
}

export { colors, logBanner, logger, ui };
