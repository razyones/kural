/**
 * The reader. Loads score cards from a snapshot database and filters
 * them by path prefix. It is the only module that queries persisted
 * scores — no other module reads ScoreRow data from disk.
 */

import {
  activePath,
  closeSnapshot,
  currentBranch,
  getHistorySnapshots,
  openSnapshot,
} from "../../db/snapshot.ts";
import type { ScoreRow } from "../../db/schemas.ts";

const NONE = 0;
const PREFIX_OFFSET = 1;

/** A loaded score card with parsed fields. @kuralPatterns scoreShape */
type LoadedScore = {
  key: string;
  kind: string;
  name: string;
  path: string;
  fit: number | null;
  uniqueness: number;
  score: number | null;
  childrenFit: number | null;
  childrenUniqueness: number | null;
  childrenScore: number | null;
  subtreeFit: number | null;
  subtreeUniqueness: number | null;
  subtreeScore: number | null;
  overallScore: number | null;
  worstPair: [string, string] | null;
  bestUncle: { name: string; score: number } | null;
};

/** Result from loading scores, including metadata. */
type ScoreQueryResult = {
  scores: LoadedScore[];
  branch: string;
  snapshotLabel: string;
};

/** Delta between two score snapshots for a single node. */
type ScoreDelta = {
  current: LoadedScore;
  overallDelta: number;
  selfDelta: number;
  childrenDelta: number;
  subtreeDelta: number;
};

/**
 * Extracts the path segment from a score key.
 * Keys are formatted as `kind:path` or `kind:path:name`.
 * @param key - the score key to extract the path from
 * @returns the path segment of the key
 * @kuralPatterns pathExtractor
 * @kuralPure
 */
function extractPath(key: string): string {
  const firstColon = key.indexOf(":");
  if (firstColon < NONE) {
    return key;
  }
  const rest = key.slice(firstColon + PREFIX_OFFSET);
  const kind = key.slice(NONE, firstColon);
  if (kind === "func" || kind === "type") {
    const lastColon = rest.lastIndexOf(":");
    if (lastColon > NONE) {
      return rest.slice(NONE, lastColon);
    }
  }
  return rest;
}

/**
 * Restores the closest-sibling pair from its stored JSON form so the score display can highlight the weakest separation.
 * @param raw - optional JSON string representing a two-element array
 * @returns a two-element tuple of strings, or null if input is missing or invalid
 * @kuralPure
 */
function parseWorstPair(raw?: string): [string, string] | null {
  if (raw === undefined || raw === "") {
    return null;
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    Array.isArray(parsed) &&
    typeof parsed[NONE] === "string" &&
    typeof parsed[PREFIX_OFFSET] === "string"
  ) {
    return [parsed[NONE], parsed[PREFIX_OFFSET]];
  }
  return null;
}

/**
 * Converts a ScoreRow into a LoadedScore with parsed fields.
 * @param row - the raw score row from the snapshot database
 * @returns a LoadedScore with parsed path, worst pair, and best uncle fields
 * @kuralPure
 */
function toLoadedScore(row: ScoreRow): LoadedScore {
  const path = extractPath(row.key);
  return {
    key: row.key,
    kind: row.kind,
    name: row.name,
    path,
    fit: row.fit ?? null,
    uniqueness: row.uniqueness,
    score: row.score ?? null,
    childrenFit: row.childrenFit ?? null,
    childrenUniqueness: row.childrenUniqueness ?? null,
    childrenScore: row.childrenScore ?? null,
    subtreeFit: row.subtreeFit ?? null,
    subtreeUniqueness: row.subtreeUniqueness ?? null,
    subtreeScore: row.subtreeScore ?? null,
    overallScore: row.overallScore ?? null,
    worstPair: parseWorstPair(row.worstPair),
    bestUncle:
      row.bestUncleName !== undefined && row.bestUncleScore !== undefined
        ? { name: row.bestUncleName, score: row.bestUncleScore }
        : null,
  };
}

