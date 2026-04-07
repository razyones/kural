/**
 * The engine. Runs the full generation pipeline — parse, embed, score,
 * store — without any UI or CLI concerns. It is the only module that
 * chains all stages together — no other module orchestrates the full
 * lifecycle.
 */

import type { EmbedOptions, Embedder } from "../../../../analysis/ingestion/embed/pipeline.ts";
import {
  activePath,
  buildSnapshotId,
  closeSnapshot,
  createActive,
  currentBranch,
  currentCommitHash,
  rotateActive,
} from "../../../../db/snapshot.ts";
import { writeMetadata, writeScoreCards, writeUnits } from "./storage.ts";
import { embed } from "../../../../analysis/ingestion/embed/pipeline.ts";
import { loadEmbeddingCache } from "../../../../db/cache.ts";
import { parse } from "../../../../analysis/ingestion/parse/pipeline.ts";
import { pinSnapshot } from "../../../../db/pin.ts";
import { rmSync } from "node:fs";
import { score } from "../../../../analysis/scoring/score.ts";

/**
 * Cleans up after a failed snapshot write by closing the database handle
 * and removing the incomplete file, logging warnings for any cleanup failures.
 * @param close - Async function to close the open snapshot
 * @param dbPath - Path to the incomplete database file to remove
 * @kuralCauses closes snapshot and removes database file
 * @kuralHelper
 */
async function recoverFailedWrite(close: () => Promise<void>, dbPath: string): Promise<void> {
  try {
    await close();
  } catch (closeErr) {
    const msg = closeErr instanceof Error ? closeErr.message : String(closeErr);
    console.error(`Warning: failed to close snapshot during recovery: ${msg}`);
  }
  try {
    rmSync(dbPath);
  } catch (rmErr) {
    const msg = rmErr instanceof Error ? rmErr.message : String(rmErr);
    console.error(`Warning: could not remove incomplete database ${dbPath}: ${msg}`);
  }
}

/** Progress callbacks for each pipeline stage. */
type GenerateCallbacks = {
  onParsed?: (fileCount: number, dirCount: number) => void;
  onEmbedded?: (unitCount: number, cacheHits: number) => void;
  onScored?: (cardCount: number) => void;
  onStored?: (dbPath: string, snapshotId: string) => void;
};

/** Counts and path from a completed generation run. */
type GenerateResult = {
  fileCount: number;
  dirCount: number;
  unitCount: number;
  branch: string;
  dbPath: string;
  snapshotId: string;
};

/**
 * Rotates the previous active database, creates a new one, writes all
 * data, and optionally pins the result.
 * @param root - Absolute path to the project root
 * @param branch - Current git branch name
 * @param result - Parsed codebase to persist
 * @param cards - Computed score cards to persist
 * @param modelId - Embedding model ID for cache validation
 * @param pinName - Optional pin name to assign
 * @returns The database path and snapshot ID
 * @kuralCauses rotates, creates, writes, and optionally pins a snapshot
 */
async function persistSnapshot(
  root: string,
  branch: string,
  result: Awaited<ReturnType<typeof parse>>,
  cards: ReturnType<typeof score>,
  modelId: string,
  pinName?: string,
): Promise<{ dbPath: string; snapshotId: string }> {
  await rotateActive(root, branch);
  const snapshot = await createActive(root, branch);
  const dbPath = activePath(root, branch);

  const createdAt = Date.now();
  const commitHash = currentCommitHash();
  const snapshotId = buildSnapshotId(createdAt, commitHash);

  try {
    await writeMetadata(snapshot.collections, modelId, createdAt, commitHash);
    await writeUnits(snapshot.collections, result);
    await writeScoreCards(snapshot.collections, cards);
  } catch (err) {
    await recoverFailedWrite(async () => {
      await closeSnapshot(snapshot);
    }, dbPath);
    throw new Error(
      `Failed to write snapshot data — re-run generate to retry: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  await closeSnapshot(snapshot);

  if (pinName !== undefined) {
    try {
      await pinSnapshot(root, branch, snapshotId, pinName);
    } catch (err) {
      throw new Error(`Snapshot created but pinning failed`, { cause: err });
    }
  }

  return { dbPath, snapshotId };
}

/**
 * Runs the full generation pipeline: parse → embed → score → store.
 * @param root - Absolute path to the project root (where .kural-db lives)
 * @param targetPath - Absolute path to the directory to parse
 * @param embedder - Function that converts text to embedding vectors
 * @param embedOptions - Embedding configuration
 * @param modelId - Embedding model ID for cache validation
 * @param callbacks - Optional progress callbacks
 * @param pinName - Optional pin name to assign to the new snapshot
 * @returns Counts and database path from the completed run
 * @kuralCauses orchestrates parsing, embedding, scoring, and database persistence
 */
async function generate(
  root: string,
  targetPath: string,
  embedder: Embedder,
  embedOptions: EmbedOptions,
  modelId: string,
  callbacks?: GenerateCallbacks,
  pinName?: string,
): Promise<GenerateResult> {
  const result = await parse(targetPath);
  const fileCount = Object.keys(result.files).length;
  const dirCount = Object.keys(result.directories).length;
  callbacks?.onParsed?.(fileCount, dirCount);

  const branch = currentBranch();
  const cache = await loadEmbeddingCache(root, branch, modelId);
  const { total: unitCount, cacheHits } = await embed(result, embedder, embedOptions, cache);
  callbacks?.onEmbedded?.(unitCount, cacheHits);

  const cards = score(result);
  callbacks?.onScored?.(cards.length);

  const { dbPath, snapshotId } = await persistSnapshot(
    root,
    branch,
    result,
    cards,
    modelId,
    pinName,
  );
  callbacks?.onStored?.(dbPath, snapshotId);

  return { fileCount, dirCount, unitCount, branch, dbPath, snapshotId };
}

export { generate };
export type { GenerateCallbacks, GenerateResult };
