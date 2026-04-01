/**
 * The inventory. Lists all history snapshots for the current branch,
 * showing ID, timestamp, and pin name. It is the only command that
 * enumerates stored snapshots — no other command prints the full list.
 */

import { colors, logBanner, logger } from "../../../ui/log.ts";
import { currentBranch, getHistorySnapshots } from "../../../db/snapshot.ts";
import { define } from "gunshi";

const NONE = 0;
const JSON_INDENT = 2;

/**
 * Handles the snapshot list command.
 * @param values - Parsed CLI arguments
 * @kuralCauses reads history directory and prints snapshot list to stdout
 */
function handleList(values: { json?: boolean }): void {
  const root = process.cwd();
  const branch = currentBranch();
  const snapshots = getHistorySnapshots(root, branch);

  if (values.json === true) {
    const output = snapshots.map((s) => ({
      snapshotId: s.snapshotId,
      timestamp: s.timestamp,
      date: new Date(s.timestamp).toISOString(),
      pinName: s.pinName ?? null,
    }));
    console.log(JSON.stringify(output, null, JSON_INDENT));
    return;
  }

  logBanner("snapshot list", { branch });

  if (snapshots.length === NONE) {
    logger.warning("No snapshots found. Run snapshot generate first.");
    return;
  }

  for (const s of snapshots) {
    const date = new Date(s.timestamp).toLocaleString();
    const pinLabel = s.pinName === undefined ? "" : ` ${colors.cyan(`[${s.pinName}]`)}`;
    logger.log(`${colors.dim(date)}  ${s.snapshotId}${pinLabel}`);
  }
  logger.log("");
}

export default define({
  name: "list",
  description: "List all history snapshots for the current branch",
  args: {
    json: {
      type: "boolean" as const,
      description: "Output result as JSON",
    },
  },
  run: (ctx) => {
    handleList(ctx.values);
  },
});
