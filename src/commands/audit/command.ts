/**
 * The stethoscope. Defines the CLI argument schema and wires user input
 * into the audit pipeline. It is the only module that speaks the Gunshi
 * command protocol for audits — no other module defines audit CLI arguments.
 */

import { countListItems, printListSections } from "../../ui/list.ts";
import { logBanner, logger } from "../../ui/log.ts";
import type { AuditsConfig } from "../../config/audits.ts";
import { define } from "gunshi";
import { formatReport } from "./report.ts";
import { loadProjectConfig } from "../../config/loader.ts";
import { relative } from "node:path";
import { runAudits } from "./pipeline.ts";

const NONE = 0;
const DEFAULT_SENSITIVITY = 2.0;
const DEFAULT_CONTAINMENT_FLOOR = 0.9;
const DEFAULT_MIN_GROUP = 4;
const RADIX = 10;

function resolveConfig(
  values: { sensitivity?: string; containmentFloor?: string; minGroup?: string },
  projectAudits: Partial<AuditsConfig>,
): AuditsConfig {
  return {
    sensitivity:
      parseFloat(values.sensitivity ?? "") || (projectAudits.sensitivity ?? DEFAULT_SENSITIVITY),
    containmentFloor:
      parseFloat(values.containmentFloor ?? "") ||
      (projectAudits.containmentFloor ?? DEFAULT_CONTAINMENT_FLOOR),
    minGroup:
      parseInt(values.minGroup ?? "", RADIX) || (projectAudits.minGroup ?? DEFAULT_MIN_GROUP),
    disable: projectAudits.disable,
  };
}

function parseFilterTerms(filterInput: string): string[] {
  return filterInput
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > NONE);
}

const SHOW_ALL = 0;

async function runAuditCommand(values: {
  sensitivity?: string;
  containmentFloor?: string;
  minGroup?: string;
  filter?: string;
  disable?: string;
  expand?: boolean;
}): Promise<void> {
  const projectConfig = loadProjectConfig();
  const config = resolveConfig(values, projectConfig.audits ?? {});

  const cliDisabled = parseFilterTerms(values.disable ?? "");
  const configDisabled = config.disable ?? [];
  const disabledAudits = new Set([...cliDisabled, ...configDisabled]);
  const limit = values.expand === true ? SHOW_ALL : undefined;

  const root = process.cwd();
  const { report, nodes, dbPath, createdAt } = await runAudits(root, config, disabledAudits);

  const filterTerms = parseFilterTerms(values.filter ?? "");
  const allSections = formatReport(report, nodes, limit);
  const filtered =
    filterTerms.length > NONE
      ? allSections.filter(({ title }) =>
          filterTerms.some((term) => title.toLowerCase().includes(term)),
        )
      : allSections;

  const total = countListItems(filtered);
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
  logBanner("audit", banner);

  printListSections(filtered);

  if (total === NONE) {
    logger.success("No structural issues detected");
  }
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
  },
  run: async (ctx) => {
    await runAuditCommand(ctx.values);
  },
});
