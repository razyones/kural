/**
 * The engine. Runs the full generation pipeline — parse, embed, score,
 * store — without any UI or CLI concerns. It is the only module that
 * chains all stages together — no other module orchestrates the full
 * lifecycle.
 */

import type { EmbedOptions, Embedder } from "../../ingestion/embed/pipeline.ts";
import {
  buildSnapshotId,
  closeSnapshot,
  createActive,
  currentBranch,
  currentCommitHash,
  rotateActive,
} from "../../db/snapshot.ts";
import type { EmbeddingCache } from "../../ingestion/embed/types.ts";
import type { ScoreCard } from "../../sost/score.ts";
import type { SnapshotCollections } from "../../db/collections.ts";
import { embed } from "../../ingestion/embed/pipeline.ts";
import { parse } from "../../ingestion/parse/pipeline.ts";
import { score } from "../../sost/score.ts";

const NONE = 0;

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
 * Records the model identity and creation timestamp so downstream commands can validate cache coherence and display snapshot provenance.
 * @param collections - Snapshot collections to write into
 * @param modelId - Embedding model ID to record
 * @kuralCauses persists metadata rows to the snapshot database
 */
async function writeMetadata(
  collections: SnapshotCollections,
  modelId: string,
  createdAt: number,
): Promise<void> {
  const tx = collections.metadata.insert([
    { key: "created_at", value: String(createdAt) },
    { key: "model_id", value: modelId },
    { key: "schema_version", value: "1" },
  ]);
  await tx.isPersisted.promise;
}

/**
 * Persists every parsed code unit so the snapshot captures the full structural graph of the codebase.
 * @param collections - Snapshot collections to write into
 * @param result - Parsed codebase with files and directories
 * @kuralCauses persists all unit rows to the snapshot database
 */
async function writeUnits(
  collections: SnapshotCollections,
  result: Awaited<ReturnType<typeof parse>>,
): Promise<void> {
  const files = Object.values(result.files);
  await writeFiles(collections, files);
  await writeTypes(collections, files);
  await writeFunctions(collections, files);
  await writeDirectories(collections, result);
}

/**
 * Persists file-level units with their embeddings and import edges so the snapshot captures the mid-level organizational structure.
 * @param collections - Snapshot collections to write into
 * @param files - Parsed file objects to persist
 * @kuralCauses persists file rows to the snapshot database
 */
async function writeFiles(
  collections: SnapshotCollections,
  files: Awaited<ReturnType<typeof parse>>["files"][string][],
): Promise<void> {
  const rows = files.map((f) => ({
    path: f.path,
    name: f.name,
    description: f.description,
    identityEmbedding: f.identityEmbedding,
    leafEmbedding: f.leafEmbedding,
    facetHash: f.facetHash,
    importsInternal: f.imports.internalImports,
    importsExternal: f.imports.externalImports,
    companion: f.companion,
    residuals: f.residuals,
  }));
  if (rows.length > NONE) {
    const tx = collections.files.insert(rows);
    await tx.isPersisted.promise;
  }
}

/**
 * Persists type units with their field shapes and embeddings so the snapshot captures the declarative schema layer.
 * @param collections - Snapshot collections to write into
 * @param files - Parsed file objects containing types to persist
 * @kuralCauses persists type rows to the snapshot database
 */
async function writeTypes(
  collections: SnapshotCollections,
  files: Awaited<ReturnType<typeof parse>>["files"][string][],
): Promise<void> {
  const rows = files.flatMap((f) =>
    Object.values(f.types).map((t) => ({
      path: t.path,
      name: t.name,
      description: t.description,
      fields: t.fields,
      exported: t.exported,
      refs: t.references,
      util: t.util,
      helper: t.helper,
      residuals: t.residuals,
      identityEmbedding: t.identityEmbedding,
      leafEmbedding: t.leafEmbedding,
      facetHash: t.facetHash,
      patterns: t.patterns,
    })),
  );
  if (rows.length > NONE) {
    const tx = collections.types.insert(rows);
    await tx.isPersisted.promise;
  }
}

/**
 * Persists function units with their signatures, purity annotations, and embeddings so the snapshot captures the behavioral layer.
 * @param collections - Snapshot collections to write into
 * @param files - Parsed file objects containing functions to persist
 * @kuralCauses persists function rows to the snapshot database
 */
