/**
 * The console. Defines the CLI argument schema and wires user input
 * to the diagnostic engine. It is the only module that speaks the Gunshi
 * command protocol for issue inspection — no other module defines
 * diagnostic CLI arguments.
 */

import { countListItems, printListSections } from "../../ui/list.ts";
import { logBanner, logger } from "../../ui/log.ts";
import type { AuditReport } from "../../../analysis/audits/detect.ts";
import { clampAudits } from "../../config/validate.ts";
import { define } from "gunshi";
import { formatReport } from "./report.ts";
import { loadProjectConfig } from "../../config/loader.ts";
import { parseAuditFlags } from "./parse-flags.ts";
import { relative } from "node:path";
import { renderFooter } from "../../ui/footer.ts";
import { runAudits } from "./pipeline.ts";

const NONE = 0;
const JSON_INDENT = 2;

/**
 * Splits a comma-separated string into trimmed, lowercased, non-empty terms.
 * @param input - Comma-separated string to split
 * @returns Array of trimmed, lowercased, non-empty terms
 * @kuralPure
 * @kuralHelper
 */
function splitTerms(input: string): string[] {
  return input
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > NONE);
}

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
  return splitTerms(filterInput).map((term) => term.replaceAll("-", " "));
}

const SHOW_ALL = 0;

/**
 * Serializes the audit report into a machine-readable JSON structure for programmatic consumers.
 * @param root - Absolute project root for relative path display
 * @param dbPath - Path to the snapshot database
 * @param createdAt - Snapshot creation timestamp (ms since epoch) or null
 * @param report - Ordered audit results with definitions and findings
 * @param filterTerms - Category filter terms to apply before output
 * @kuralCauses writes JSON to stdout
 */
function printJson(
  root: string,
  dbPath: string,
  createdAt: number | null,
  report: AuditReport,
  filterTerms: string[],
): void {
  const filtered =
    filterTerms.length > NONE
      ? report.filter(({ definition }) =>
          filterTerms.some((term) => definition.title.toLowerCase().includes(term)),
        )
      : report;

  const audits = filtered.map(({ definition, findings }) => ({
    name: definition.name,
    title: definition.title,
    count: findings.length,
    findings,
  }));

  const total = audits.reduce((sum, a) => sum + a.count, NONE);
  const output = {
    snapshot: relative(root, dbPath) || dbPath,
    createdAt: createdAt === null ? null : new Date(createdAt).toISOString(),
    total,
    audits,
  };

  console.log(JSON.stringify(output, null, JSON_INDENT));
}

/**
 * Closes the audit output with term definitions and suggested follow-up commands.
 * @kuralPatterns commandFooter
 * @kuralCauses writes footer sections to stdout
 */
function printAuditFooter(): void {
  renderFooter(
    [
      { term: "Similarity", definition: "cosine similarity between embedding vectors (0–100%)" },
      {
        term: "Dominant / next",
        definition: "highest and second-highest child-to-parent similarity",
      },
      {
        term: "Identity-content",
        definition: "alignment between a container's name and its actual contents",
      },
      { term: "Axis score", definition: "is-does linguistic measurement for descriptions" },
      {
        term: "clusters",
        definition: "groups of semantically similar children suggesting a split",
      },
      { term: "fence", definition: "statistical threshold computed from group distribution" },
      { term: "group", definition: "the peer set used as baseline for comparison" },
    ],
    [
      { command: "kural audit -f <category>", description: "filter by audit category" },
      { command: "kural audit -e", description: "show all findings per audit (no truncation)" },
      { command: "kural audit -d <name>", description: "disable specific audits" },
      { command: "kural audit -k <n>", description: "adjust sensitivity threshold" },
      { command: "kural audit --json", description: "output result as JSON" },
      {
        command: "kural snapshot generate",
        description: "regenerate snapshot after fixing issues",
      },
    ],
  );
}

/**
 * Builds the audit banner metadata from run context.
 * @param root - Absolute project root for relative path display
 * @param dbPath - Path to the snapshot database
 * @param createdAt - Snapshot creation timestamp (ms since epoch) or null
 * @param total - Total number of identified issues
 * @param filterTerms - Active category filter terms
 * @param disabledAudits - Set of audit names that were skipped
 * @returns Key-value record of banner fields for display
 * @kuralPure
 */
function buildBanner(
  root: string,
  dbPath: string,
  createdAt: number | null,
  total: number,
  filterTerms: string[],
  disabledAudits: Set<string>,
): Record<string, string> {
  const takenOn = createdAt === null ? "unknown" : new Date(createdAt).toLocaleString();
  const banner: Record<string, string> = {
    "on snapshot": relative(root, dbPath) || dbPath,
    "taken on": takenOn,
  };
  if (filterTerms.length > NONE) {
    banner["filter by"] = filterTerms.join(", ");
  }
  if (disabledAudits.size > NONE) {
    banner["disabled"] = [...disabledAudits].join(", ");
  }
  banner["identified issues"] = String(total);
  return banner;
}

/**
 * Orchestrates the full audit flow — loads the stored snapshot, runs detection, filters results, and renders the diagnostic report.
 * @param values - Parsed CLI argument values for the audit command
 * @returns Resolves when audit output has been printed to stdout
 * @kuralCauses orchestrates audit pipeline with database I/O and stdout
 */
async function runAuditCommand(values: {
  sensitivity?: string;
  containmentFloor?: string;
  minGroup?: string;
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
    containmentFloor: {
      type: "string" as const,
      description: "Absolute floor for containment detection (default: 0.9)",
    },
    minGroup: {
      type: "string" as const,
      description: "Minimum group size for statistical tests (default: 4)",
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
