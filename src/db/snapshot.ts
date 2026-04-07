/**
 * The librarian. Manages the lifecycle of snapshot database files on disk —
 * creating, rotating, cloning, and evicting them. It is the only module
 * that decides which database files exist and where they live — no other
 * part of the system touches the .kural-db directory structure.
 */

import { buildSnapshotId, currentCommitHash } from "./git.ts";
import { cleanupAll, createSnapshotCollections, preloadAll } from "./collections.ts";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import BetterSqlite3 from "better-sqlite3";
import type { SnapshotCollections } from "./collections.ts";
import { join } from "node:path";
import { readPinName } from "./read-pin.ts";

const DB_DIR = ".kural-db";
const HISTORY_DIR = "history";
const ACTIVE_NAME = "active.db";
const ADVISE_NAME = "advise.db";
const HISTORY_SUFFIX = ".db";
const MAX_HISTORY = 10;
const SNAPSHOT_ID_PATTERN = /^(\d+)-([a-f0-9]+)\.db$/;
const MATCH_TIMESTAMP = 1;

/** Metadata for a single snapshot database file. */
type SnapshotInfo = {
  path: string;
  snapshotId: string;
  timestamp: number;
  pinName?: string;
};

/** An open snapshot with its database handle and collections. */
type OpenSnapshot = {
  database: BetterSqlite3.Database;
  collections: SnapshotCollections;
};

/**
 * Resolves the branch directory path.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @returns Absolute path to the branch database directory
 * @kuralPure
 */
function branchDir(root: string, branch: string): string {
  return join(root, DB_DIR, branch);
}

/**
 * Resolves the history subdirectory path.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @returns Absolute path to the history subdirectory
 * @kuralPure
 */
function historyDir(root: string, branch: string): string {
  return join(branchDir(root, branch), HISTORY_DIR);
}

/**
 * Resolves the active database file path.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @returns Absolute path to the active database file
 * @kuralPure
 */
function activePath(root: string, branch: string): string {
  return join(branchDir(root, branch), ACTIVE_NAME);
}

/**
 * Resolves the advise database file path.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @returns Absolute path to the advise database file
 * @kuralPure
 */
function advisePath(root: string, branch: string): string {
  return join(branchDir(root, branch), ADVISE_NAME);
}

/**
 * Opens an existing snapshot database and preloads all collections.
 * @param dbPath - Absolute path to the SQLite database file
 * @returns The opened snapshot with database handle and preloaded collections
 * @kuralCauses opens SQLite database and preloads collections
 */
