/**
 * E2E test helpers — temp project creation, CLI spawning, DB seeding.
 */

import type {
  DirectoryRow,
  FileRow,
  FunctionRow,
  ScoreRow,
  TypeRow,
} from "../../src/db/schemas.ts";
import { closeSnapshot, createActive, openSnapshot } from "../../src/db/snapshot.ts";
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const NONE = 0;
const TWO = 2;
const DEFAULT_EXIT = 1;
const TIMEOUT_MS = 30_000;
const CLI_PATH = join(import.meta.dirname, "../../dist/cli.mjs");

/** Result of spawning the CLI. */
type CliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

/**
 * Creates a unique temp directory with `git init` so that
 * `currentBranch()` and `currentCommitHash()` work inside it.
 * Returns the absolute path. Caller must clean up via `cleanupTmpRoot`.
 */
function createTmpRoot(): string {
  const root = join(
    tmpdir(),
    `kural-e2e-${String(Date.now())}-${String(Math.random()).slice(TWO)}`,
  );
  mkdirSync(root, { recursive: true });
  execSync("git init -b main && git commit --allow-empty -m init", {
    cwd: root,
    stdio: "ignore",
  });
  return root;
}

/** Removes a temp root directory. Safe to call if already removed. */
function cleanupTmpRoot(root: string): void {
  if (root !== "" && existsSync(root)) {
    rmSync(root, { recursive: true });
  }
}

/**
 * Spawns `node dist/cli.mjs <args>` with `cwd` set to the given root.
 * Returns stdout, stderr, and exit code. Never throws on non-zero exit.
 */
function runCli(args: string[], cwd: string): CliResult {
  try {
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
      env: { ...process.env, NO_COLOR: "1" },
      timeout: TIMEOUT_MS,
    });
    return { stdout, stderr: "", exitCode: NONE };
  } catch (error: unknown) {
    const obj = error instanceof Object ? error : {};
    const stdout = "stdout" in obj && typeof obj.stdout === "string" ? obj.stdout : "";
    const stderr = "stderr" in obj && typeof obj.stderr === "string" ? obj.stderr : "";
    const status = "status" in obj && typeof obj.status === "number" ? obj.status : DEFAULT_EXIT;
    return { stdout, stderr, exitCode: status };
  }
}

/** Options for seeding a history snapshot beyond metadata. */
type SeedSnapshotOptions = {
  pinName?: string;
  scores?: ScoreRow[];
};

/**
 * Seeds a history snapshot in `.kural-db/<branch>/history/` with
 * metadata rows and optional score rows. Returns the snapshot ID.
 */
async function seedSnapshot(
  root: string,
  branch: string,
  timestamp: number,
  commitHash: string,
  pinOrOptions?: string | SeedSnapshotOptions,
): Promise<string> {
  const opts: SeedSnapshotOptions =
    typeof pinOrOptions === "string" ? { pinName: pinOrOptions } : (pinOrOptions ?? {});
  const histDir = join(root, ".kural-db", branch, "history");
  mkdirSync(histDir, { recursive: true });
  const snapshotId = `${String(timestamp)}-${commitHash}`;
  const dbPath = join(histDir, `${snapshotId}.db`);
  const snapshot = await openSnapshot(dbPath);
  const metaRows = [
    { key: "created_at", value: String(timestamp) },
    { key: "commit_hash", value: commitHash },
    { key: "schema_version", value: "1" },
  ];
  if (opts.pinName !== undefined) {
    metaRows.push({ key: "pin_name", value: opts.pinName });
  }
  const metaTx = snapshot.collections.metadata.insert(metaRows);
  await metaTx.isPersisted.promise;
  if (opts.scores && opts.scores.length > NONE) {
    const scoreTx = snapshot.collections.scores.insert(opts.scores);
    await scoreTx.isPersisted.promise;
  }
  await closeSnapshot(snapshot);
  return snapshotId;
}

/**
 * Extracts the first JSON value (array or object) from CLI stdout,
 * skipping any banner text printed by gunshi before the JSON payload.
 */
function extractJson<T>(stdout: string): T {
  const arrayStart = stdout.indexOf("[");
  const objectStart = stdout.indexOf("{");
  const starts = [arrayStart, objectStart].filter((i) => i >= NONE);
  if (starts.length === NONE) {
    throw new Error(`No JSON found in output:\n${stdout}`);
  }
  const start = Math.min(...starts);
  // eslint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse returns unknown, caller provides T
  return JSON.parse(stdout.slice(start)) as T;
}

/**
 * Seeds an active snapshot (`.kural-db/<branch>/active.db`) with
 * metadata and score rows. Used for `score` and `audit` e2e tests.
 */
async function seedActiveSnapshot(
  root: string,
  branch: string,
  scores: ScoreRow[],
  timestamp?: number,
): Promise<void> {
  const ts = timestamp ?? Date.now();
  const snapshot = await createActive(root, branch);
  const metaTx = snapshot.collections.metadata.insert([
    { key: "created_at", value: String(ts) },
    { key: "commit_hash", value: "e2e0000" },
    { key: "schema_version", value: "1" },
    { key: "model_id", value: "e2e-test" },
  ]);
  await metaTx.isPersisted.promise;
  if (scores.length > NONE) {
    const scoreTx = snapshot.collections.scores.insert(scores);
    await scoreTx.isPersisted.promise;
  }
  await closeSnapshot(snapshot);
}

/** Data collections for seeding a full snapshot with all unit types. */
type SeedData = {
  files?: FileRow[];
  functions?: FunctionRow[];
  types?: TypeRow[];
  directories?: DirectoryRow[];
  scores?: ScoreRow[];
  extraMetadata?: Array<{ key: string; value: string }>;
};

/**
 * Seeds an active snapshot with all collection types — files, functions,
 * types, directories, and scores. Used for `audit` e2e tests that need
 * a structurally valid tree.
 */
async function seedFullActiveSnapshot(
  root: string,
  branch: string,
  data: SeedData,
  timestamp?: number,
): Promise<void> {
  const ts = timestamp ?? Date.now();
  const snapshot = await createActive(root, branch);
  const metaTx = snapshot.collections.metadata.insert([
    { key: "created_at", value: String(ts) },
    { key: "commit_hash", value: "e2e0000" },
    { key: "schema_version", value: "1" },
    { key: "model_id", value: "e2e-test" },
  ]);
  await metaTx.isPersisted.promise;

  if (data.files && data.files.length > NONE) {
    const tx = snapshot.collections.files.insert(data.files);
    await tx.isPersisted.promise;
  }
  if (data.functions && data.functions.length > NONE) {
    const tx = snapshot.collections.functions.insert(data.functions);
    await tx.isPersisted.promise;
  }
  if (data.types && data.types.length > NONE) {
    const tx = snapshot.collections.types.insert(data.types);
    await tx.isPersisted.promise;
  }
  if (data.directories && data.directories.length > NONE) {
    const tx = snapshot.collections.directories.insert(data.directories);
    await tx.isPersisted.promise;
  }
  if (data.scores && data.scores.length > NONE) {
    const tx = snapshot.collections.scores.insert(data.scores);
    await tx.isPersisted.promise;
  }
  if (data.extraMetadata && data.extraMetadata.length > NONE) {
    const tx = snapshot.collections.metadata.insert(data.extraMetadata);
    await tx.isPersisted.promise;
  }

  await closeSnapshot(snapshot);
}

export {
  cleanupTmpRoot,
  createTmpRoot,
  extractJson,
  runCli,
  seedActiveSnapshot,
  seedFullActiveSnapshot,
  seedSnapshot,
};
export type { CliResult, SeedData };
