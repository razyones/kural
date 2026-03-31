/**
 * The librarian. Manages the lifecycle of snapshot database files on disk —
 * creating, rotating, cloning, and evicting them. It is the only module
 * that decides which database files exist and where they live — no other
 * part of the system touches the .kural-db directory structure.
 */

import { cleanupAll, createSnapshotCollections, preloadAll } from "./collections.ts";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import BetterSqlite3 from "better-sqlite3";
import type { SnapshotCollections } from "./collections.ts";
import { execSync } from "node:child_process";
import { join } from "node:path";

const DB_DIR = ".kural-db";
const HISTORY_DIR = "history";
const ACTIVE_NAME = "active.db";
const ADVISE_NAME = "advise.db";
const HISTORY_SUFFIX = ".db";
const MAX_HISTORY = 10;
const SNAPSHOT_ID_PATTERN = /^(\d+)-([a-f0-9]+)\.db$/;
const MATCH_TIMESTAMP = 1;
const HASH_LENGTH = 7;

/** Metadata for a single snapshot database file. */
type SnapshotInfo = {
  path: string;
  snapshotId: string;
  timestamp: number;
};

/** An open snapshot with its database handle and collections. */
type OpenSnapshot = {
  database: BetterSqlite3.Database;
  collections: SnapshotCollections;
};

/**
 * Detects the current git branch name.
 * Falls back to "main" if not in a git repo.
 * @returns The current git branch name, or "main" as fallback
 * @kuralPatterns gitInfo
 * @kuralCauses runs git rev-parse via execSync
 */
function currentBranch(): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "main";
  }
}

/**
 * Gets the short commit hash of HEAD.
 * Falls back to "0000000" if not in a git repo.
 * @returns The short commit hash of HEAD, or "0000000" as fallback
 * @kuralPatterns gitInfo
 * @kuralCauses runs git rev-parse via execSync
 */
function currentCommitHash(): string {
  try {
    return execSync(`git rev-parse --short=${String(HASH_LENGTH)} HEAD`, {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "0000000";
  }
}

/**
 * Builds a snapshot ID from timestamp and commit hash.
 * @param timestamp - Unix timestamp in milliseconds
 * @param commitHash - Short git commit hash
 * @returns Snapshot ID in the format "<timestamp>-<commitHash>"
 * @kuralPure
 */
function buildSnapshotId(timestamp: number, commitHash: string): string {
  return `${String(timestamp)}-${commitHash}`;
}

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
  const database = new BetterSqlite3(dbPath);
  const collections = createSnapshotCollections(database);
  await preloadAll(collections);
  return { database, collections };
}

/**
 * Creates a fresh active database with initialized collections.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @returns The opened snapshot with database handle and preloaded collections
 * @kuralCauses creates directories and opens a new SQLite database
 */
async function createActive(root: string, branch: string): Promise<OpenSnapshot> {
  mkdirSync(historyDir(root, branch), { recursive: true });
  const path = activePath(root, branch);
  const snapshot = await openSnapshot(path);
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
 * Reads the creation timestamp from an active database's metadata.
 * Falls back to the current time if unavailable.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @returns The creation timestamp in milliseconds
 * @kuralCauses reads metadata from a snapshot database
 */
async function readCreatedAt(root: string, branch: string): Promise<number> {
  const path = activePath(root, branch);
  if (!existsSync(path)) {
    return Date.now();
  }
  try {
    const snapshot = await openSnapshot(path);
    const meta = snapshot.collections.metadata.get("created_at");
    await closeSnapshot(snapshot);
    if (meta !== undefined) {
      return Number(meta.value);
    }
  } catch {
    // Legacy or corrupt DB — fall back
  }
  return Date.now();
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

  const timestamp = await readCreatedAt(root, branch);
  const commitHash = currentCommitHash();
  const snapshotId = buildSnapshotId(timestamp, commitHash);
  const historyPath = join(historyDir(root, branch), `${snapshotId}${HISTORY_SUFFIX}`);

  mkdirSync(historyDir(root, branch), { recursive: true });
  renameSync(active, historyPath);

  const snapshots = getHistorySnapshots(root, branch);
  while (snapshots.length > MAX_HISTORY) {
    const oldest = snapshots.shift();
    if (oldest) {
      rmSync(oldest.path);
    }
  }
}

/**
 * Lists all history snapshots sorted by timestamp ascending.
 * @param root - The project root directory
 * @param branch - The git branch name
 * @returns Array of snapshot info objects sorted by timestamp ascending
 * @kuralCauses reads the history directory listing
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
      const snapshotId = entry.replace(HISTORY_SUFFIX, "");
      snapshots.push({
        path: join(dir, entry),
        snapshotId,
        timestamp: Number(match[MATCH_TIMESTAMP]),
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
  copyFileSync(active, advise);
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
  if (existsSync(advise)) {
    rmSync(advise);
  }
}

export {
  activePath,
  buildSnapshotId,
  cloneActiveToAdvise,
  closeSnapshot,
  createActive,
  currentBranch,
  currentCommitHash,
  deleteAdvise,
  getHistorySnapshots,
  openSnapshot,
  rotateActive,
};
export type { OpenSnapshot, SnapshotInfo };
