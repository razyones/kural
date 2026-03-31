/**
 * The warehouse. Persists parsed units, score cards, and metadata into
 * snapshot collections. It is the only module that maps domain objects to
 * database rows — no other module decides how units are serialized to storage.
 */

import type { ScoreCard } from "../../sost/score.ts";
import type { SnapshotCollections } from "../../db/collections.ts";
import { parse } from "../../ingestion/parse/pipeline.ts";

const NONE = 0;

/**
 * Records the model identity and creation timestamp so downstream commands can validate cache coherence and display snapshot provenance.
 * @param collections - Snapshot collections to write into
 * @param modelId - Embedding model ID to record
 * @param createdAt - Timestamp in milliseconds since epoch to record
 * @returns Resolves when metadata rows are persisted
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
 * @returns Resolves when all unit rows are persisted
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
 * @returns Resolves when file rows are persisted
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
 * @returns Resolves when type rows are persisted
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
 * @returns Resolves when function rows are persisted
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
 * @returns Resolves when directory rows are persisted
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
 * @returns Resolves when score card rows are persisted
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

export { writeMetadata, writeScoreCards, writeUnits };
