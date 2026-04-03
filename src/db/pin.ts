/**
 * The tack. Manages pin metadata on snapshot databases — assigning,
 * moving, and removing human-readable names that protect snapshots
 * from automatic eviction. It is the only module that writes pin
 * metadata — no other module touches the pin_name key.
 */

import { closeSnapshot, getHistorySnapshots, openSnapshot, resolveSnapshot } from "./snapshot.ts";
import { rmSync } from "node:fs";

const PIN_NAME_KEY = "pin_name";

/**
 * Assigns a human-readable label to a snapshot and grants it eviction
 * immunity. Handles move semantics — if the chosen label already belongs
 * to a different snapshot, the old assignment is revoked before the new
 * one is written.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @param idOrName - Snapshot ID or existing pin name to target
 * @param pinName - The pin name to assign
 * @returns Resolves when the pin metadata has been written
 * @kuralPatterns snapshotMutation
 * @kuralCauses writes pin metadata to snapshot databases
 */
async function pinSnapshot(
  root: string,
  branch: string,
  idOrName: string,
  pinName: string,
): Promise<void> {
  const target = resolveSnapshot(root, branch, idOrName);
  if (target === null) {
    throw new Error(`Snapshot not found: ${idOrName}`);
  }

  const snapshots = getHistorySnapshots(root, branch);
  const existing = snapshots.find((s) => s.pinName === pinName);
  if (existing && existing.snapshotId !== target.snapshotId) {
    const snapshot = await openSnapshot(existing.path);
    try {
      const delTx = snapshot.collections.metadata.delete(PIN_NAME_KEY);
      await delTx.isPersisted.promise;
    } finally {
      await closeSnapshot(snapshot);
    }
  }

  const snapshot = await openSnapshot(target.path);
  try {
    const current = snapshot.collections.metadata.get(PIN_NAME_KEY);
    if (current !== undefined) {
      const delTx = snapshot.collections.metadata.delete(PIN_NAME_KEY);
      await delTx.isPersisted.promise;
    }
    const tx = snapshot.collections.metadata.insert([{ key: PIN_NAME_KEY, value: pinName }]);
    await tx.isPersisted.promise;
  } finally {
    await closeSnapshot(snapshot);
  }
}

/**
 * Revokes eviction immunity from a snapshot by clearing its label.
 * The snapshot remains in history but becomes eligible for automatic
 * rotation once the unpinned count exceeds the retention limit.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @param idOrName - Snapshot ID or pin name to unpin
 * @returns Resolves when the pin metadata has been removed
 * @kuralPatterns snapshotMutation
 * @kuralCauses removes pin metadata from snapshot database
 */
async function unpinSnapshot(root: string, branch: string, idOrName: string): Promise<void> {
  const target = resolveSnapshot(root, branch, idOrName);
  if (target === null) {
    throw new Error(`Snapshot not found: ${idOrName}`);
  }
  if (target.pinName === undefined) {
    throw new Error(`Snapshot ${idOrName} is not pinned`);
  }

  const snapshot = await openSnapshot(target.path);
  try {
    const delTx = snapshot.collections.metadata.delete(PIN_NAME_KEY);
    await delTx.isPersisted.promise;
  } finally {
    await closeSnapshot(snapshot);
  }
}

/**
 * Permanently removes a snapshot from history.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @param idOrName - Snapshot ID or pin name to delete
 * @kuralPatterns snapshotMutation
 * @kuralCauses deletes snapshot database file from disk
 */
function deleteSnapshot(root: string, branch: string, idOrName: string): void {
  const target = resolveSnapshot(root, branch, idOrName);
  if (target === null) {
    throw new Error(`Snapshot not found: ${idOrName}`);
  }
  rmSync(target.path);
}

export { deleteSnapshot, pinSnapshot, unpinSnapshot };
