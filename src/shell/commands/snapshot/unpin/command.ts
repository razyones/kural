/**
 * Removes the pin from a snapshot so it becomes
 * eligible for automatic eviction again. It is the only command
 * that clears pin metadata — no other command unpins snapshots.
 */

import { currentBranch } from "../../../../db/snapshot.ts";
import { define } from "gunshi";
import { logger } from "../../../ui/log.ts";
import { unpinSnapshot } from "../../../../db/pin.ts";

/**
 * Handles the snapshot unpin command.
 * @param values - Parsed CLI arguments
 * @returns Resolves when the snapshot has been unpinned
 * @kuralCauses removes pin metadata from a snapshot database
 */
async function handleUnpin(values: { id: string }): Promise<void> {
  const root = process.cwd();
  const branch = currentBranch();
  try {
    await unpinSnapshot(root, branch, values.id);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : `Failed to unpin snapshot ${values.id}`);
    process.exitCode = 1;
    return;
  }
  logger.success(`Unpinned ${values.id}`);
}

export default define({
  name: "unpin",
  description: "Remove a pin from a snapshot (makes it evictable again)",
  args: {
    id: {
      type: "positional" as const,
      description: "Snapshot ID or pin name to unpin",
      required: true,
    },
  },
  run: async (ctx) => {
    await handleUnpin(ctx.values);
  },
});
