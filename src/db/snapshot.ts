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
import { join } from "node:path";

const DB_DIR = ".kural-db";
const HISTORY_DIR = "history";
const ACTIVE_NAME = "kural-active.db";
const ADVISE_NAME = "kural-active-advise.db";
const HISTORY_PREFIX = "kural-history-";
const HISTORY_SUFFIX = ".db";
const MAX_HISTORY = 10;
const TIMESTAMP_PATTERN = /^kural-history-(\d+)\.db$/;
const MATCH_GROUP = 1;

/** Metadata for a single snapshot database file. */
type SnapshotInfo = {
  path: string;
  timestamp: number;
};

/** An open snapshot with its database handle and collections. */
type OpenSnapshot = {
  database: BetterSqlite3.Database;
  collections: SnapshotCollections;
};

/**
 * Resolves the history subdirectory path for a project root.
 * @param root - Absolute path to the project root
 * @returns Absolute path to the .kural-db/history directory
 */
function historyDir(root: string): string {
  return join(root, DB_DIR, HISTORY_DIR);
}

/**
 * Resolves the active database file path for a project root.
 * @param root - Absolute path to the project root
 * @returns Absolute path to kural-active.db
 */
function activePath(root: string): string {
  return join(root, DB_DIR, ACTIVE_NAME);
}

/**
 * Resolves the advise database file path for a project root.
 * @param root - Absolute path to the project root
 * @returns Absolute path to kural-active-advise.db
 */
function advisePath(root: string): string {
  return join(root, DB_DIR, ADVISE_NAME);
}

/**
 * Opens an existing snapshot database and preloads all collections.
 * @param dbPath - Absolute path to the database file
 * @returns An open snapshot with database handle and collections
 */
async function openSnapshot(dbPath: string): Promise<OpenSnapshot> {
  const database = new BetterSqlite3(dbPath);
  const collections = createSnapshotCollections(database);
  await preloadAll(collections);
  return { database, collections };
}

/**
 * Creates a fresh active database with initialized collections.
 * @param root - Absolute path to the project root
 * @returns An open snapshot for writing
 */
async function createActive(root: string): Promise<OpenSnapshot> {
  mkdirSync(historyDir(root), { recursive: true });
  const path = activePath(root);
  const snapshot = await openSnapshot(path);
  return snapshot;
}

/**
 * Closes a snapshot, cleaning up collections and the database handle.
 * @param snapshot - The open snapshot to close
 */
async function closeSnapshot(snapshot: OpenSnapshot): Promise<void> {
  await cleanupAll(snapshot.collections);
  snapshot.database.close();
}

/**
 * Reads the creation timestamp from an active database's metadata.
 * Falls back to the current time if unavailable.
 * @param root - Absolute path to the project root
 * @returns The creation timestamp in milliseconds
 */
async function readCreatedAt(root: string): Promise<number> {
  const path = activePath(root);
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
 * Rotates the active database into the history directory.
 * Evicts the oldest history file if the count exceeds the maximum.
 * @param root - Absolute path to the project root
 */
async function rotateActive(root: string): Promise<void> {
  const active = activePath(root);
  if (!existsSync(active)) {
    return;
  }

  const timestamp = await readCreatedAt(root);
  const historyName = `${HISTORY_PREFIX}${String(timestamp)}${HISTORY_SUFFIX}`;
  const historyPath = join(historyDir(root), historyName);

  mkdirSync(historyDir(root), { recursive: true });
  renameSync(active, historyPath);

  const snapshots = getHistorySnapshots(root);
  while (snapshots.length > MAX_HISTORY) {
    const oldest = snapshots.shift();
    if (oldest) {
      rmSync(oldest.path);
    }
  }
}

/**
 * Lists all history snapshots sorted by timestamp ascending.
 * @param root - Absolute path to the project root
 * @returns Array of snapshot metadata ordered by creation time
 */
function getHistorySnapshots(root: string): SnapshotInfo[] {
  const dir = historyDir(root);
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir);
  const snapshots: SnapshotInfo[] = [];

  for (const entry of entries) {
    const match = TIMESTAMP_PATTERN.exec(entry);
    if (match) {
      snapshots.push({
        path: join(dir, entry),
        timestamp: Number(match[MATCH_GROUP]),
      });
    }
  }

  snapshots.sort((a, b) => a.timestamp - b.timestamp);
  return snapshots;
}

/**
 * Copies the active database to the advise file for simulation.
 * @param root - Absolute path to the project root
 * @returns Absolute path to the created advise database file
 */
function cloneActiveToAdvise(root: string): string {
  const active = activePath(root);
  if (!existsSync(active)) {
    throw new Error("No active database to clone — run generate first");
  }

  const advise = advisePath(root);
  copyFileSync(active, advise);
  return advise;
}

/**
 * Deletes the advise database file if it exists.
 * @param root - Absolute path to the project root
 */
function deleteAdvise(root: string): void {
  const advise = advisePath(root);
  if (existsSync(advise)) {
    rmSync(advise);
  }
}

export {
  activePath,
  cloneActiveToAdvise,
  closeSnapshot,
  createActive,
  deleteAdvise,
  getHistorySnapshots,
  openSnapshot,
  rotateActive,
};
export type { OpenSnapshot, SnapshotInfo };
