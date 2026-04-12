/**
 * Runs all registered audits through a shared context and
 * returns findings grouped by audit name. It is the only entry point for
 * structural auditing — no other module triggers the full audit pipeline.
 */

import type { AuditDefinition, Finding } from "./types.ts";
import type { AuditsConfig } from "../../shell/config/audits.ts";
import type { NodeMap } from "../tree/tree.ts";
import { allAudits } from "./definitions/index.ts";
import { createContext } from "./context.ts";

const NONE = 0;

/** A single audit's results paired with its definition. */
type AuditResult = {
  definition: AuditDefinition;
  findings: Finding[];
};

/** Full audit report — ordered list of results. */
type AuditReport = AuditResult[];

/**
 * Runs all registered audits on a node map.
 * @param nodes - The code tree (flat map with parent pointers)
 * @param config - Sensitivity and tuning parameters
 * @param disabledAudits - Set of audit names to skip
 * @returns Ordered list of audit results with definitions and findings
 * @kuralPure
 */
function detect(
  nodes: NodeMap,
  config: AuditsConfig,
  disabledAudits: Set<string> = new Set(),
): AuditReport {
  const ctx = createContext(nodes, config);
  const report: AuditReport = [];

  for (const audit of allAudits) {
    if (disabledAudits.has(audit.name)) {
      continue;
    }
    const findings = audit.detect(ctx);
    if (findings.length > NONE) {
      report.push({ definition: audit, findings });
    }
  }

  return report;
}

export { detect };
export type { AuditReport, AuditResult };
