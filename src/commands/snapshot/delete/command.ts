/**
 * The eraser. Permanently removes a snapshot from history.
 * It is the only command that deletes snapshot database files —
 * no other command besides automatic eviction removes snapshots.
 */

import { currentBranch } from "../../../db/snapshot.ts";
import { define } from "gunshi";
import { deleteSnapshot } from "../../../db/pin.ts";
import { logger } from "../../../ui/log.ts";

/**
 * Handles the snapshot delete command.
 * @param values - Parsed CLI arguments
 * @kuralCauses deletes a snapshot database file from disk
 */
function handleDelete(values: { id: string }): void {
  const root = process.cwd();
  const branch = currentBranch();
  try {
    deleteSnapshot(root, branch, values.id);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : `Failed to delete snapshot ${values.id}`);
    process.exitCode = 1;
    return;
  }
  logger.success(`Deleted snapshot ${values.id}`);
}

export default define({
  name: "delete",
  description: "Permanently remove a snapshot from history",
  args: {
    id: {
      type: "positional" as const,
      description: "Snapshot ID or pin name to delete",
      required: true,
    },
  },
  run: (ctx) => {
    handleDelete(ctx.values);
  },
});
