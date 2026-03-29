/**
 * The assembler. Creates typed TanStack DB collections backed by a SQLite
 * database file. It is the only module that wires schemas to persistence —
 * no other module creates or configures collections.
 */

import type {
  DirectoryRow,
  FileRow,
  FunctionRow,
  MetadataRow,
  ScoreRow,
  TypeRow,
} from "./schemas.ts";
import {
  createNodeSQLitePersistence,
  persistedCollectionOptions,
} from "@tanstack/node-db-sqlite-persistence";
import type { Collection } from "@tanstack/db";
import type Database from "better-sqlite3";
import { createCollection } from "@tanstack/db";

const SCHEMA_VERSION = 1;
const SEP = "\0";

/** A persisted collection with string keys. */
type Persisted<T extends object> = Collection<T, string>;

/** All collections for a single snapshot database. */
type SnapshotCollections = {
  files: Persisted<FileRow>;
  types: Persisted<TypeRow>;
  functions: Persisted<FunctionRow>;
  directories: Persisted<DirectoryRow>;
  scores: Persisted<ScoreRow>;
  metadata: Persisted<MetadataRow>;
};

/**
 * Creates a single persisted collection for the given entity type.
 */
function persisted<T extends object>(
  database: Database.Database,
  id: string,
  getKey: (item: T) => string,
): Persisted<T> {
  return createCollection(
    persistedCollectionOptions<T, string>({
      id,
      getKey,
      persistence: createNodeSQLitePersistence<T, string>({ database }),
      schemaVersion: SCHEMA_VERSION,
    }),
  );
}

/**
 * Creates all six collections for a snapshot, backed by a SQLite database.
 * @param database - A better-sqlite3 Database instance
 * @returns Typed collections for files, types, functions, directories, scores, metadata
 */
function createSnapshotCollections(database: Database.Database): SnapshotCollections {
  return {
    files: persisted<FileRow>(database, "files", (item) => item.path),
    types: persisted<TypeRow>(database, "types", (item) => `${item.path}${SEP}${item.name}`),
    functions: persisted<FunctionRow>(
      database,
      "functions",
      (item) => `${item.path}${SEP}${item.name}`,
    ),
    directories: persisted<DirectoryRow>(database, "directories", (item) => item.path),
    scores: persisted<ScoreRow>(database, "scores", (item) => item.key),
    metadata: persisted<MetadataRow>(database, "metadata", (item) => item.key),
  };
}

/**
 * Preloads all collections from the database into memory.
 * Must be called before reading from any collection.
 * @param collections - The snapshot collections to preload
 */
async function preloadAll(collections: SnapshotCollections): Promise<void> {
  await Promise.all([
    collections.files.preload(),
    collections.types.preload(),
    collections.functions.preload(),
    collections.directories.preload(),
    collections.scores.preload(),
    collections.metadata.preload(),
  ]);
}

/**
 * Cleans up all collections. Call before closing the database.
 * @param collections - The snapshot collections to clean up
 */
async function cleanupAll(collections: SnapshotCollections): Promise<void> {
  await Promise.all([
    collections.files.cleanup(),
    collections.types.cleanup(),
    collections.functions.cleanup(),
    collections.directories.cleanup(),
    collections.scores.cleanup(),
    collections.metadata.cleanup(),
  ]);
}

export { cleanupAll, createSnapshotCollections, preloadAll, SCHEMA_VERSION };
export type { SnapshotCollections };