/**
 * Resolves a snapshot database path from an optional snapshot ID.
 * Returns the active path if no ID is given.
 * @param root - absolute path to the project root
 * @param branch - current git branch name
 * @param snapshotId - optional snapshot identifier to look up
 * @returns the resolved database file path, or null if the snapshot was not found
 * @kuralPure
 */
function resolveSnapshotPath(root: string, branch: string, snapshotId?: string): string | null {
  if (snapshotId === undefined) {
    return activePath(root, branch);
  }
  const snapshots = getHistorySnapshots(root, branch);
  const match = snapshots.find((s) => s.snapshotId === snapshotId);
  return match?.path ?? null;
}

/**
 * Loads and filters scores from a snapshot database.
 * @param root - absolute path to the project root
 * @param pathFilter - optional absolute path prefix to filter scores by
 * @param snapshotId - optional snapshot identifier to load instead of the active snapshot
 * @returns a promise resolving to the filtered scores with branch and snapshot metadata
 * @kuralCauses reads snapshot database from disk
 */
async function loadScores(
  root: string,
  pathFilter?: string,
  snapshotId?: string,
): Promise<ScoreQueryResult> {
  const branch = currentBranch();
  const dbPath = resolveSnapshotPath(root, branch, snapshotId);
  if (dbPath === null) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const snapshot = await openSnapshot(dbPath);
  const all: LoadedScore[] = [];
  snapshot.collections.scores.forEach((row) => {
    all.push(toLoadedScore(row));
  });
  await closeSnapshot(snapshot);

  const filtered =
    pathFilter === undefined
      ? all
      : all.filter((s) => s.path.startsWith(pathFilter) || s.key.startsWith(`dir:${pathFilter}`));

  const snapshotLabel = snapshotId ?? "active";

  return { scores: filtered, branch, snapshotLabel };
}

/**
 * Computes deltas between current and comparison scores.
 * @param current - the current set of loaded scores
 * @param comparison - the previous set of loaded scores to compare against
 * @returns an array of ScoreDelta objects with numeric differences for each metric
 * @kuralPure
 */
function computeDeltas(current: LoadedScore[], comparison: LoadedScore[]): ScoreDelta[] {
  const compMap = new Map<string, LoadedScore>();
  for (const s of comparison) {
    compMap.set(s.key, s);
  }

  return current.map((c) => {
    const prev = compMap.get(c.key);
    const deltaN = (a: number | null, b: number | null): number => {
      if (a === null || b === null) {
        return NONE;
      }
      return a - b;
    };
    return {
      current: c,
      overallDelta: deltaN(c.overallScore, prev?.overallScore ?? null),
      selfDelta: deltaN(c.score, prev?.score ?? null),
      childrenDelta: deltaN(c.childrenScore, prev?.childrenScore ?? null),
      subtreeDelta: deltaN(c.subtreeFit, prev?.subtreeFit ?? null),
    };
  });
}

/**
 * Counts direct children of a node from the full score list.
 * @param target - the parent node to count children for
 * @param allScores - the full list of loaded scores to search
 * @returns the number of direct children of the target node
 * @kuralPure
 */
function countChildren(target: LoadedScore, allScores: LoadedScore[]): number {
  if (target.kind === "function" || target.kind === "type") {
    return NONE;
  }
  const targetPath = target.path;
  return allScores.filter((s) => {
    if (s.key === target.key) {
      return false;
    }
    if (target.kind === "file") {
      return (s.kind === "function" || s.kind === "type") && s.path === targetPath;
    }
    if (target.kind === "directory") {
      return (
        (s.kind === "file" || s.kind === "directory") &&
        s.path.startsWith(targetPath) &&
        !s.path.slice(targetPath.length + PREFIX_OFFSET).includes("/")
      );
    }
    return false;
  }).length;
}

export { computeDeltas, countChildren, extractPath, loadScores, parseWorstPair, toLoadedScore };
export type { LoadedScore, ScoreDelta, ScoreQueryResult };
