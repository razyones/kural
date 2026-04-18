/**
 * Renders the closing footer for the snapshot generate command —
 * the glossary of reported counts and the suggested follow-up
 * commands. It is the only module that composes the generate
 * command's footer — no other module formats that section for stdout.
 */

import { renderFooter } from "../../../ui/footer.ts";

/**
 * Closes the generate output with term definitions and suggested follow-up commands.
 * @kuralPatterns commandFooter
 * @kuralCauses writes footer sections to stdout
 */
function printGenerateFooter(): void {
  renderFooter(
    [
      { term: "fileCount", definition: "number of source files parsed" },
      { term: "dirCount", definition: "number of directories discovered" },
      {
        term: "unitCount",
        definition: "total units embedded (files + types + functions + dirs)",
      },
    ],
    [
      { command: "kural score", description: "view the overall structural score" },
      { command: "kural score -p <path>", description: "score a specific node" },
      { command: "kural score -e", description: "detailed score breakdown table" },
      { command: "kural snapshot list", description: "list all snapshots" },
      { command: "kural snapshot pin <id> <name>", description: "pin this snapshot" },
    ],
  );
}

export { printGenerateFooter };