async function openSnapshot(dbPath: string): Promise<OpenSnapshot> {
  let database: BetterSqlite3.Database;
  try {
    database = new BetterSqlite3(dbPath);
  } catch (err) {
    throw new Error(
      `Failed to open database ${dbPath}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  try {
    const collections = createSnapshotCollections(database);
    await preloadAll(collections);
    return { database, collections };
  } catch (err) {
    database.close();
    throw new Error(
      `Failed to initialize snapshot ${dbPath}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

/**
 * Creates a fresh active database with initialized collections.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @returns The opened snapshot with database handle and preloaded collections
 * @kuralCauses creates directories and opens a new SQLite database
 */
async function createActive(root: string, branch: string): Promise<OpenSnapshot> {
  try {
    mkdirSync(historyDir(root, branch), { recursive: true });
  } catch (err) {
    throw new Error(
      `Failed to create database directory: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  const snapshot = await openSnapshot(activePath(root, branch));
  return snapshot;
}

/**
 * Closes a snapshot, cleaning up collections and the database handle.
 * @param snapshot - The open snapshot to close
 * @returns Promise that resolves when the snapshot is fully closed
 * @kuralCauses cleans up collections and closes database
 */
async function closeSnapshot(snapshot: OpenSnapshot): Promise<void> {
  await cleanupAll(snapshot.collections);
  snapshot.database.close();
}

/**
 * Rotates the active database into the history directory with a
 * snapshot ID of `<timestamp>-<commit-hash>`.
 * Evicts the oldest history file if the count exceeds the maximum.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @returns Promise that resolves when rotation and eviction are complete
 * @kuralCauses moves active database to history and evicts old snapshots
 */
async function rotateActive(root: string, branch: string): Promise<void> {
  const active = activePath(root, branch);
  if (!existsSync(active)) {
    return;
  }

  const snapshot = await openSnapshot(active);
  const metaTimestamp = snapshot.collections.metadata.get("created_at");
  const metaCommitHash = snapshot.collections.metadata.get("commit_hash");
  await closeSnapshot(snapshot);

  const timestamp = metaTimestamp === undefined ? Date.now() : Number(metaTimestamp.value);
  const commitHash = metaCommitHash === undefined ? currentCommitHash() : metaCommitHash.value;
  const snapshotId = buildSnapshotId(timestamp, commitHash);
  const historyPath = join(historyDir(root, branch), `${snapshotId}${HISTORY_SUFFIX}`);

  try {
    mkdirSync(historyDir(root, branch), { recursive: true });
    renameSync(active, historyPath);
  } catch (err) {
    throw new Error(
      `Failed to rotate active database to history: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const snapshots = getHistorySnapshots(root, branch);
  const unpinned = snapshots.filter((s) => s.pinName === undefined);
  while (unpinned.length > MAX_HISTORY) {
    const oldest = unpinned.shift();
    if (oldest) {
      try {
        rmSync(oldest.path);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Warning: eviction failed for ${oldest.snapshotId}: ${msg}`);
      }
    }
  }
}

/**
 * Lists all history snapshots sorted by timestamp ascending.
 * Reads pin metadata from each snapshot database.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @returns Array of snapshot info objects sorted by timestamp ascending
 * @kuralCauses reads the history directory and opens each snapshot to read pin metadata
 */
function getHistorySnapshots(root: string, branch: string): SnapshotInfo[] {
  const dir = historyDir(root, branch);
  if (!existsSync(dir)) {
    return [];
  }
  const entries = readdirSync(dir);
  const snapshots: SnapshotInfo[] = [];

  for (const entry of entries) {
    const match = SNAPSHOT_ID_PATTERN.exec(entry);
    if (match) {
      const path = join(dir, entry);
      snapshots.push({
        path,
        snapshotId: entry.replace(HISTORY_SUFFIX, ""),
        timestamp: Number(match[MATCH_TIMESTAMP]),
        pinName: readPinName(path),
      });
    }
  }

  snapshots.sort((a, b) => a.timestamp - b.timestamp);
  return snapshots;
}

/**
 * Copies the active database to the advise file for simulation.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @returns The absolute path to the newly created advise database file
 * @kuralCauses copies active database file to advise path
 */
function cloneActiveToAdvise(root: string, branch: string): string {
  const active = activePath(root, branch);
  if (!existsSync(active)) {
    throw new Error("No active database to clone — run generate first");
  }
  const advise = advisePath(root, branch);
  try {
    copyFileSync(active, advise);
  } catch (err) {
    throw new Error(
      `Failed to clone active database to ${advise}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  return advise;
}

/**
 * Deletes the advise database file if it exists.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @kuralCauses deletes advise database file from disk
 */
function deleteAdvise(root: string, branch: string): void {
  const advise = advisePath(root, branch);
  try {
    if (existsSync(advise)) {
      rmSync(advise);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Warning: advise cleanup failed: ${msg}`);
  }
}

/**
 * Resolves a snapshot by ID or pin name.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @param idOrName - Optional snapshot ID or pin name
 * @returns The resolved snapshot info, or null if not found
 * @kuralCauses reads the history directory and snapshot metadata
 */
function resolveSnapshot(root: string, branch: string, idOrName?: string): SnapshotInfo | null {
  if (idOrName === undefined) {
    return null;
  }
  const snapshots = getHistorySnapshots(root, branch);
  return (
    snapshots.find((s) => s.snapshotId === idOrName) ??
    snapshots.find((s) => s.pinName === idOrName) ??
    null
  );
}

export { buildSnapshotId, currentBranch, currentCommitHash } from "./git.ts";
export {
  activePath,
  cloneActiveToAdvise,
  closeSnapshot,
  createActive,
  deleteAdvise,
  getHistorySnapshots,
  openSnapshot,
  resolveSnapshot,
  rotateActive,
};
export type { OpenSnapshot, SnapshotInfo };