async function writeFunctions(
  collections: SnapshotCollections,
  files: Awaited<ReturnType<typeof parse>>["files"][string][],
): Promise<void> {
  const rows = files.flatMap((f) =>
    Object.values(f.functions).map((fn) => ({
      path: fn.path,
      name: fn.name,
      description: fn.description,
      params: fn.params,
      paramNames: fn.paramNames,
      returnsType: fn.returns,
      exported: fn.exported,
      pure: fn.pure,
      util: fn.util,
      helper: fn.helper,
      residuals: fn.residuals,
      causes: fn.causes,
      calls: fn.calls,
      identityEmbedding: fn.identityEmbedding,
      leafEmbedding: fn.leafEmbedding,
      facetHash: fn.facetHash,
      patterns: fn.patterns,
      documentedParams: fn.documentedParams,
      hasReturnDoc: fn.hasReturnDoc,
    })),
  );
  if (rows.length > NONE) {
    const tx = collections.functions.insert(rows);
    await tx.isPersisted.promise;
  }
}

/**
 * Persists directory units with their child lists and embeddings so the snapshot captures the hierarchical container structure.
 * @param collections - Snapshot collections to write into
 * @param result - Parsed codebase with directory objects to persist
 * @kuralCauses persists directory rows to the snapshot database
 */
async function writeDirectories(
  collections: SnapshotCollections,
  result: Awaited<ReturnType<typeof parse>>,
): Promise<void> {
  const rows = Object.values(result.directories).map((d) => ({
    path: d.path,
    name: d.name,
    description: d.description,
    children: d.children,
    identityEmbedding: d.identityEmbedding,
    leafEmbedding: d.leafEmbedding,
    facetHash: d.facetHash,
    residuals: d.residuals,
  }));
  if (rows.length > NONE) {
    const tx = collections.directories.insert(rows);
    await tx.isPersisted.promise;
  }
}

/**
 * Persists computed health metrics so downstream commands can query scores without re-running the pipeline.
 * @param collections - Snapshot collections to write into
 * @param cards - Computed score cards to persist
 * @kuralCauses persists score card rows to the snapshot database
 */
async function writeScoreCards(
  collections: SnapshotCollections,
  cards: ScoreCard[],
): Promise<void> {
  const rows = cards.map((c) => ({
    key: c.key,
    kind: c.kind,
    name: c.name,
    fit: c.fit ?? undefined,
    uniqueness: c.uniqueness,
    score: c.score ?? undefined,
    childrenFit: c.childrenFit ?? undefined,
    childrenUniqueness: c.childrenUniqueness ?? undefined,
    childrenScore: c.childrenScore ?? undefined,
    subtreeFit: c.subtreeFit ?? undefined,
    subtreeUniqueness: c.subtreeUniqueness ?? undefined,
    subtreeScore: c.subtreeScore ?? undefined,
    overallScore: c.overallScore ?? undefined,
    worstPair: c.worstPair ? JSON.stringify(c.worstPair) : undefined,
    bestUncleName: c.bestUncle?.name,
    bestUncleScore: c.bestUncle?.score,
  }));
  if (rows.length > NONE) {
    const tx = collections.scores.insert(rows);
    await tx.isPersisted.promise;
  }
}

/**
 * Runs the full generation pipeline: parse → embed → score → store.
 * @param root - Absolute path to the project root (where .kural-db lives)
 * @param targetPath - Absolute path to the directory to parse
 * @param embedder - Function that converts text to embedding vectors
 * @param embedOptions - Embedding configuration
 * @param modelId - Embedding model ID for cache validation
 * @param cache - Optional embedding cache from previous snapshot
 * @param callbacks - Optional progress callbacks
 * @returns Counts and database path from the completed run
 */
async function generate(
  root: string,
  targetPath: string,
  embedder: Embedder,
  embedOptions: EmbedOptions,
  modelId: string,
  cache?: EmbeddingCache,
  callbacks?: GenerateCallbacks,
): Promise<GenerateResult> {
  const result = await parse(targetPath);
  const fileCount = Object.keys(result.files).length;
  const dirCount = Object.keys(result.directories).length;
  callbacks?.onParsed?.(fileCount, dirCount);

  const { total: unitCount, cacheHits } = await embed(result, embedder, embedOptions, cache);
  callbacks?.onEmbedded?.(unitCount, cacheHits);

  const cards = score(result);
  callbacks?.onScored?.(cards.length);

  const branch = currentBranch();
  await rotateActive(root, branch);
  const snapshot = await createActive(root, branch);
  const dbPath = `${root}/.kural-db/${branch}/active.db`;

  const createdAt = Date.now();
  const snapshotId = buildSnapshotId(createdAt, currentCommitHash());

  await writeMetadata(snapshot.collections, modelId, createdAt);
  await writeUnits(snapshot.collections, result);
  await writeScoreCards(snapshot.collections, cards);
  await closeSnapshot(snapshot);
  callbacks?.onStored?.(dbPath, snapshotId);

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
