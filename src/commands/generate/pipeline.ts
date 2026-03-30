/**
 * The engine. Runs the full generation pipeline — parse, embed, score,
 * store — without any UI or CLI concerns. It is the only module that
 * chains all stages together — no other module orchestrates the full
 * lifecycle.
 */

import type { EmbedOptions, Embedder } from "../../ingestion/embed/pipeline.ts";
import { closeSnapshot, createActive, currentBranch, rotateActive } from "../../db/snapshot.ts";
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
  onStored?: (dbPath: string) => void;
};

/** Counts and path from a completed generation run. */
type GenerateResult = {
  fileCount: number;
  dirCount: number;
  unitCount: number;
  branch: string;
  dbPath: string;
};

/**
 * Writes metadata entries to the snapshot.
 */
async function writeMetadata(collections: SnapshotCollections, modelId: string): Promise<void> {
  const tx = collections.metadata.insert([
    { key: "created_at", value: String(Date.now()) },
    { key: "model_id", value: modelId },
    { key: "schema_version", value: "1" },
  ]);
  await tx.isPersisted.promise;
}

/**
 * Writes parsed files, types, functions, and directories.
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
 * Writes score cards to the snapshot.
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

  await writeMetadata(snapshot.collections, modelId);
  await writeUnits(snapshot.collections, result);
  await writeScoreCards(snapshot.collections, cards);
  await closeSnapshot(snapshot);
  callbacks?.onStored?.(dbPath);

  return {
    fileCount,
    dirCount,
    unitCount,
    branch,
    dbPath,
  };
}

export { generate };
export type { GenerateCallbacks, GenerateResult };
