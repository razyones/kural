/**
 * Pins a snapshot with a human-readable name so it is
 * exempt from automatic eviction. It is the only command that
 * assigns pin names — no other command writes pin metadata.
 */

import { currentBranch } from "../../../../db/snapshot.ts";
import { define } from "gunshi";
import { logger } from "../../../ui/log.ts";
import { pinSnapshot } from "../../../../db/pin.ts";

/**
 * Handles the snapshot pin command.
 * @param values - Parsed CLI arguments
 * @returns Resolves when the snapshot has been pinned
 * @kuralCauses writes pin metadata to a snapshot database
 */
async function handlePin(values: { id: string; name: string }): Promise<void> {
  const root = process.cwd();
  const branch = currentBranch();
  try {
    await pinSnapshot(root, branch, values.id, values.name);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : `Failed to pin snapshot ${values.id}`);
    process.exitCode = 1;
    return;
  }
  logger.success(`Pinned ${values.id} as "${values.name}"`);
}

export default define({
  name: "pin",
  description: "Pin a snapshot with a name (prevents automatic eviction)",
  args: {
    id: {
      type: "positional" as const,
      description: "Snapshot ID or existing pin name",
      required: true,
    },
    name: {
      type: "positional" as const,
      description: "Pin name to assign",
      required: true,
    },
  },
  run: async (ctx) => {
    await handlePin(ctx.values);
  },
});
