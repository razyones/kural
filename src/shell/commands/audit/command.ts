/**
 * The console. Defines the CLI argument schema and wires user input
 * to the diagnostic engine. It is the only module that speaks the Gunshi
 * command protocol for issue inspection — no other module defines
 * diagnostic CLI arguments.
 */

import { buildBanner, formatReport, printAuditFooter, printJson } from "./display.ts";
import { countListItems, printListSections } from "../../ui/list.ts";
import { logBanner, logger } from "../../ui/log.ts";
import { clampAudits } from "../../config/validate.ts";
import { define } from "gunshi";
import { loadProjectConfig } from "../../config/loader.ts";
import { parseAuditFlags } from "./parse-flags.ts";
import { runAudits } from "./pipeline.ts";

const NONE = 0;

/**
 * Splits the CLI filter flag into normalized category names so the report
 * renderer can selectively show matching sections. Replaces hyphens with
 * spaces so `--filter outliers` matches the title "Outliers".
 * @param filterInput - Comma-separated string of filter terms
 * @returns Array of normalized filter terms
 * @kuralPure
 * @kuralHelper
 */
function parseFilterTerms(filterInput: string): string[] {
  return filterInput
    .split(",")
    .map((term) => term.trim().toLowerCase().replaceAll("-", " "))
    .filter((term) => term.length > NONE);
}

const SHOW_ALL = 0;

/**
 * Orchestrates the full audit flow — loads the stored snapshot, runs detection, filters results, and renders the diagnostic report.
 * @param values - Parsed CLI argument values for the audit command
 * @returns Resolves when audit output has been printed to stdout
 * @kuralCauses orchestrates audit pipeline with database I/O and stdout
 */
async function runAuditCommand(values: {
  sensitivity?: string;
  filter?: string;
  disable?: string;
  expand?: boolean;
  json?: boolean;
}): Promise<void> {
  const projectConfig = loadProjectConfig();
  const { config: rawConfig, disabledAudits } = parseAuditFlags(values, projectConfig.audits ?? {});
  const { config, warnings } = clampAudits(rawConfig);
  for (const w of warnings) {
    console.error(`Warning: ${w}`);
  }
  const jsonMode = values.json === true;

  const root = process.cwd();
  const { report, nodes, dbPath, createdAt } = await runAudits(root, config, disabledAudits);
  const filterTerms = parseFilterTerms(values.filter ?? "");

  if (jsonMode) {
    printJson(root, dbPath, createdAt, report, filterTerms);
    return;
  }

  const limit = values.expand === true ? SHOW_ALL : undefined;
  const allSections = formatReport(report, nodes, limit);
  const filtered =
    filterTerms.length > NONE
      ? allSections.filter(({ title }) =>
          filterTerms.some((term) => title.toLowerCase().includes(term)),
        )
      : allSections;

  const total = countListItems(filtered);
  logBanner("audit", buildBanner(root, dbPath, createdAt, total, filterTerms, disabledAudits));
  printListSections(filtered);

  if (total === NONE) {
    logger.success("No structural issues detected");
  }

  printAuditFooter();
}

export default define({
  name: "audit",
  description: "Run structural audits on a codebase snapshot",
  args: {
    sensitivity: {
      type: "string" as const,
      short: "k",
      description: "Standard deviations from mean to flag (default: 2.0)",
    },
    filter: {
      type: "string" as const,
      short: "f",
      description: "Comma-separated audit categories to show (e.g. outliers,duplicates)",
    },
    disable: {
      type: "string" as const,
      short: "d",
      description: "Comma-separated audit names to skip (e.g. incomplete-docs,identity-language)",
    },
    expand: {
      type: "boolean" as const,
      short: "e",
      description: "Show all findings per audit (no truncation)",
    },
    json: {
      type: "boolean" as const,
      description: "Output result as JSON",
    },
  },
  run: async (ctx) => {
    await runAuditCommand(ctx.values);
  },
});
