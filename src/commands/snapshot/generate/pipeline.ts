/**
 * The engine. Runs the full generation pipeline — parse, embed, score,
 * store — without any UI or CLI concerns. It is the only module that
 * chains all stages together — no other module orchestrates the full
 * lifecycle.
 */

import type { EmbedOptions, Embedder } from "../../../ingestion/embed/pipeline.ts";
import {
  buildSnapshotId,
  closeSnapshot,
  createActive,
  currentBranch,
  currentCommitHash,
  rotateActive,
} from "../../../db/snapshot.ts";
import { writeMetadata, writeScoreCards, writeUnits } from "./storage.ts";
import { embed } from "../../../ingestion/embed/pipeline.ts";
import { loadEmbeddingCache } from "../../../db/cache.ts";
import { parse } from "../../../ingestion/parse/pipeline.ts";
import { pinSnapshot } from "../../../db/pin.ts";
import { score } from "../../../sost/score.ts";

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

  await rotateActive(root, branch);
  const snapshot = await createActive(root, branch);
  const dbPath = `${root}/.kural-db/${branch}/active.db`;

  const createdAt = Date.now();
  const commitHash = currentCommitHash();
  const snapshotId = buildSnapshotId(createdAt, commitHash);

  await writeMetadata(snapshot.collections, modelId, createdAt, commitHash);
  await writeUnits(snapshot.collections, result);
  await writeScoreCards(snapshot.collections, cards);
  await closeSnapshot(snapshot);
  callbacks?.onStored?.(dbPath, snapshotId);

  if (pinName !== undefined) {
    await pinSnapshot(root, branch, snapshotId, pinName);
  }

  return {
    fileCount,
    dirCount,
    unitCount,
    branch,
    dbPath,
    snapshotId,
  };
}

export { generate };
export type { GenerateCallbacks, GenerateResult };
