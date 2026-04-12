/**
 * Opens a snapshot, builds the code tree, and delegates to
 * the detection engine for the audit command. It is the only module
 * that orchestrates the snapshot-to-findings flow — no other module
 * wires the stored tree to the detection engine for structural checks.
 */

import { activePath, closeSnapshot, currentBranch, openSnapshot } from "../../../db/snapshot.ts";
import type { AuditReport } from "../../../analysis/audits/detect.ts";
import type { AuditsConfig } from "../../config/audits.ts";
import type { NodeMap } from "../../../analysis/tree/tree.ts";
import { buildTree } from "../../../analysis/tree/tree.ts";
import { detect } from "../../../analysis/audits/detect.ts";
import { existsSync } from "node:fs";
import { rebuildParseResult } from "../../../db/rebuild.ts";

/** Result from the audit pipeline. */
type AuditPipelineResult = {
  report: AuditReport;
  nodes: NodeMap;
  dbPath: string;
  createdAt: number | null;
};

/**
 * Runs the audit pipeline: read snapshot → build tree → detect findings.
 * @param root - Absolute path to the project root
 * @param config - Audit sensitivity and tuning parameters
 * @param disabledAudits - Set of audit names to skip
 * @returns The audit report and the node map used for formatting
 * @kuralCauses reads snapshot database and runs detection
 */
async function runAudits(
  root: string,
  config: AuditsConfig,
  disabledAudits: Set<string> = new Set(),
): Promise<AuditPipelineResult> {
  const branch = currentBranch();
  const dbPath = activePath(root, branch);
  if (!existsSync(dbPath)) {
    throw new Error("No active database found — run generate first");
  }

  const snapshot = await openSnapshot(dbPath);

  try {
    const result = rebuildParseResult(snapshot.collections);
    const nodes = buildTree(result);

    let createdAt: number | null = null;
    const metaCreatedAt = snapshot.collections.metadata.get("created_at");
    if (metaCreatedAt !== undefined) {
      createdAt = Number(metaCreatedAt.value);
    }

    const report = detect(nodes, config, disabledAudits);
    return { report, nodes, dbPath, createdAt };
  } finally {
    await closeSnapshot(snapshot);
  }
}

export { runAudits };
export type { AuditPipelineResult };
